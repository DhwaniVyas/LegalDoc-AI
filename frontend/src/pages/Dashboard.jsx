import { useEffect, useState } from 'react'
import { FileText, Upload, Search, MessageSquare, Clock, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { useAuth } from '../context/AuthContext'
import { documentService, formatFileSize, formatDate } from '../services/documentService'

export default function Dashboard() {
  const { user } = useAuth()
  const [docCount, setDocCount] = useState(0)
  const [recentDocs, setRecentDocs] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)

  useEffect(() => {
    let isMounted = true
    documentService.getDocuments({ page: 1, pageSize: 5 })
      .then((data) => {
        if (isMounted) {
          setDocCount(data.total)
          setRecentDocs(data.items)
        }
      })
      .catch(() => {
        // Silently handle if unauthenticated or error
      })
      .finally(() => {
        if (isMounted) setLoadingDocs(false)
      })

    return () => { isMounted = false }
  }, [])

  const greeting = user?.full_name
    ? `Welcome back, ${user.full_name.split(' ')[0]}.`
    : 'Welcome to LegalDoc AI.'

  const stats = [
    {
      label: 'Documents Uploaded',
      value: loadingDocs ? '...' : String(docCount),
      icon: FileText,
      trend: docCount > 0 ? `${docCount} legal PDF file(s) in vault` : 'No documents yet',
    },
    { label: 'AI Research Sessions', value: '0', icon: Search, trend: 'Start your first session' },
    { label: 'Chat Sessions', value: '0', icon: MessageSquare, trend: 'No chats yet' },
  ]

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle={`${greeting} Your intelligent legal research workspace is ready.`}
        action={
          <Link to="/upload" className="btn-primary">
            <Upload size={16} />
            Upload Document
          </Link>
        }
      />

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Quick actions + recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Quick Actions</h2>
          <div className="space-y-2">
            <Link
              to="/upload"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-navy-50 flex items-center justify-center text-navy-700 group-hover:bg-navy-100 transition-colors">
                <Upload size={16} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">Upload Legal Documents</p>
                <p className="text-xs text-slate-400">PDF up to 20 MB each (max 5)</p>
              </div>
              <ArrowRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </Link>

            <Link
              to="/documents"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-navy-50 flex items-center justify-center text-navy-700 group-hover:bg-navy-100 transition-colors">
                <FileText size={16} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">View All Documents</p>
                <p className="text-xs text-slate-400">Search, preview, and download</p>
              </div>
              <ArrowRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </Link>
          </div>
        </div>

        {/* Recent Documents / Activity */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Recent Uploads</h2>
            {recentDocs.length > 0 && (
              <Link to="/documents" className="text-xs font-medium text-navy-700 hover:underline">
                View all
              </Link>
            )}
          </div>

          {recentDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Clock size={28} className="text-slate-200 mb-2" />
              <p className="text-xs text-slate-400">No documents uploaded yet</p>
              <Link to="/upload" className="mt-3 text-xs text-navy-700 font-medium hover:underline">
                Upload your first document
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentDocs.map((doc) => (
                <div key={doc.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText size={14} className="text-navy-700 shrink-0" />
                    <span className="font-medium text-slate-800 truncate max-w-[200px]" title={doc.original_filename}>
                      {doc.original_filename}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-slate-400">
                    <span>{formatFileSize(doc.file_size)}</span>
                    <Link
                      to={`/documents/${doc.id}/preview`}
                      className="text-navy-700 font-medium hover:underline"
                    >
                      Preview
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Account Info Pill */}
      <div className="card p-5 max-w-sm">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Name</span>
            <span className="text-slate-800 font-medium">{user?.full_name || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Email</span>
            <span className="text-slate-800 font-medium truncate max-w-[180px]">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Sign-in method</span>
            <span className="badge bg-navy-50 text-navy-700 capitalize">{user?.auth_provider}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
