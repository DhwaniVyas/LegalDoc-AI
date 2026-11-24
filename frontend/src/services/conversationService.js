/**
 * Conversation Service – API methods for Phase 7 multi-turn chat and conversation history.
 */
import api from '../lib/api'

export const conversationService = {
  /**
   * List all conversations of current user.
   */
  getConversations: () => {
    return api.get('/conversations').then((res) => res.data)
  },

  /**
   * Fetch conversation details with all ordered messages.
   */
  getConversation: (conversationId) => {
    return api.get(`/conversations/${conversationId}`).then((res) => res.data)
  },

  /**
   * Create a new conversation thread.
   */
  createConversation: ({ title, document_ids } = {}) => {
    return api
      .post('/conversations', {
        title: title || undefined,
        document_ids: document_ids || undefined,
      })
      .then((res) => res.data)
  },

  /**
   * Update conversation title or scoped document IDs.
   */
  updateConversation: (conversationId, { title, document_ids }) => {
    const payload = {}
    if (title !== undefined) payload.title = title
    if (document_ids !== undefined) payload.document_ids = document_ids
    return api.patch(`/conversations/${conversationId}`, payload).then((res) => res.data)
  },

  /**
   * Delete a conversation.
   */
  deleteConversation: (conversationId) => {
    return api.delete(`/conversations/${conversationId}`).then((res) => res.data)
  },

  /**
   * Send a message and wait for full JSON response.
   */
  sendMessage: (conversationId, { message, document_ids }) => {
    return api
      .post(`/conversations/${conversationId}/messages`, {
        message,
        document_ids: document_ids || undefined,
      })
      .then((res) => res.data)
  },

  /**
   * Send a message and stream the response progressively via SSE.
   * Handles user_message, sources, delta, done, and error events.
   */
  sendMessageStream: async (
    conversationId,
    { message, document_ids },
    { onUserMessage, onSources, onDelta, onDone, onError, signal } = {}
  ) => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
    const url = `${baseUrl}/conversations/${conversationId}/messages-stream`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        credentials: 'include',
        body: JSON.stringify({
          message,
          document_ids: document_ids || undefined,
        }),
        signal,
      })

      if (!response.ok) {
        let errorDetail = 'Failed to generate response'
        try {
          const errData = await response.json()
          errorDetail = errData.detail || errorDetail
        } catch {
          errorDetail = `Server error ${response.status}: ${response.statusText}`
        }
        if (onError) onError(new Error(errorDetail), response.status)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const evtBlock of events) {
          if (!evtBlock.trim()) continue
          const lines = evtBlock.split('\n')
          let eventName = 'message'
          let dataStr = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventName = line.substring(7).trim()
            } else if (line.startsWith('data: ')) {
              dataStr = line.substring(6)
            }
          }

          if (!dataStr) continue
          let parsedData = {}
          try {
            parsedData = JSON.parse(dataStr)
          } catch {
            parsedData = { text: dataStr }
          }

          if (eventName === 'user_message' && onUserMessage) {
            onUserMessage(parsedData)
          } else if (eventName === 'sources' && onSources) {
            onSources(parsedData.sources || [], parsedData.timings || {})
          } else if (eventName === 'delta' && onDelta) {
            onDelta(parsedData.text || '')
          } else if (eventName === 'done' && onDone) {
            onDone(parsedData)
          } else if (eventName === 'error' && onError) {
            onError(new Error(parsedData.detail || 'Streaming error'), parsedData.status_code || 500)
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError' && onError) {
        onError(err, 500)
      }
    }
  },
}

