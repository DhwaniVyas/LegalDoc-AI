/**
 * Stat card for dashboard metrics.
 */
export default function StatCard({ label, value, icon: Icon, trend }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {trend && (
            <p className="mt-1 text-xs text-slate-400">{trend}</p>
          )}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center shrink-0">
            <Icon size={18} className="text-navy-600" />
          </div>
        )}
      </div>
    </div>
  )
}

