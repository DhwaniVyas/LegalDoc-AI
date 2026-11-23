import { useState, useEffect } from 'react'
import { X, Layers, FileText, CheckCircle2, AlertCircle, Clock, Loader2, RefreshCw } from 'lucide-react'
import { documentService, formatDate } from '../services/documentService'

export default function DocumentInspectionModal({ isOpen, document, onClose, onReprocess }) {
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'pages' | 'chunks'
  const [inspectionData, setInspectionData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reprocessing, setReprocessing] = useState(false)

  const docId = document?.id

  useEffect(() => {
    if (!isOpen || !docId) {
      setInspectionData(null)
      setError('')
      setActiveTab('overview')
      return
    }

    let isMounted = true
    setLoading(true)
    setError('')

    documentService.getDocumentInspection(docId)
      .then((data) => {
        if (isMounted) setInspectionData(data)
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.response?.data?.detail || 'Failed to load inspection details.')
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => { isMounted = false }
  }, [isOpen, docId])

  if (!isOpen || !document) return null

  const handleReprocessClick = async () => {
    setReprocessing(true)
    try {
      if (onReprocess) {
        await onReprocess(document)
      } else {
        await documentService.reprocessDocument(document.id)
      }
      onClose()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to trigger reprocessing.')
    } finally {
      setReprocessing(false)
    }
  }

  const doc = inspectionData?.document || document
  const pages = inspectionData?.pages || []
  const chunks = inspectionData?.chunks || []

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">Completed</span>
      case 'processing':
        return (
          <span className="badge bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 animate-pulse">
            <Loader2 size={11} className="animate-spin" /> Processing
          </span>
        )
      case 'pending':
        return <span className="badge bg-slate-100 text-slate-600 border border-slate-200">Pending</span>
      case 'needs_ocr':
        return <span className="badge bg-amber-50 text-amber-700 border border-amber-200">Needs OCR</span>
      case 'failed':
        return <span className="badge bg-red-50 text-red-700 border border-red-200">Failed</span>
      default:
        return <span className="badge bg-slate-100 text-slate-600">Not Started</span>
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="card w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden bg-white">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/75 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-navy-50 text-navy-700 flex items-center justify-center shrink-0">
              <Layers size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900 truncate" title={doc.original_filename}>
                  {doc.original_filename}
                </h3>
                {getStatusBadge(doc.processing_status)}
              </div>
              <p className="text-xs text-slate-500">Document Processing & Extraction Inspector</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReprocessClick}
              disabled={reprocessing || doc.processing_status === 'processing'}
              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5 disabled:opacity-50"
              title="Reprocess Document"
            >
              <RefreshCw size={13} className={reprocessing ? 'animate-spin' : ''} />
              <span>{reprocessing ? 'Reprocessing...' : 'Reprocess'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 bg-white flex gap-6 shrink-0 text-sm font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-navy-700 text-navy-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('pages')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'pages'
                ? 'border-navy-700 text-navy-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>Extracted Pages</span>
            <span className="badge bg-slate-100 text-slate-600 text-[11px] py-0 px-1.5">
              {doc.extracted_pages || pages.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('chunks')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'chunks'
                ? 'border-navy-700 text-navy-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>Text Chunks</span>
            <span className="badge bg-slate-100 text-slate-600 text-[11px] py-0 px-1.5">
              {doc.total_chunks || chunks.length}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 size={24} className="animate-spin text-navy-700" />
              <p className="text-sm text-slate-500">Loading document inspection data...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-2.5 text-sm">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          ) : activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* Metric grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="card p-4 bg-white">
                  <p className="text-xs text-slate-500">Total PDF Pages</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{doc.total_pages || 0}</p>
                </div>
                <div className="card p-4 bg-white">
                  <p className="text-xs text-slate-500">Extracted Pages</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{doc.extracted_pages || 0}</p>
                </div>
                <div className="card p-4 bg-white">
                  <p className="text-xs text-slate-500">Generated Chunks</p>
                  <p className="text-2xl font-bold text-navy-700 mt-1">{doc.total_chunks || 0}</p>
                </div>
                <div className="card p-4 bg-white">
                  <p className="text-xs text-slate-500">Chunk Size / Overlap</p>
                  <p className="text-sm font-semibold text-slate-800 mt-2">1000 / 150 chars</p>
                </div>
              </div>

              {/* Status details */}
              <div className="card p-5 bg-white space-y-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Processing Details</h4>
                <div className="space-y-2 text-sm divide-y divide-slate-100">
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Processing Status</span>
                    <div>{getStatusBadge(doc.processing_status)}</div>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Last Processed At</span>
                    <span className="text-slate-800 font-medium">{formatDate(doc.processed_at)}</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Normalized Filename</span>
                    <span className="text-slate-800 font-mono text-xs">{doc.normalized_filename}</span>
                  </div>
                </div>

                {doc.processing_error && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                    <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <span className="font-semibold">Notice:</span> {doc.processing_error}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'pages' ? (
            <div className="space-y-4">
              {pages.length === 0 ? (
                <div className="card p-12 text-center text-slate-500 bg-white">
                  <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-medium">No extracted page text available.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {doc.processing_status === 'needs_ocr'
                      ? 'This document contains scanned images or no extractable text.'
                      : 'Ensure the document processing has completed.'}
                  </p>
                </div>
              ) : (
                pages.map((p) => (
                  <div key={p.id} className="card p-4 bg-white space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 border-b border-slate-100 pb-2">
                      <span className="badge bg-navy-50 text-navy-800">Page {p.page_number}</span>
                      <span className="text-slate-400 font-normal">{p.character_count} characters</span>
                    </div>
                    {p.extracted_text ? (
                      <pre className="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200/60 max-h-60 overflow-y-auto">
                        {p.extracted_text}
                      </pre>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No extractable text found on this page.</p>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {chunks.length === 0 ? (
                <div className="card p-12 text-center text-slate-500 bg-white">
                  <Layers size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-medium">No text chunks generated.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Chunks are generated from extracted text during processing.
                  </p>
                </div>
              ) : (
                chunks.map((c) => (
                  <div key={c.id} className="card p-4 bg-white space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="badge bg-navy-50 text-navy-800">Chunk #{c.chunk_index + 1}</span>
                        <span className="badge bg-slate-100 text-slate-600">Page {c.page_number}</span>
                      </div>
                      <span className="text-slate-400 font-normal">{c.character_count} characters</span>
                    </div>
                    <p className="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200/60 max-h-48 overflow-y-auto">
                      {c.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex justify-end shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

