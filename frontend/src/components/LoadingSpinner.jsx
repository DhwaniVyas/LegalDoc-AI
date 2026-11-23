/**
 * Full-page loading spinner.
 */
export default function LoadingSpinner({ message = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-navy-200 border-t-navy-600 animate-spin" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  )
}

