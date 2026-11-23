import { FileText, Upload, Search, MessageSquare, Clock } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { useAuth } from '../context/AuthContext'

const stats = [
  { label: 'Documents Uploaded',   value: '0', icon: FileText,      trend: 'No documents yet' },
  { label: 'AI Research Sessions', value: '0', icon: Search,        trend: 'Start your first session' },
  { label: 'Chat Sessions',        value: '0', icon: MessageSquare, trend: 'No chats yet' },
]

export default function Dashboard() {
  const { user } = useAuth()

  const greeting = user?.full_name
    ? `Welcome back, ${user.full_name.split(' ')[0]}.`
    : 'Welcome to LegalDoc AI.'

  return (
    <div className="p-8">
      <PageHeader
        title="Dashboard"
        subtitle={`${greeting} Your intelligent legal research workspace is ready.`}
        action={
          <a href="/upload" className="btn-primary">
            <Upload size={16} />
            Upload Document
          </a>
        }
      />

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Quick actions + recent activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</h2>
          <div className="space-y-2">
            <a
              href="/upload"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-navy-50 flex items-center justify-center">
                <Upload size={16} className="text-navy-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Upload a Document</p>
                <p className="text-xs text-slate-400">PDF, DOCX supported</p>
              </div>
            </a>
            <a
              href="/research"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-navy-50 flex items-center justify-center">
                <Search size={16} className="text-navy-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Start AI Research</p>
                <p className="text-xs text-slate-400">Ask questions about your documents</p>
              </div>
            </a>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Recent Activity</h2>
          <div className="flex flex-col items-center justify-center py-8">
            <Clock size={28} className="text-slate-200 mb-2" />
            <p className="text-xs text-slate-400">No recent activity</p>
          </div>
        </div>
      </div>

      {/* Account info card */}
      <div className="card p-5 max-w-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Account</h2>
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
