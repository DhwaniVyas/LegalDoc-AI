import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ArrowRight, Upload as UploadIcon, AlertCircle, PlusCircle, AlertTriangle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import FileUpload from '../components/FileUpload'
import UploadProgress from '../components/UploadProgress'
import { documentService } from '../services/documentService'

export default function Upload() {
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSuccess, setUploadSuccess] = useState(null) // Array of uploaded doc objects
  const [rejectedFiles, setRejectedFiles] = useState([])

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one PDF file.')
      return
    }

    setError('')
    setRejectedFiles([])
    setIsUploading(true)
    setUploadProgress(0)

    try {
      const response = await documentService.uploadDocuments(files, (percent) => {
        setUploadProgress(percent)
      })

      setUploadSuccess(response.documents)
      if (response.rejected && response.rejected.length > 0) {
        setRejectedFiles(response.rejected)
      }
      setFiles([])
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail

      if (status === 409) {
        setError(
          typeof detail === 'string'
            ? detail
            : 'This document already exists in your library. Duplicate uploads are not allowed.'
        )
      } else {
        setError(
          typeof detail === 'string'
            ? detail
            : 'Failed to upload documents. Please ensure all files are valid PDFs.'
        )
      }
    } finally {
      setIsUploading(false)
    }
  }

  const handleReset = () => {
    setFiles([])
    setError('')
    setUploadSuccess(null)
    setRejectedFiles([])
    setUploadProgress(0)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Upload Documents"
        subtitle="Upload legal PDF documents. Text extraction and chunking will begin automatically."
        action={
          <Link to="/documents" className="btn-secondary">
            View My Documents
          </Link>
        }
      />

      {/* Duplicate / Generic Error banner */}
      {error && !uploadSuccess && (
        <div className="card p-4 bg-red-50 border-red-200 text-red-800 flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-red-900">Upload Rejected</h4>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Success banner */}
      {uploadSuccess && (
        <div className="card p-6 bg-emerald-50/60 border-emerald-200 animate-in fade-in duration-200 space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 size={22} />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-emerald-900">
                Upload Successful!
              </h3>
              <p className="mt-1 text-sm text-emerald-700">
                Successfully uploaded {uploadSuccess.length}{' '}
                {uploadSuccess.length === 1 ? 'document' : 'documents'}. Text extraction and chunking started automatically in the background.
              </p>

              {/* Uploaded files summary */}
              <ul className="mt-3 divide-y divide-emerald-100 bg-white/70 rounded-lg p-3 text-xs text-slate-700 border border-emerald-200/60">
                {uploadSuccess.map((doc) => (
                  <li key={doc.id} className="py-2 flex items-center justify-between">
                    <span className="font-medium truncate max-w-md" title={doc.original_filename}>
                      {doc.original_filename}
                    </span>
                    <span className="badge bg-blue-50 text-blue-700 border border-blue-200">
                      Processing Started
                    </span>
                  </li>
                ))}
              </ul>

              {/* Rejected / Duplicate files in partial batch */}
              {rejectedFiles.length > 0 && (
                <div className="mt-4 p-3 bg-amber-50/80 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-2">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span>Some files could not be uploaded:</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-amber-700">
                    {rejectedFiles.map((r, i) => (
                      <li key={i} className="flex justify-between items-center gap-2">
                        <span className="font-medium truncate max-w-xs">{r.filename}</span>
                        <span className="text-[11px] text-amber-800 italic">{r.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5 flex items-center gap-3">
                <Link
                  to="/documents"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors shadow-sm"
                >
                  <span>Go to Documents</span>
                  <ArrowRight size={15} />
                </Link>
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn-secondary text-sm"
                >
                  <PlusCircle size={15} />
                  <span>Upload More</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Box Form */}
      {!uploadSuccess && (
        <div className="card p-6 space-y-6 bg-white">
          <FileUpload
            files={files}
            setFiles={setFiles}
            error={error}
            setError={setError}
          />

          {isUploading && (
            <UploadProgress
              progress={uploadProgress}
              statusText={uploadProgress === 100 ? 'Validating and saving documents...' : 'Uploading PDF files...'}
            />
          )}

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Files are processed with PyMuPDF and split into legal-boundary chunks.
            </p>

            <button
              type="button"
              onClick={handleUpload}
              disabled={files.length === 0 || isUploading}
              className="btn-primary min-w-[140px] justify-center"
            >
              <UploadIcon size={16} />
              <span>{isUploading ? 'Uploading...' : `Upload (${files.length})`}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
