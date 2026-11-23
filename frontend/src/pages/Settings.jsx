import { Settings as SettingsIcon, User, Bell, Shield, Database } from 'lucide-react'
import PageHeader from '../components/PageHeader'

const sections = [
  {
    title: 'Profile',
    icon: User,
    description: 'Update your name and email address.',
  },
  {
    title: 'Notifications',
    icon: Bell,
    description: 'Control how and when you receive notifications.',
  },
  {
    title: 'Security',
    icon: Shield,
    description: 'Manage your password and authentication methods.',
  },
  {
    title: 'Data & Storage',
    icon: Database,
    description: 'Manage your uploaded documents and storage usage.',
  },
]

export default function Settings() {
  return (
    <div className="p-8">
      <PageHeader
        title="Settings"
        subtitle="Manage your account preferences and application settings."
      />

      <div className="max-w-2xl space-y-3">
        {sections.map(({ title, icon: Icon, description }) => (
          <div
            key={title}
            className="card p-5 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-navy-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700">{title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{description}</p>
            </div>
            <div className="text-slate-300">›</div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Settings panels will be fully implemented in an upcoming development phase.
      </p>
    </div>
  )
}

