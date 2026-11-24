import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  FileText,
  AlertCircle,
  Loader2,
  HardDrive,
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  AlignLeft,
} from 'lucide-react'
import { documentService, formatFileSize, formatDate } from '../services/documentService'
import LoadingSpinner from '../components/LoadingSpinner'

export default function DocumentPreview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialPage = parseInt(searchParams.get('page'), 10) || 1
  const citationParam = searchParams.get('citation')

  const [document, setDocument] = useState(null)
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  // PDF Page Navigation state
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [totalPages, setTotalPages] = useState(1)
  const [pageInput, setPageInput] = useState(String(initialPage))
  const [showPageText, setShowPageText] = useState(false)
  const [pageTextData, setPageTextData] = useState(null)
  const [loadingPageText, setLoadingPageText] = useState(false)

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
          const total = meta.total_pages || 1
          setTotalPages(total)
          const validInitial = Math.min(Math.max(1, initialPage), total)
          setCurrentPage(validInitial)
          setPageInput(String(validInitial))
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

  // Update page text when showPageText is toggled or currentPage changes
  useEffect(() => {
    if (!showPageText || !id) return
    let isMounted = true
    setLoadingPageText(true)
    documentService
      .getDocumentPage(id, currentPage)
      .then((data) => {
        if (isMounted) setPageTextData(data)
      })
      .catch(() => {
        if (isMounted) setPageTextData(null)
      })
      .finally(() => {
        if (isMounted) setLoadingPageText(false)
      })
    return () => {
      isMounted = false
    }
  }, [showPageText, currentPage, id])

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const next = currentPage - 1
      setCurrentPage(next)
      setPageInput(String(next))
      setSearchParams({ page: String(next), ...(citationParam ? { citation: citationParam } : {}) })
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      const next = currentPage + 1
      setCurrentPage(next)
      setPageInput(String(next))
      setSearchParams({ page: String(next), ...(citationParam ? { citation: citationParam } : {}) })
    }
  }

  const handlePageInputSubmit = (e) => {
    e.preventDefault()
    const p = parseInt(pageInput, 10)
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      setCurrentPage(p)
      setSearchParams({ page: String(p), ...(citationParam ? { citation: citationParam } : {}) })
    } else {
      setPageInput(String(currentPage))
    }
  }

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
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0 shadow-xs">
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
            <div className="flex items-center gap-2">
              <h1
                className="text-sm font-semibold text-slate-900 truncate max-w-lg"
                title={document?.original_filename}
              >
                {document?.original_filename}
              </h1>
              {citationParam && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-navy-100 text-navy-800 px-2 py-0.5 rounded border border-navy-200">
                  <BookOpen size={11} /> [{citationParam}]
                </span>
              )}
            </div>
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
              <span>·</span>
              <span>{totalPages} Total Pages</span>
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

      {/* PDF Page Navigation Toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="btn-secondary px-2.5 py-1 text-xs disabled:opacity-40 inline-flex items-center gap-1"
            title="Previous page"
          >
            <ChevronLeft size={14} />
            <span>Prev Page</span>
          </button>

          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5 mx-1">
            <span className="text-slate-600 font-medium">Page</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={handlePageInputSubmit}
              className="w-14 px-2 py-0.5 text-center text-xs font-semibold bg-white border border-slate-300 rounded shadow-xs focus:ring-1 focus:ring-navy-600 focus:outline-hidden"
            />
            <span className="text-slate-600 font-medium">of {totalPages}</span>
          </form>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="btn-secondary px-2.5 py-1 text-xs disabled:opacity-40 inline-flex items-center gap-1"
            title="Next page"
          >
            <span>Next Page</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Toggle Page Text panel */}
        <button
          type="button"
          onClick={() => setShowPageText(!showPageText)}
          className={`px-3 py-1 rounded text-xs font-medium border flex items-center gap-1.5 transition-colors ${
            showPageText
              ? 'bg-navy-100 text-navy-900 border-navy-300'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          <AlignLeft size={13} />
          <span>{showPageText ? 'Hide Page Text' : 'View Extracted Page Text'}</span>
        </button>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 p-3 overflow-hidden flex gap-3">
        {/* Embedded PDF viewer */}
        <div className="flex-1 h-full overflow-hidden flex flex-col bg-white rounded-xl border border-slate-200 shadow-xs">
          {blobUrl ? (
            <iframe
              key={`${id}-page-${currentPage}`}
              src={`${blobUrl}#page=${currentPage}&view=FitH`}
              title={document?.original_filename || 'PDF Preview'}
              className="w-full h-full rounded-xl"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              No preview available.
            </div>
          )}
        </div>

        {/* Side Panel: Extracted Page Text */}
        {showPageText && (
          <div className="w-88 border border-slate-200 bg-white rounded-xl flex flex-col h-full shadow-xs overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="font-semibold text-xs text-slate-800">
                Extracted Text (Page {currentPage})
              </span>
              {pageTextData?.character_count && (
                <span className="text-[11px] text-slate-500">
                  {pageTextData.character_count} chars
                </span>
              )}
            </div>
            <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed select-text bg-slate-50/50">
              {loadingPageText ? (
                <div className="flex items-center justify-center h-32 text-slate-400 gap-2">
                  <Loader2 size={16} className="animate-spin text-navy-600" />
                  <span>Loading page text...</span>
                </div>
              ) : pageTextData?.extracted_text ? (
                pageTextData.extracted_text
              ) : (
                <span className="text-slate-400 italic">No text extracted for this page.</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

