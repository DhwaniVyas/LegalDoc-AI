import { FileText, Eye, Download, Trash2, Calendar, HardDrive, Layers, RefreshCw, Loader2, Database, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatFileSize, formatDate } from '../services/documentService'

export default function DocumentCard({ document, onDownload, onDelete, onInspect, onReprocess, onEmbed }) {
  const getProcessingBadge = (status) => {
    switch (status) {
      case 'completed':
        return <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">Text Extracted</span>
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

  const getEmbeddingBadge = (status, chunks) => {
    switch (status) {
      case 'completed':
        return (
          <span className="badge bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
            <Sparkles size={11} /> Indexed ({chunks || 0})
          </span>
        )
      case 'processing':
      case 'pending':
        return (
          <span className="badge bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1 animate-pulse">
            <Loader2 size={11} className="animate-spin" /> Indexing...
          </span>
        )
      case 'failed':
        return (
          <span className="badge bg-rose-50 text-rose-700 border border-rose-200" title={document.embedding_error || 'Indexing failed'}>
            Index Failed
          </span>
        )
      default:
        return <span className="badge bg-slate-100 text-slate-500">Not Indexed</span>
    }
  }

  const isProcessing = document.processing_status === 'processing'
  const isEmbedding = document.embedding_status === 'processing' || document.embedding_status === 'pending'
  const canEmbed = document.processing_status === 'completed' && document.total_chunks > 0 && !isEmbedding

  return (
    <div className="card p-5 hover:border-slate-300 transition-all flex flex-col justify-between group bg-white">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center shrink-0">
            <FileText size={20} className="text-navy-700" />
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              {getProcessingBadge(document.processing_status)}
              {getEmbeddingBadge(document.embedding_status, document.embedded_chunks)}
            </div>
            {document.total_pages > 0 && (
              <span className="text-[11px] text-slate-400">
                {document.total_pages} {document.total_pages === 1 ? 'page' : 'pages'} · {document.total_chunks} chunks
              </span>
            )}
          </div>
        </div>

        <h3
          className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug group-hover:text-navy-700 transition-colors"
          title={document.original_filename}
        >
          {document.original_filename}
        </h3>

        <div className="mt-4 space-y-1.5 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <HardDrive size={13} className="text-slate-400" />
            <span>{formatFileSize(document.file_size)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-slate-400" />
            <span>{formatDate(document.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to={`/documents/${document.id}/preview`}
            className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:text-navy-900 hover:underline"
          >
            <Eye size={14} />
            Preview
          </Link>
          <span className="text-slate-300">·</span>
          <button
            onClick={() => onInspect(document)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-navy-800 hover:underline"
            title="Inspect Extracted Pages and Chunks"
          >
            <Layers size={13} />
            Inspect
          </button>
        </div>

        <div className="flex items-center gap-1">
          {canEmbed && (
            <button
              onClick={() => onEmbed && onEmbed(document)}
              disabled={isEmbedding}
              title="Index/Re-index vector embeddings"
              className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 hover:text-purple-800 transition-colors"
            >
              <Database size={14} />
            </button>
          )}
          <button
            onClick={() => onReprocess(document)}
            disabled={isProcessing}
            title={isProcessing ? 'Processing in progress' : 'Reprocess text and chunks'}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={isProcessing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => onDownload(document)}
            title="Download PDF"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <Download size={15} />
          </button>
          <button
            onClick={() => onDelete(document)}
            title="Delete Document"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
