/**
 * Document service – API calls for document management.
 * Uses the authenticated Axios instance with credentials.
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
   * Do NOT set Content-Type header explicitly so browser sets multipart boundary correctly.
   */
  uploadDocuments: (files, onProgress) => {
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    return api.post('/documents/upload', formData, {
      headers: {
        'Content-Type': undefined, // Let Axios/browser automatically handle multipart/form-data boundary
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
   * Fetch PDF blob for inline preview.
   * Returns a local object URL to be used in iframe/embed.
   */
  getPreviewUrl: async (id) => {
    const response = await api.get(`/documents/${id}/preview`, {
      responseType: 'blob',
    })
    return URL.createObjectURL(response.data)
  },

  /**
   * Download PDF attachment preserving filename.
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
}

