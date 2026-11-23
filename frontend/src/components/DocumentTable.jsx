import { FileText, Eye, Download, Trash2, Layers, RefreshCw, Loader2, Database, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatFileSize, formatDate } from '../services/documentService'

export default function DocumentTable({ documents, onDownload, onDelete, onInspect, onReprocess, onEmbed }) {
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
          <span className="badge bg-rose-50 text-rose-700 border border-rose-200">
            Index Failed
          </span>
        )
      default:
        return <span className="badge bg-slate-100 text-slate-500">Not Indexed</span>
    }
  }

  return (
    <div className="card overflow-hidden bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-3.5 px-4">Document Name</th>
              <th className="py-3.5 px-4">File Size</th>
              <th className="py-3.5 px-4">Pages / Chunks</th>
              <th className="py-3.5 px-4">Status & Index</th>
              <th className="py-3.5 px-4">Uploaded On</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map((doc) => {
              const isProcessing = doc.processing_status === 'processing'
              const isEmbedding = doc.embedding_status === 'processing' || doc.embedding_status === 'pending'
              const canEmbed = doc.processing_status === 'completed' && doc.total_chunks > 0 && !isEmbedding

              return (
                <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-navy-700" />
                      </div>
                      <span
                        className="font-medium text-slate-900 line-clamp-1 max-w-xs sm:max-w-md"
                        title={doc.original_filename}
                      >
                        {doc.original_filename}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                    {formatFileSize(doc.file_size)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap text-xs">
                    {doc.total_pages > 0 ? (
                      <span>
                        <span className="font-semibold text-slate-800">{doc.total_pages}</span> pg ·{' '}
                        <span className="font-semibold text-slate-800">{doc.total_chunks}</span> chk
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1 items-start">
                      {getProcessingBadge(doc.processing_status)}
                      {getEmbeddingBadge(doc.embedding_status, doc.embedded_chunks)}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap text-xs">
                    {formatDate(doc.created_at)}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      {canEmbed && (
                        <button
                          onClick={() => onEmbed && onEmbed(doc)}
                          disabled={isEmbedding}
                          className="btn-ghost p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50"
                          title="Index/Re-index vector embeddings"
                        >
                          <Database size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => onInspect(doc)}
                        className="btn-ghost p-1.5 text-slate-600 hover:text-navy-800 hover:bg-slate-100"
                        title="Inspect Extracted Pages and Chunks"
                      >
                        <Layers size={16} />
                      </button>
                      <button
                        onClick={() => onReprocess(doc)}
                        disabled={isProcessing}
                        className="btn-ghost p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-40"
                        title={isProcessing ? 'Processing in progress' : 'Reprocess Document'}
                      >
                        <RefreshCw size={15} className={isProcessing ? 'animate-spin' : ''} />
                      </button>
                      <Link
                        to={`/documents/${doc.id}/preview`}
                        className="btn-ghost p-1.5 text-navy-700 hover:text-navy-900 hover:bg-navy-50"
                        title="Preview PDF"
                      >
                        <Eye size={16} />
                      </Link>
                      <button
                        onClick={() => onDownload(doc)}
                        className="btn-ghost p-1.5 text-slate-500 hover:text-slate-700"
                        title="Download PDF"
                      >
                        <Download size={16} />
                      </button>
                      <button
                        onClick={() => onDelete(doc)}
                        className="btn-ghost p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete Document"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
