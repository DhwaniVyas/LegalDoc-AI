import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, FileText, AlertCircle, Loader2, HardDrive, Calendar, Sparkles } from 'lucide-react'
import { documentService, formatFileSize, formatDate } from '../services/documentService'
import LoadingSpinner from '../components/LoadingSpinner'

export default function DocumentPreview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pageParam = searchParams.get('page')

  const [document, setDocument] = useState(null)
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let activeBlobUrl = null
    let isMounted = true

    const loadDocumentAndPreview = async () => {
      setLoading(true)
      setError('')
      try {
        // Fetch metadata and PDF blob concurrently
        const [meta, url] = await Promise.all([
          documentService.getDocument(id),
          documentService.getPreviewUrl(id),
        ])

        if (isMounted) {
          setDocument(meta)
          setBlobUrl(url)
          activeBlobUrl = url
        }
      } catch (err) {
        if (isMounted) {
          const status = err.response?.status
          if (status === 404 || status === 403) {
            setError('Document not found or you do not have permission to view it.')
          } else {
            setError(err.response?.data?.detail || 'Failed to load PDF preview. Please try again.')
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadDocumentAndPreview()

    return () => {
      isMounted = false
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl)
      }
    }
  }, [id])

  const handleDownload = async () => {
    if (!document) return
    setDownloading(true)
    try {
      await documentService.downloadDocument(document.id, document.original_filename)
    } catch {
      alert('Failed to download document.')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <LoadingSpinner message="Loading document preview..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <div className="card p-8">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Unable to Preview</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <Link to="/documents" className="btn-primary inline-flex">
            <ArrowLeft size={16} />
            Back to Documents
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Top action bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate('/documents')}
            className="btn-ghost p-2 text-slate-600 hover:text-slate-900"
            title="Back to Documents"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center text-navy-700 shrink-0">
            <FileText size={18} />
          </div>

          <div className="min-w-0">
            <h1
              className="text-sm font-semibold text-slate-900 truncate max-w-lg"
              title={document?.original_filename}
            >
              {document?.original_filename}
            </h1>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <HardDrive size={11} />
                {formatFileSize(document?.file_size)}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {formatDate(document?.created_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {document && (
            <Link
              to={`/ask?document_id=${document.id}`}
              className="btn-secondary inline-flex items-center gap-1.5 text-xs py-2 px-3 text-navy-700 hover:text-navy-900 border-navy-200"
              title="Ask questions grounded in this document"
            >
              <Sparkles size={14} className="text-navy-600" />
              <span>Ask AI</span>
            </Link>
          )}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="btn-primary"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Embedded PDF viewer */}
      <div className="flex-1 p-4 overflow-hidden flex flex-col">
        {blobUrl ? (
          <iframe
            src={pageParam ? `${blobUrl}#page=${pageParam}` : blobUrl}
            title={document?.original_filename || 'PDF Preview'}
            className="w-full h-full rounded-xl border border-slate-200 bg-white shadow-sm"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            No preview available.
          </div>
        )}
      </div>
    </div>
  )
}

