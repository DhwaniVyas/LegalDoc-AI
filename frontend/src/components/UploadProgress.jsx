import { Loader2 } from 'lucide-react'

export default function UploadProgress({ progress, statusText }) {
  return (
    <div className="card p-5 space-y-3 bg-navy-50/50 border-navy-100 animate-in fade-in duration-200">
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-2 text-slate-700">
          <Loader2 size={16} className="animate-spin text-navy-700" />
          {statusText || 'Uploading documents...'}
        </span>
        <span className="text-navy-700 font-semibold">{progress}%</span>
      </div>

      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
        <div
          className="bg-navy-700 h-2 rounded-full transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-xs text-slate-500">
        Verifying PDF signatures and storing documents safely in your secure vault.
      </p>
    </div>
  )
}

