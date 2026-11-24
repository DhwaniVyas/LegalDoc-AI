import { useState, useEffect, useRef } from 'react'
import {
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  AlertCircle,
  Loader2,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Maximize2,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react'
import { documentService, formatFileSize } from '../services/documentService'

export default function CitationVerificationModal({
  isOpen,
  onClose,
  citation,
  allSources = [],
  onSelectCitation,
}) {
  const [document, setDocument] = useState(null)
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [activeCitation, setActiveCitation] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [showExcerpt, setShowExcerpt] = useState(true)

  const activeBlobUrlRef = useRef(null)

  // Keep activeCitation updated from prop
  useEffect(() => {
    if (citation) {
      setActiveCitation(citation)
      const page = citation.page_number || 1
      setCurrentPage(page)
      setPageInput(String(page))
    }
  }, [citation])

  const docId = activeCitation?.document_id

  // Load document metadata and PDF preview blob
  useEffect(() => {
    if (!isOpen || !docId) {
      setDocument(null)
      setError('')
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current)
        activeBlobUrlRef.current = null
      }
      setBlobUrl(null)
      return
    }

    let isMounted = true
    setLoading(true)
    setError('')

    Promise.all([
      documentService.getDocument(docId),
      documentService.getPreviewUrl(docId),
    ])
      .then(([docMeta, url]) => {
        if (!isMounted) return
        setDocument(docMeta)
        setBlobUrl(url)
        activeBlobUrlRef.current = url
        const total = docMeta.total_pages || 1
        setTotalPages(total)
      })
      .catch((err) => {
        if (!isMounted) return
        const status = err.response?.status
        if (status === 404 || status === 403) {
          setError(
            'This source document is no longer available in your library or you do not have permission to view it.'
          )
        } else {
          setError(
            err.response?.data?.detail ||
              'Failed to load PDF preview for this source. Please try again.'
          )
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current)
        activeBlobUrlRef.current = null
      }
    }
  }, [isOpen, docId])

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !activeCitation) return null

  const citedPage = activeCitation.page_number || 1
  const isAtCitedPage = currentPage === citedPage

  const handlePrevPage = () => {
    if (currentPage > 1) {
      const next = currentPage - 1
      setCurrentPage(next)
      setPageInput(String(next))
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      const next = currentPage + 1
      setCurrentPage(next)
      setPageInput(String(next))
    }
  }

  const handlePageInputChange = (e) => {
    setPageInput(e.target.value)
  }

  const handlePageInputSubmit = (e) => {
    e.preventDefault()
    const p = parseInt(pageInput, 10)
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      setCurrentPage(p)
    } else {
      setPageInput(String(currentPage))
    }
  }

  const handleJumpToCitedPage = () => {
    setCurrentPage(citedPage)
    setPageInput(String(citedPage))
  }

  const handleDownload = async () => {
    if (!docId) return
    setDownloading(true)
    try {
      await documentService.downloadDocument(
        docId,
        document?.original_filename || activeCitation.filename
      )
    } catch {
      alert('Failed to download document.')
    } finally {
      setDownloading(false)
    }
  }

  const handleSelectOtherCitation = (s) => {
    setActiveCitation(s)
    const page = s.page_number || 1
    setCurrentPage(page)
    setPageInput(String(page))
    if (onSelectCitation) {
      onSelectCitation(s)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="card w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden bg-white border border-slate-300">
        {/* Modal Top Bar */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Citation Identifier Badge */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-navy-900 text-white shadow-xs shrink-0">
              <BookOpen size={13} className="text-navy-200" />
              <span>[{activeCitation.citation_id}]</span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3
                  className="text-sm font-semibold text-slate-900 truncate max-w-xs sm:max-w-md"
                  title={document?.original_filename || activeCitation.filename}
                >
                  {document?.original_filename || activeCitation.filename}
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <ShieldCheck size={12} /> Verified Source
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Cited on <span className="font-semibold text-slate-700">Page {citedPage}</span>
                {totalPages > 1 && ` (Document has ${totalPages} pages)`}
              </p>
            </div>
          </div>

          {/* Controls & Close */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Direct Link to Full Preview Tab */}
            {document && (
              <a
                href={`/documents/${docId}/preview?page=${currentPage}&citation=${activeCitation.citation_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost p-1.5 text-slate-600 hover:text-navy-900"
                title="Open full preview in new tab"
              >
                <Maximize2 size={16} />
              </a>
            )}

            {/* Download */}
            <button
              onClick={handleDownload}
              disabled={downloading || !document}
              className="btn-ghost p-1.5 text-slate-600 hover:text-navy-900"
              title="Download original PDF"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="btn-ghost p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors ml-1"
              title="Close modal (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Secondary Toolbar: PDF Page Navigation */}
        <div className="px-5 py-2.5 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          {/* Pagination Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={currentPage <= 1 || loading}
              className="btn-secondary px-2 py-1 text-xs disabled:opacity-40 inline-flex items-center gap-1"
              title="Previous page"
            >
              <ChevronLeft size={14} />
              <span className="hidden sm:inline">Prev Page</span>
            </button>

            <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5">
              <span className="text-slate-600 font-medium">Page</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={pageInput}
                onChange={handlePageInputChange}
                onBlur={handlePageInputSubmit}
                className="w-14 px-2 py-0.5 text-center text-xs font-semibold bg-white border border-slate-300 rounded shadow-xs focus:ring-1 focus:ring-navy-600 focus:outline-hidden"
              />
              <span className="text-slate-600 font-medium">of {totalPages}</span>
            </form>

            <button
              type="button"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages || loading}
              className="btn-secondary px-2 py-1 text-xs disabled:opacity-40 inline-flex items-center gap-1"
              title="Next page"
            >
              <span className="hidden sm:inline">Next Page</span>
              <ChevronRight size={14} />
            </button>

            {!isAtCitedPage && (
              <button
                type="button"
                onClick={handleJumpToCitedPage}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-navy-800 bg-navy-100 hover:bg-navy-200 rounded border border-navy-300 transition-colors ml-2"
                title={`Return to cited Page ${citedPage}`}
              >
                <RotateCcw size={12} />
                <span>Return to Cited Page {citedPage}</span>
              </button>
            )}
          </div>

          {/* Toggle Excerpt Panel button (Mobile/Desktop) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExcerpt(!showExcerpt)}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                showExcerpt
                  ? 'bg-navy-50 text-navy-900 border-navy-200'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {showExcerpt ? 'Hide Source Excerpt' : 'Show Source Excerpt'}
            </button>
          </div>
        </div>

        {/* Modal Main Content: PDF View & Excerpt Panel */}
        <div className="flex-1 flex overflow-hidden bg-slate-200/50">
          {/* Left/Center: Embedded PDF Viewer */}
          <div className="flex-1 flex flex-col h-full overflow-hidden p-2 sm:p-3 relative">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 shadow-inner">
                <Loader2 size={32} className="animate-spin text-navy-600 mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  Loading PDF preview at Page {currentPage}...
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Fetching document verification stream
                </p>
              </div>
            ) : error ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-white rounded-xl border border-slate-200 text-center">
                <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-3">
                  <AlertCircle size={24} />
                </div>
                <h4 className="text-base font-semibold text-slate-800 mb-1">
                  PDF Preview Unavailable
                </h4>
                <p className="text-sm text-slate-500 max-w-md mb-4">{error}</p>
                <p className="text-xs text-slate-400">
                  The verified text excerpt is preserved and displayed in the source panel on the right.
                </p>
              </div>
            ) : blobUrl ? (
              <iframe
                key={`${docId}-page-${currentPage}`}
                src={`${blobUrl}#page=${currentPage}&view=FitH`}
                title={`${document?.original_filename || 'PDF'} - Page ${currentPage}`}
                className="w-full h-full rounded-xl border border-slate-300 bg-white shadow-xs"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-white rounded-xl border border-slate-200 text-slate-400 text-sm">
                No preview available.
              </div>
            )}
          </div>

          {/* Right: Verified Source Excerpt Panel */}
          {showExcerpt && (
            <div className="w-80 sm:w-96 border-l border-slate-200 bg-white flex flex-col h-full shrink-0 shadow-lg z-10 overflow-hidden">
              {/* Excerpt Header */}
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-navy-950 bg-navy-100 border border-navy-200 px-2 py-0.5 rounded">
                    [{activeCitation.citation_id}]
                  </span>
                  <span className="text-xs font-bold text-slate-800">
                    Source Excerpt
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  Page {citedPage}
                </span>
              </div>

              {/* Excerpt Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Verified Snippet Card */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">Extracted Text Chunk:</span>
                    {activeCitation.distance !== undefined && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                        dist: {Number(activeCitation.distance).toFixed(3)}
                      </span>
                    )}
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs leading-relaxed font-mono text-slate-800 whitespace-pre-wrap select-text shadow-2xs">
                    {activeCitation.content}
                  </div>
                </div>

                {/* Document Information Summary */}
                <div className="bg-navy-50/50 border border-navy-100 rounded-lg p-3 text-xs space-y-1.5 text-navy-950">
                  <div className="font-semibold text-navy-900 flex items-center gap-1.5">
                    <FileText size={13} className="text-navy-700" />
                    <span>Document Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 pt-1">
                    <div>
                      <span className="font-medium text-slate-700">Target Page:</span> {citedPage}
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Total Pages:</span> {totalPages}
                    </div>
                    {document?.file_size && (
                      <div>
                        <span className="font-medium text-slate-700">Size:</span>{' '}
                        {formatFileSize(document.file_size)}
                      </div>
                    )}
                    {activeCitation.chunk_index !== undefined && (
                      <div>
                        <span className="font-medium text-slate-700">Chunk #:</span>{' '}
                        {activeCitation.chunk_index}
                      </div>
                    )}
                  </div>
                </div>

                {/* Other Citations in this Answer (if multiple) */}
                {allSources.length > 1 && (
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>Other Sources in Answer ({allSources.length}):</span>
                    </div>
                    <div className="space-y-1.5">
                      {allSources.map((s) => {
                        const isSelected = s.citation_id === activeCitation.citation_id
                        return (
                          <button
                            key={s.citation_id}
                            type="button"
                            onClick={() => handleSelectOtherCitation(s)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between border transition-all ${
                              isSelected
                                ? 'bg-navy-800 text-white border-navy-800 font-semibold shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isSelected ? 'bg-navy-900 text-white' : 'bg-navy-100 text-navy-800'
                                }`}
                              >
                                [{s.citation_id}]
                              </span>
                              <span className="truncate max-w-[130px]">{s.filename}</span>
                            </div>
                            <span
                              className={`text-[11px] shrink-0 ${
                                isSelected ? 'text-navy-200' : 'text-slate-500'
                              }`}
                            >
                              Page {s.page_number}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

