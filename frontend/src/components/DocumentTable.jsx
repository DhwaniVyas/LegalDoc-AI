import { FileText, Eye, Download, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatFileSize, formatDate } from '../services/documentService'

export default function DocumentTable({ documents, onDownload, onDelete }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-3.5 px-4">Document Name</th>
              <th className="py-3.5 px-4">File Size</th>
              <th className="py-3.5 px-4">Uploaded On</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-navy-700" />
                    </div>
                    <span
                      className="font-medium text-slate-900 line-clamp-1 max-w-md"
                      title={doc.original_filename}
                    >
                      {doc.original_filename}
                    </span>
                  </div>
                </td>
                <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                  {formatFileSize(doc.file_size)}
                </td>
                <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                  {formatDate(doc.created_at)}
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {doc.status === 'uploaded' ? 'Uploaded' : doc.status}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    <Link
                      to={`/documents/${doc.id}/preview`}
                      className="btn-ghost p-1.5 text-navy-700 hover:text-navy-900 hover:bg-navy-50"
                      title="Preview"
                    >
                      <Eye size={16} />
                    </Link>
                    <button
                      onClick={() => onDownload(doc)}
                      className="btn-ghost p-1.5 text-slate-600 hover:text-slate-800"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => onDelete(doc)}
                      className="btn-ghost p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

