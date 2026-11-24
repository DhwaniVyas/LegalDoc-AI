/**
 * Document service – API calls for document management, processing, and chunk inspection.
 */
import api from '../lib/api'

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  if (!bytes) return '—'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export const formatDate = (dateString) => {
  if (!dateString) return '—'
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(date)
}

export const documentService = {
  /**
   * Upload multiple PDF files (up to 5).
   */
  uploadDocuments: (files, onProgress) => {
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    return api.post('/documents/upload', formData, {
      headers: {
        'Content-Type': undefined,
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          )
          onProgress(percentCompleted)
        }
      },
    }).then((res) => res.data)
  },

  /**
   * List user's documents with pagination and search.
   */
  getDocuments: ({ page = 1, pageSize = 10, search = '' } = {}) => {
    const params = { page, page_size: pageSize }
    if (search && search.trim()) {
      params.search = search.trim()
    }
    return api.get('/documents', { params }).then((res) => res.data)
  },

  /**
   * Get single document metadata.
   */
  getDocument: (id) => {
    return api.get(`/documents/${id}`).then((res) => res.data)
  },

  /**
   * Reprocess document text extraction and chunking.
   */
  reprocessDocument: (id) => {
    return api.post(`/documents/${id}/process`).then((res) => res.data)
  },

  /**
   * Inspect extracted pages and chunks for a document.
   */
  getDocumentInspection: (id) => {
    return api.get(`/documents/${id}/inspection`).then((res) => res.data)
  },

  /**
   * Get extracted pages only.
   */
  getDocumentPages: (id) => {
    return api.get(`/documents/${id}/pages`).then((res) => res.data)
  },

  /**
   * Get extracted chunks only.
   */
  getDocumentChunks: (id) => {
    return api.get(`/documents/${id}/chunks`).then((res) => res.data)
  },

  /**
   * Fetch PDF blob for inline preview.
   */
  getPreviewUrl: async (id) => {
    const response = await api.get(`/documents/${id}/preview`, {
      responseType: 'blob',
    })
    return URL.createObjectURL(response.data)
  },

  /**
   * Download PDF attachment.
   */
  downloadDocument: async (id, filename) => {
    const response = await api.get(`/documents/${id}/download`, {
      responseType: 'blob',
    })
    const blobUrl = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename || 'document.pdf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(blobUrl)
  },

  /**
   * Delete a document.
   */
  deleteDocument: (id) => {
    return api.delete(`/documents/${id}`).then((res) => res.data)
  },

  /**
   * Trigger vector embedding generation and indexing for a document.
   */
  embedDocument: (id) => {
    return api.post(`/documents/${id}/embed`).then((res) => res.data)
  },

  /**
   * Perform semantic vector search over user's document chunks.
   */
  searchSemantic: ({ query, documentId = null, topK = 5 } = {}) => {
    return api.post('/search/semantic', {
      query,
      document_id: documentId || null,
      top_k: Number(topK) || 5,
    }).then((res) => res.data)
  },

  /**
   * Ask grounded question via Gemini RAG pipeline.
   */
  askQuestion: ({ question, documentId = null } = {}) => {
    return api.post('/qa/ask', {
      question,
      document_id: documentId || null,
    }).then((res) => res.data)
  },
}
