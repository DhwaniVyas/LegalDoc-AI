import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Upload,
  Search,
  MessageSquare,
  Settings,
  Scale,
  LogOut,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { to: '/dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/documents',    label: 'Documents',    icon: FileText },
  { to: '/upload',       label: 'Upload',       icon: Upload },
  { to: '/research',     label: 'AI Research',  icon: Search },
  { to: '/chat-history', label: 'Chat History', icon: MessageSquare },
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

export default function Sidebar() {
  const navigate = useNavigate()

  const handleLogout = () => {
    // Will call POST /api/auth/logout in the future
    navigate('/login')
  }

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
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-navy-800 hover:text-white transition-colors duration-150"
        >
          <LogOut size={18} className="shrink-0" />
          <span>Logout</span>
        </button>
      </div>

      {/* User pill */}
      <div className="px-3 pb-4">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-navy-900">
          <div className="w-7 h-7 rounded-full bg-navy-600 flex items-center justify-center shrink-0">
            <span className="text-xs text-white font-medium">U</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">User</p>
            <p className="text-xs text-navy-400 truncate">user@example.com</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

