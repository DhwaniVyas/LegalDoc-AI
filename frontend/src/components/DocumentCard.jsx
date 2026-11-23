import { FileText, Eye, Download, Trash2, Calendar, HardDrive } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatFileSize, formatDate } from '../services/documentService'

export default function DocumentCard({ document, onDownload, onDelete }) {
  return (
    <div className="card p-5 hover:border-slate-300 transition-all flex flex-col justify-between group">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center shrink-0">
            <FileText size={20} className="text-navy-700" />
          </div>
          <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
            {document.status === 'uploaded' ? 'Uploaded' : document.status}
          </span>
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
        <Link
          to={`/documents/${document.id}/preview`}
          className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:text-navy-900 hover:underline"
        >
          <Eye size={14} />
          Preview
        </Link>

        <div className="flex items-center gap-1">
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

