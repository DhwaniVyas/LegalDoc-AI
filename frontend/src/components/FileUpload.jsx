import { useState, useRef } from 'react'
import { Upload as UploadIcon, FileText, X, AlertCircle } from 'lucide-react'
import { formatFileSize } from '../services/documentService'

const MAX_FILES = 5
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

export default function FileUpload({ files, setFiles, error, setError }) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const normalizeName = (name) => name.trim().toLowerCase()

  const validateAndAddFiles = (newFiles) => {
    setError('')
    const incoming = Array.from(newFiles)

    // Check total count
    if (files.length + incoming.length > MAX_FILES) {
      setError(`You can upload a maximum of ${MAX_FILES} files at once.`)
      return
    }

    const validFiles = []
    const existingNormalized = new Set(files.map((f) => normalizeName(f.name)))

    for (const file of incoming) {
      const norm = normalizeName(file.name)

      // 1. Check extension
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setError(`"${file.name}" is not a PDF. Only .pdf files are accepted.`)
        return
      }
      // 2. Check empty
      if (file.size === 0) {
        setError(`"${file.name}" is empty (0 bytes).`)
        return
      }
      // 3. Check size <= 20MB
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`"${file.name}" exceeds the 20 MB size limit (${formatFileSize(file.size)}).`)
        return
      }
      // 4. Check duplicate in current selection (case-insensitive)
      if (existingNormalized.has(norm)) {
        setError(`"${file.name}" is already in your selected list. Duplicate files in the same upload are not allowed.`)
        return
      }

      existingNormalized.add(norm)
      validFiles.push(file)
    }

    setFiles((prev) => [...prev, ...validFiles])
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files)
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files)
      e.target.value = '' // Reset so same file can be re-selected if removed
    }
  }

  const handleRemove = (indexToRemove) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove))
    setError('')
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`card p-8 flex flex-col items-center justify-center border-2 border-dashed transition-all cursor-pointer text-center ${
          isDragging
            ? 'border-navy-600 bg-navy-50/50 scale-[0.99]'
            : 'border-slate-300 hover:border-navy-400 bg-slate-50/50 hover:bg-slate-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="w-12 h-12 rounded-full bg-navy-50 flex items-center justify-center text-navy-700 mb-3">
          <UploadIcon size={22} />
        </div>
        <p className="text-sm font-semibold text-slate-800">
          Drag and drop PDF documents here, or{' '}
          <span className="text-navy-700 underline underline-offset-2">browse files</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          PDF format only · Maximum 20 MB per file · Up to 5 files at a time
        </p>
      </div>

      {/* Validation Error banner */}
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p className="text-xs font-medium">{error}</p>
        </div>
      )}

      {/* Selected Files List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 px-1">
            <span>Selected Documents ({files.length} of {MAX_FILES})</span>
            <button
              type="button"
              onClick={() => { setFiles([]); setError('') }}
              className="text-slate-400 hover:text-red-600"
            >
              Clear all
            </button>
          </div>
          <div className="divide-y divide-slate-100 card overflow-hidden">
            {files.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center text-navy-700 shrink-0">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="p-1 rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                  title="Remove file"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
