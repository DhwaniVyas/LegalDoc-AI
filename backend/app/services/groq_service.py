"""
Groq Service – Official OpenAI-compatible client integration for Groq API.
Handles client lifecycle, model configuration (openai/gpt-oss-120b),
bounded exponential backoff retries, and comprehensive error categorization.
"""
import logging
import random
import re
import threading
import time
from typing import Iterator, Optional

from openai import (
    APIConnectionError,
    APIError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    InternalServerError,
    NotFoundError,
    OpenAI,
    PermissionDeniedError,
    RateLimitError,
)

from app.core.config import settings

logger = logging.getLogger(__name__)

_client_instance: Optional[OpenAI] = None
_client_lock = threading.Lock()

# Bounded retry configuration for transient network/server errors
MAX_TOTAL_ATTEMPTS = 3
INITIAL_BACKOFF_SECONDS = 1.0
BACKOFF_EXP_BASE = 2.0
MAX_BACKOFF_SECONDS = 8.0
BACKOFF_JITTER_SECONDS = 0.5

RETRYABLE_STATUS_CODES = {408, 500, 502, 503, 504}
NON_RETRYABLE_STATUS_CODES = {400, 401, 403, 404}


class GroqServiceError(Exception):
    """Base exception for all Groq service errors."""
    def __init__(self, message: str, status_code: int = 502, detail: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.detail = detail or message


class GroqConfigurationError(GroqServiceError):
    """Raised when GROQ_API_KEY is missing or unconfigured."""
    def __init__(self, message: str = "GROQ_API_KEY is not configured on the server."):
        super().__init__(
            message,
            status_code=503,
            detail="Groq AI service is not configured. Please ensure GROQ_API_KEY is set in your environment.",
        )


class GroqAuthError(GroqServiceError):
    """Raised when API key is invalid or unauthorized (401)."""
    def __init__(self, message: str = "Invalid or unauthorized Groq API key."):
        super().__init__(
            message,
            status_code=401,
            detail="Authentication failed: Invalid or unauthorized Groq API key. Please check your GROQ_API_KEY.",
        )


class GroqPermissionError(GroqServiceError):
    """Raised when access is forbidden or permissions are missing (403)."""
    def __init__(self, message: str = "Access forbidden with current Groq credentials."):
        super().__init__(
            message,
            status_code=403,
            detail="Access forbidden: Your Groq API key does not have permission for the requested resource or model.",
        )


class GroqModelNotFoundError(GroqServiceError):
    """Raised when the specified model is not found or unavailable (404)."""
    def __init__(self, model_name: str, message: Optional[str] = None):
        msg = message or f"Groq model '{model_name}' was not found or is unavailable."
        super().__init__(
            msg,
            status_code=404,
            detail=f"The configured AI model '{model_name}' was not found or is not available on Groq. Please check GROQ_MODEL.",
        )


class GroqRateLimitError(GroqServiceError):
    """Raised when quota is exceeded or rate limit hit (429)."""
    def __init__(self, message: str = "Groq rate limit or quota exceeded.", retry_after: Optional[float] = None):
        detail = "Groq AI rate limit or quota exceeded. Please wait a moment and try again."
        if retry_after and retry_after > 0:
            detail = f"Groq developer quota or rate limit exceeded. Please retry after {int(retry_after)} seconds."
        super().__init__(
            message,
            status_code=429,
            detail=detail,
        )
        self.retry_after = retry_after


class GroqUnavailableError(GroqServiceError):
    """Raised when Groq service is overloaded or unavailable (503/502/500)."""
    def __init__(self, message: str = "Groq service is temporarily unavailable."):
        super().__init__(
            message,
            status_code=503,
            detail="The Groq AI service is currently experiencing high demand or temporary downtime. Please try again shortly.",
        )


class GroqTimeoutError(GroqServiceError):
    """Raised when network request times out (504)."""
    def __init__(self, message: str = "Groq request timed out."):
        super().__init__(
            message,
            status_code=504,
            detail="The Groq AI service request timed out. Please try again.",
        )


class GroqAPIError(GroqServiceError):
    """General provider failure."""
    def __init__(self, message: str = "Groq API returned an error.", status_code: int = 502):
        super().__init__(
            message,
            status_code=status_code,
            detail=f"Groq API error: {message}",
        )


def _extract_retry_after(exc: Exception) -> Optional[float]:
    """Extract retry-after duration from HTTP headers or error message."""
    # Check response headers if present on APIStatusError
    if isinstance(exc, APIStatusError) and getattr(exc, "response", None) is not None:
        headers = getattr(exc.response, "headers", {})
        val = headers.get("retry-after") or headers.get("Retry-After")
        if val:
            try:
                seconds = float(val)
                if seconds > 0:
                    return min(seconds, 60.0)
            except (ValueError, TypeError):
                pass

    # Fallback to regex extraction from error text, e.g. "try again in 14.5s" or "try again in 14s"
    err_str = str(exc)
    match = re.search(r"try again in (\d+(?:\.\d+)?)\s*s", err_str, re.IGNORECASE)
    if match:
        try:
            return float(match.group(1))
        except (ValueError, TypeError):
            pass

    return None


def _calculate_backoff_delay(attempt: int, retry_after: Optional[float] = None) -> float:
    """Calculate bounded exponential backoff delay with jitter."""
    if retry_after is not None and retry_after > 0:
        return min(retry_after + random.uniform(0, BACKOFF_JITTER_SECONDS), MAX_BACKOFF_SECONDS)

    raw_delay = INITIAL_BACKOFF_SECONDS * (BACKOFF_EXP_BASE ** (attempt - 1))
    delay = min(raw_delay, MAX_BACKOFF_SECONDS)
    delay += random.uniform(0, BACKOFF_JITTER_SECONDS)
    return min(delay, MAX_BACKOFF_SECONDS)


def _is_transient_error(exc: Exception) -> bool:
    """Determine whether an error is temporary and safe to retry."""
    if isinstance(exc, (APITimeoutError, TimeoutError, APIConnectionError, ConnectionError)):
        return True

    if isinstance(exc, InternalServerError):
        return True

    if isinstance(exc, APIStatusError):
        code = getattr(exc, "status_code", None)
        if code in NON_RETRYABLE_STATUS_CODES:
            return False
        if code in RETRYABLE_STATUS_CODES:
            return True
        return False

    err_str = str(exc).lower()
    if any(k in err_str for k in ["timeout", "timed out", "connection reset", "503", "502", "504", "overloaded"]):
        return True

    return False


def _raise_categorized_groq_error(exc: Exception, model_name: str, attempts: int = 1):
    """Maps exceptions into specific, typed GroqServiceError subclasses."""
    if isinstance(exc, GroqServiceError):
        raise exc

    if isinstance(exc, AuthenticationError):
        raise GroqAuthError(f"Groq authentication failed: {str(exc)}")

    if isinstance(exc, PermissionDeniedError):
        raise GroqPermissionError(f"Groq permission denied: {str(exc)}")

    if isinstance(exc, NotFoundError):
        raise GroqModelNotFoundError(model_name=model_name, message=f"Groq model '{model_name}' not found: {str(exc)}")

    if isinstance(exc, RateLimitError):
        retry_after = _extract_retry_after(exc)
        raise GroqRateLimitError(
            message=f"Groq rate limit or quota exceeded after {attempts} attempts: {str(exc)}",
            retry_after=retry_after,
        )

    if isinstance(exc, (APITimeoutError, TimeoutError)):
        raise GroqTimeoutError(f"Groq request timed out after {attempts} attempts: {str(exc)}")

    if isinstance(exc, (InternalServerError, APIConnectionError)):
        raise GroqUnavailableError(f"Groq service unavailable or connection failed after {attempts} attempts: {str(exc)}")

    if isinstance(exc, APIStatusError):
        code = getattr(exc, "status_code", 502)
        if code == 401:
            raise GroqAuthError(str(exc))
        elif code == 403:
            raise GroqPermissionError(str(exc))
        elif code == 404:
            raise GroqModelNotFoundError(model_name=model_name, message=str(exc))
        elif code == 429:
            retry_after = _extract_retry_after(exc)
            raise GroqRateLimitError(str(exc), retry_after=retry_after)
        elif code in (500, 502, 503):
            raise GroqUnavailableError(f"Groq service returned {code}: {str(exc)}")
        elif code == 504:
            raise GroqTimeoutError(str(exc))
        else:
            raise GroqAPIError(str(exc), status_code=code)

    err_str = str(exc)
    if "api key" in err_str.lower() and "invalid" in err_str.lower():
        raise GroqAuthError(err_str)
    if "rate limit" in err_str.lower() or "quota" in err_str.lower():
        raise GroqRateLimitError(err_str, retry_after=_extract_retry_after(exc))

    raise GroqAPIError(f"Failed to generate answer from Groq: {err_str}", status_code=502)


def get_groq_client() -> OpenAI:
    """
    Get or create thread-safe singleton OpenAI client configured for Groq API.
    Validates that GROQ_API_KEY is present and not empty.
    """
    global _client_instance
    api_key = settings.GROQ_API_KEY.strip() if settings.GROQ_API_KEY else ""

    if not api_key:
        raise GroqConfigurationError(
            "GROQ_API_KEY is not configured on the server. Please set GROQ_API_KEY in your environment."
        )

    if _client_instance is None:
        with _client_lock:
            if _client_instance is None:
                try:
                    logger.info("Initializing Groq client (base_url=%s, model=%s)", settings.GROQ_BASE_URL, settings.GROQ_MODEL)
                    _client_instance = OpenAI(
                        api_key=api_key,
                        base_url=settings.GROQ_BASE_URL,
                        timeout=float(settings.GROQ_TIMEOUT_SECONDS),
                        max_retries=settings.GROQ_MAX_RETRIES,
                    )
                except Exception as e:
                    logger.error("Failed to initialize Groq client: %s", e)
                    raise GroqConfigurationError(f"Failed to initialize Groq client: {str(e)}")
    return _client_instance


def generate_content(
    prompt: str,
    system_instruction: Optional[str] = None,
    model: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> str:
    """
    Generate grounded legal answer using Groq Chat Completions API with bounded retries.
    """
    client = get_groq_client()
    model_name = model or settings.GROQ_MODEL or "openai/gpt-oss-120b"

    messages = []
    if system_instruction and system_instruction.strip():
        messages.append({"role": "system", "content": system_instruction.strip()})
    messages.append({"role": "user", "content": prompt.strip()})

    last_error: Optional[Exception] = None

    for attempt in range(1, MAX_TOTAL_ATTEMPTS + 1):
        try:
            logger.info("Calling Groq model '%s' for RAG answer generation (attempt %d/%d)", model_name, attempt, MAX_TOTAL_ATTEMPTS)
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.2,
                max_tokens=4096,
                timeout=float(timeout_seconds or settings.GROQ_TIMEOUT_SECONDS),
            )

            if not response.choices or not response.choices[0].message:
                raise GroqAPIError("Groq returned an empty response with no choices.")

            content = response.choices[0].message.content or ""
            return content.strip()

        except Exception as exc:
            last_error = exc
            is_transient = _is_transient_error(exc)
            err_msg = str(exc)

            if not is_transient:
                logger.error("Groq non-retryable error on attempt %d/%d (model: %s): %s", attempt, MAX_TOTAL_ATTEMPTS, model_name, err_msg)
                _raise_categorized_groq_error(exc, model_name=model_name, attempts=attempt)

            if attempt >= MAX_TOTAL_ATTEMPTS:
                logger.error("Groq retries exhausted after %d attempts: %s", attempt, err_msg)
                _raise_categorized_groq_error(exc, model_name=model_name, attempts=attempt)

            retry_after = _extract_retry_after(exc)
            delay = _calculate_backoff_delay(attempt, retry_after=retry_after)
            logger.warning("Groq transient error on attempt %d/%d: %s. Retrying in %.2fs...", attempt, MAX_TOTAL_ATTEMPTS, err_msg, delay)
            time.sleep(delay)

    if last_error:
        _raise_categorized_groq_error(last_error, model_name=model_name, attempts=MAX_TOTAL_ATTEMPTS)
    raise GroqAPIError("Failed to generate answer from Groq after retries.", status_code=502)


def generate_content_stream(
    prompt: str,
    system_instruction: Optional[str] = None,
    model: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> Iterator[str]:
    """
    Stream tokens progressively from Groq Chat Completions API with stream=True.
    Yields text delta chunks as they arrive.
    """
    client = get_groq_client()
    model_name = model or settings.GROQ_MODEL or "openai/gpt-oss-120b"

    messages = []
    if system_instruction and system_instruction.strip():
        messages.append({"role": "system", "content": system_instruction.strip()})
    messages.append({"role": "user", "content": prompt.strip()})

    last_error: Optional[Exception] = None

    for attempt in range(1, MAX_TOTAL_ATTEMPTS + 1):
        try:
            logger.info("Streaming from Groq model '%s' (attempt %d/%d)", model_name, attempt, MAX_TOTAL_ATTEMPTS)
            stream = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.2,
                max_tokens=4096,
                stream=True,
                timeout=float(timeout_seconds or settings.GROQ_TIMEOUT_SECONDS),
            )

            for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta and delta.content:
                        yield delta.content
            return

        except Exception as exc:
            last_error = exc
            is_transient = _is_transient_error(exc)
            err_msg = str(exc)

            if not is_transient:
                logger.error("Groq non-retryable streaming error on attempt %d/%d (model: %s): %s", attempt, MAX_TOTAL_ATTEMPTS, model_name, err_msg)
                _raise_categorized_groq_error(exc, model_name=model_name, attempts=attempt)

            if attempt >= MAX_TOTAL_ATTEMPTS:
                logger.error("Groq streaming retries exhausted after %d attempts: %s", attempt, err_msg)
                _raise_categorized_groq_error(exc, model_name=model_name, attempts=attempt)

            retry_after = _extract_retry_after(exc)
            delay = _calculate_backoff_delay(attempt, retry_after=retry_after)
            logger.warning("Groq transient streaming error on attempt %d/%d: %s. Retrying in %.2fs...", attempt, MAX_TOTAL_ATTEMPTS, err_msg, delay)
            time.sleep(delay)

    if last_error:
        _raise_categorized_groq_error(last_error, model_name=model_name, attempts=MAX_TOTAL_ATTEMPTS)
    raise GroqAPIError("Failed to stream answer from Groq after retries.", status_code=502)

