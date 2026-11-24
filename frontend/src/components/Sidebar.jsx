import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Upload,
  Search,
  Sparkles,
  MessageSquare,
  Settings,
  Scale,
  LogOut,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/dashboard',    label: 'Dashboard',             icon: LayoutDashboard },
  { to: '/documents',    label: 'Documents',             icon: FileText },
  { to: '/upload',       label: 'Upload',                icon: Upload },
  { to: '/ask',          label: 'Ask AI (RAG)',          icon: Sparkles },
  { to: '/search',       label: 'Semantic Search',       icon: Search },
  { to: '/chat-history', label: 'Chat History',          icon: MessageSquare },
]

const bottomItems = [
  { to: '/settings', label: 'Settings', icon: Settings },
]

function NavItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
          isActive
            ? 'bg-navy-700 text-white'
            : 'text-slate-300 hover:bg-navy-800 hover:text-white'
        }`
      }
    >
      <Icon size={18} className="shrink-0" />
      <span className="flex-1">{label}</span>
      <ChevronRight size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
    </NavLink>
  )
}

/** Returns the user's initials (up to 2 letters) for the avatar fallback. */
function getInitials(user) {
  if (user?.full_name) {
    return user.full_name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('')
  }
  return user?.email?.[0]?.toUpperCase() ?? 'U'
}

export default function Sidebar() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [logoutLoading, setLogoutLoading] = useState(false)

  const handleLogout = async () => {
    setLogoutLoading(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      navigate('/login', { replace: true })
    } finally {
      setLogoutLoading(false)
    }
  }

  const displayName  = user?.full_name || user?.email?.split('@')[0] || 'User'
  const displayEmail = user?.email || ''

  return (
    <aside className="flex flex-col w-64 shrink-0 bg-navy-950 h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-navy-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-navy-600">
          <Scale size={16} className="text-white" />
        </div>
        <div>
          <span className="text-white font-semibold text-sm tracking-tight">LegalDoc</span>
          <span className="text-navy-400 font-semibold text-sm tracking-tight"> AI</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 pb-2 text-xs font-semibold text-navy-500 uppercase tracking-wider">
          Workspace
        </p>
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 py-4 border-t border-navy-800 space-y-1">
        {bottomItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
        <button
          onClick={handleLogout}
          disabled={logoutLoading}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-navy-800 hover:text-white transition-colors duration-150 disabled:opacity-50"
        >
          {logoutLoading ? <Loader2 size={18} className="shrink-0 animate-spin" /> : <LogOut size={18} className="shrink-0" />}
          <span>{logoutLoading ? 'Logging out...' : 'Logout'}</span>
        </button>
      </div>

      {/* User pill */}
      <div className="px-3 pb-4">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-navy-900">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={displayName}
              className="w-7 h-7 rounded-full object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-navy-600 flex items-center justify-center shrink-0">
              <span className="text-xs text-white font-medium">{getInitials(user)}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{displayName}</p>
            <p className="text-xs text-navy-400 truncate">{displayEmail}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
