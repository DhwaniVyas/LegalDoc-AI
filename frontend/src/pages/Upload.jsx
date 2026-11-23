import { useState } from 'react'
import { Upload as UploadIcon, FileText, X, CheckCircle } from 'lucide-react'
import PageHeader from '../components/PageHeader'

export default function Upload() {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setSelectedFile(file)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }

  return (
    <div className="p-8">
      <PageHeader
        title="Upload Document"
        subtitle="Upload a legal document to begin AI-powered research and analysis."
      />

      <div className="max-w-2xl">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`card p-10 flex flex-col items-center justify-center border-2 border-dashed transition-colors cursor-pointer mb-5 ${
            isDragging ? 'border-navy-500 bg-navy-50' : 'border-slate-200 hover:border-navy-300'
          }`}
          onClick={() => document.getElementById('file-input').click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={handleFileChange}
          />
          <UploadIcon size={36} className={`mb-3 ${isDragging ? 'text-navy-500' : 'text-slate-300'}`} />
          <p className="text-sm font-medium text-slate-600">
            Drag & drop a document here, or{' '}
            <span className="text-navy-600 underline underline-offset-2">browse</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">PDF or DOCX · Max 50 MB</p>
        </div>

        {/* Selected file */}
        {selectedFile && (
          <div className="card p-4 flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg bg-navy-50 flex items-center justify-center shrink-0">
              <FileText size={16} className="text-navy-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{selectedFile.name}</p>
              <p className="text-xs text-slate-400">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <button
          disabled={!selectedFile}
          className="btn-primary w-full justify-center"
          onClick={() => alert('Upload API coming in next phase.')}
        >
          <CheckCircle size={16} />
          Upload Document
        </button>

        <p className="mt-3 text-xs text-slate-400 text-center">
          Document processing and AI indexing will be available in the next development phase.
        </p>
      </div>
    </div>
  )
}

