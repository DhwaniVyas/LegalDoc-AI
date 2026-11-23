import { AlertTriangle, Loader2 } from 'lucide-react'

export default function DeleteDocumentModal({ isOpen, document, onConfirm, onCancel, isDeleting }) {
  if (!isOpen || !document) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0 text-red-600">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">Delete Document</h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Are you sure you want to delete{' '}
              <span className="font-medium text-slate-800 break-all">"{document.original_filename}"</span>?
              This will remove the file from storage and cannot be undone.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(document.id)}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50"
          >
            {isDeleting && <Loader2 size={15} className="animate-spin" />}
            {isDeleting ? 'Deleting...' : 'Delete Document'}
          </button>
        </div>
      </div>
    </div>
  )
}

