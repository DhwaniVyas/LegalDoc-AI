"""
Gemini Service – Wrapper around the official Google GenAI SDK (google-genai).
Handles client lifecycle, model configuration, bounded exponential backoff retries with jitter,
and granular error categorization for transient (503/429/500/502/504) and permanent errors.
"""
import logging
import random
import threading
import time
from typing import Iterator, Optional

from google import genai
from google.genai import types, errors

from app.core.config import settings

logger = logging.getLogger(__name__)

_client_instance: Optional[genai.Client] = None
_client_lock = threading.Lock()

# Bounded retry configuration
MAX_TOTAL_ATTEMPTS = 4  # Total attempts including initial call
INITIAL_BACKOFF_SECONDS = 1.0
BACKOFF_EXP_BASE = 2.0
MAX_BACKOFF_SECONDS = 10.0
BACKOFF_JITTER_SECONDS = 0.5

RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}
NON_RETRYABLE_STATUS_CODES = {400, 401, 403, 404}


class GeminiServiceError(Exception):
    """Base exception for all Gemini service errors."""
    def __init__(self, message: str, status_code: int = 502, detail: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.detail = detail or message


class GeminiConfigurationError(GeminiServiceError):
    """Raised when GEMINI_API_KEY is missing or unconfigured."""
    def __init__(self, message: str = "GEMINI_API_KEY is not configured on the server."):
        super().__init__(
            message,
            status_code=503,
            detail="Gemini AI service is not configured. Please ensure GEMINI_API_KEY is set in your environment.",
        )


class GeminiAuthError(GeminiServiceError):
    """Raised when API key is invalid or lacks necessary permissions (401/403)."""
    def __init__(self, message: str = "Invalid or unauthorized Gemini API key."):
        super().__init__(
            message,
            status_code=401,
            detail="Authentication failed: Invalid or unauthorized Gemini API key.",
        )


class GeminiModelNotFoundError(GeminiServiceError):
    """Raised when the specified model is not found or no longer available (404)."""
    def __init__(self, model_name: str, message: Optional[str] = None):
        msg = message or f"Gemini model '{model_name}' was not found or is no longer available."
        super().__init__(
            msg,
            status_code=404,
            detail=f"The configured AI model '{model_name}' was not found or is no longer available. Please check GEMINI_MODEL.",
        )


class GeminiRateLimitError(GeminiServiceError):
    """Raised when quota is exceeded or rate limit hit (429)."""
    def __init__(self, message: str = "Gemini rate limit or quota exceeded."):
        super().__init__(
            message,
            status_code=429,
            detail="Gemini AI rate limit or quota exceeded. Please wait a moment and try again.",
        )


class GeminiUnavailableError(GeminiServiceError):
    """Raised when Gemini service is temporarily overloaded or unavailable (503)."""
    def __init__(self, message: str = "Gemini service is temporarily unavailable or experiencing high demand."):
        super().__init__(
            message,
            status_code=503,
            detail="The Gemini AI service is currently experiencing high demand. Please try again shortly.",
        )


class GeminiTimeoutError(GeminiServiceError):
    """Raised when network request times out (504)."""
    def __init__(self, message: str = "Gemini request timed out."):
        super().__init__(
            message,
            status_code=504,
            detail="The Gemini AI service request timed out. Please try again.",
        )


class GeminiAPIError(GeminiServiceError):
    """Raised for general/unclassified Gemini API errors (502)."""
    def __init__(self, message: str, status_code: int = 502, detail: Optional[str] = None):
        super().__init__(
            message,
            status_code=status_code,
            detail=detail or "Error communicating with the Gemini AI service. Please try again shortly.",
        )


def _extract_retry_after(error: Exception) -> Optional[float]:
    """Extract Retry-After header in seconds from API response if present."""
    response = getattr(error, "response", None)
    if response and hasattr(response, "headers"):
        retry_val = response.headers.get("retry-after") or response.headers.get("Retry-After")
        if retry_val:
            try:
                seconds = float(retry_val)
                if seconds > 0:
                    return min(seconds, 30.0)
            except (ValueError, TypeError):
                pass
    return None


def _calculate_backoff_delay(
    attempt: int,
    retry_after: Optional[float] = None,
) -> float:
    """
    Calculate bounded exponential backoff delay with random jitter.
    Respects retry_after if provided by the remote server.
    """
    if retry_after is not None and retry_after > 0:
        return min(retry_after + random.uniform(0, BACKOFF_JITTER_SECONDS), MAX_BACKOFF_SECONDS)

    raw_delay = INITIAL_BACKOFF_SECONDS * (BACKOFF_EXP_BASE ** (attempt - 1))
    delay = min(raw_delay, MAX_BACKOFF_SECONDS)
    delay += random.uniform(0, BACKOFF_JITTER_SECONDS)
    return min(delay, MAX_BACKOFF_SECONDS)


def _is_transient_error(e: Exception) -> bool:
    """Determine whether an error is temporary/retryable."""
    if isinstance(e, (TimeoutError, ConnectionError)):
        return True

    if isinstance(e, errors.APIError):
        code = getattr(e, "code", None)
        if code in NON_RETRYABLE_STATUS_CODES:
            return False
        if code in RETRYABLE_STATUS_CODES:
            return True
        err_msg = str(e).lower()
        if any(term in err_msg for term in ["unavailable", "high demand", "deadline", "timed out", "timeout", "resource_exhausted", "quota", "overloaded"]):
            return True
        return False

    err_str = str(e).lower()
    if any(term in err_str for term in ["timeout", "timed out", "connection reset", "connection refused", "503", "unavailable"]):
        return True

    return False


def _raise_categorized_gemini_error(exc: Exception, model_name: str, attempts: int = 1):
    """Maps exceptions into specific, typed GeminiServiceError subclasses."""
    if isinstance(exc, GeminiServiceError):
        raise exc

    if isinstance(exc, errors.APIError):
        code = getattr(exc, "code", None)
        err_msg = str(exc)

        # Permanent authentication / authorization error
        if code in (401, 403) or "API_KEY_INVALID" in err_msg or "PERMISSION_DENIED" in err_msg or "UNAUTHENTICATED" in err_msg:
            raise GeminiAuthError(f"Gemini authentication failed: {err_msg}")

        # Model not found / unavailable
        elif code == 404 or "NOT_FOUND" in err_msg or "is not found" in err_msg or "no longer available" in err_msg:
            raise GeminiModelNotFoundError(
                model_name=model_name,
                message=f"Gemini model '{model_name}' not found: {err_msg}",
            )

        # Rate limit or quota exhaustion (429)
        elif code == 429 or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower() or "rate limit" in err_msg.lower():
            raise GeminiRateLimitError(f"Gemini rate limit or quota exceeded after {attempts} attempts: {err_msg}")

        # Service unavailable / high demand (503)
        elif code == 503 or "UNAVAILABLE" in err_msg or "high demand" in err_msg.lower():
            raise GeminiUnavailableError(
                f"Gemini service unavailable after {attempts} attempts: {err_msg}"
            )

        # Timeout / deadline exceeded (504)
        elif code in (408, 504) or "deadline" in err_msg.lower() or "timeout" in err_msg.lower() or "timed out" in err_msg.lower():
            raise GeminiTimeoutError(f"Gemini request timed out after {attempts} attempts: {err_msg}")

        # Other API errors (500, 502, etc.)
        else:
            raise GeminiAPIError(f"Gemini API returned an error after {attempts} attempts: {err_msg}", status_code=502)

    if isinstance(exc, TimeoutError):
        raise GeminiTimeoutError(f"Gemini request timed out after {attempts} attempts: {str(exc)}")

    err_str = str(exc)
    if "timeout" in err_str.lower() or "timed out" in err_str.lower():
        raise GeminiTimeoutError(f"Gemini request timed out after {attempts} attempts: {err_str}")

    raise GeminiAPIError(f"Failed to generate answer from Gemini after {attempts} attempts: {err_str}", status_code=502)


def get_gemini_client() -> genai.Client:
    """
    Get or create thread-safe singleton Gemini Client.
    Validates that GEMINI_API_KEY is configured.
    Configures SDK with attempts=1 to prevent SDK-level retry multiplication,
    relying on application-level bounded exponential backoff.
    """
    global _client_instance
    if not settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY.strip():
        raise GeminiConfigurationError(
            "GEMINI_API_KEY is not configured on the server. Please set it in your environment."
        )

    if _client_instance is None:
        with _client_lock:
            if _client_instance is None:
                try:
                    logger.info("Initializing Google GenAI Client with model: %s", settings.GEMINI_MODEL)
                    # Set attempts=1 in SDK so retries are exclusively managed at the application layer
                    http_options = types.HttpOptions(
                        retry_options=types.HttpRetryOptions(attempts=1),
                    )
                    _client_instance = genai.Client(
                        api_key=settings.GEMINI_API_KEY.strip(),
                        http_options=http_options,
                    )
                except Exception as e:
                    logger.error("Failed to initialize Google GenAI Client: %s", e)
                    raise GeminiConfigurationError(f"Failed to initialize Gemini client: {str(e)}")
    return _client_instance


def generate_content(
    prompt: str,
    system_instruction: Optional[str] = None,
    model: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> str:
    """
    Send prompt and system instruction to Gemini with bounded exponential backoff retries.

    Features:
    - Bounded to maximum 4 total attempts.
    - Exponential backoff with jitter (1s, 2s, 4s, capped at 10s).
    - Respects Retry-After headers if returned by the API.
    - Retries transient errors only (503, 502, 500, 504, 408, 429, timeouts).
    - Fails immediately on permanent errors (400, 401, 403, 404).
    - Raises typed GeminiServiceError subclasses with user-friendly error messages.

    Args:
        prompt: User context and question prompt.
        system_instruction: System prompt enforcing legal grounding and strict citation rules.
        model: Optional model override (defaults to settings.GEMINI_MODEL).
        timeout_seconds: Optional timeout (defaults to settings.GEMINI_TIMEOUT_SECONDS).

    Returns:
        Generated answer text string.

    Raises:
        GeminiServiceError and subclasses based on the specific failure cause.
    """
    client = get_gemini_client()
    model_name = model or settings.GEMINI_MODEL or "gemini-3.8-flash"

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=0.2,       # Low temperature for factual grounding
        top_p=0.95,
        max_output_tokens=8192,
    )

    last_error: Optional[Exception] = None

    for attempt in range(1, MAX_TOTAL_ATTEMPTS + 1):
        try:
            logger.info(
                "Calling Gemini model '%s' for RAG answer generation (attempt %d/%d)",
                model_name,
                attempt,
                MAX_TOTAL_ATTEMPTS,
            )
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config,
            )

            if not response or not response.text:
                logger.warning("Gemini returned an empty response on attempt %d/%d", attempt, MAX_TOTAL_ATTEMPTS)
                return ""

            return response.text.strip()

        except Exception as exc:
            last_error = exc
            is_transient = _is_transient_error(exc)
            code = getattr(exc, "code", None)
            err_msg = str(exc)

            # Permanent failure: do not retry, fail immediately
            if not is_transient:
                logger.error(
                    "Gemini non-retryable error on attempt %d/%d (code: %s, model: %s): %s",
                    attempt,
                    MAX_TOTAL_ATTEMPTS,
                    code,
                    model_name,
                    err_msg,
                )
                _raise_categorized_gemini_error(exc, model_name=model_name, attempts=attempt)

            # Transient failure but reached maximum attempts: fail with categorized error
            if attempt >= MAX_TOTAL_ATTEMPTS:
                logger.error(
                    "Gemini transient error retries exhausted after %d attempts (code: %s, model: %s): %s",
                    attempt,
                    code,
                    model_name,
                    err_msg,
                )
                _raise_categorized_gemini_error(exc, model_name=model_name, attempts=attempt)

            # Transient failure with remaining attempts: calculate delay and back off
            retry_after = _extract_retry_after(exc)
            delay = _calculate_backoff_delay(attempt, retry_after=retry_after)
            logger.warning(
                "Gemini transient error on attempt %d/%d (code: %s, model: %s): %s. Retrying in %.2fs...",
                attempt,
                MAX_TOTAL_ATTEMPTS,
                code,
                model_name,
                err_msg,
                delay,
            )
            time.sleep(delay)

    # Fallback if loop ends unexpectedly
    if last_error:
        _raise_categorized_gemini_error(last_error, model_name=model_name, attempts=MAX_TOTAL_ATTEMPTS)
    raise GeminiAPIError("Failed to generate answer from Gemini after retries.", status_code=502)


def generate_content_stream(
    prompt: str,
    system_instruction: Optional[str] = None,
    model: Optional[str] = None,
    timeout_seconds: Optional[int] = None,
) -> Iterator[str]:
    """
    Stream answer tokens progressively from Gemini with bounded exponential backoff on initial connection.
    Yields text chunks as they arrive.
    """
    client = get_gemini_client()
    model_name = model or settings.GEMINI_MODEL or "gemini-3.8-flash"

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=0.2,
        top_p=0.95,
        max_output_tokens=8192,
    )

    last_error: Optional[Exception] = None

    for attempt in range(1, MAX_TOTAL_ATTEMPTS + 1):
        try:
            logger.info(
                "Streaming from Gemini model '%s' (attempt %d/%d)",
                model_name,
                attempt,
                MAX_TOTAL_ATTEMPTS,
            )
            stream = client.models.generate_content_stream(
                model=model_name,
                contents=prompt,
                config=config,
            )
            for chunk in stream:
                if chunk and chunk.text:
                    yield chunk.text
            return

        except Exception as exc:
            last_error = exc
            is_transient = _is_transient_error(exc)
            code = getattr(exc, "code", None)
            err_msg = str(exc)

            if not is_transient:
                logger.error(
                    "Gemini non-retryable streaming error on attempt %d/%d (code: %s, model: %s): %s",
                    attempt,
                    MAX_TOTAL_ATTEMPTS,
                    code,
                    model_name,
                    err_msg,
                )
                _raise_categorized_gemini_error(exc, model_name=model_name, attempts=attempt)

            if attempt >= MAX_TOTAL_ATTEMPTS:
                logger.error(
                    "Gemini transient streaming error retries exhausted after %d attempts (code: %s): %s",
                    attempt,
                    code,
                    err_msg,
                )
                _raise_categorized_gemini_error(exc, model_name=model_name, attempts=attempt)

            retry_after = _extract_retry_after(exc)
            delay = _calculate_backoff_delay(attempt, retry_after=retry_after)
            logger.warning(
                "Gemini transient streaming error on attempt %d/%d (code: %s): %s. Retrying in %.2fs...",
                attempt,
                MAX_TOTAL_ATTEMPTS,
                code,
                err_msg,
                delay,
            )
            time.sleep(delay)

    if last_error:
        _raise_categorized_gemini_error(last_error, model_name=model_name, attempts=MAX_TOTAL_ATTEMPTS)
    raise GeminiAPIError("Failed to stream answer from Gemini after retries.", status_code=502)

