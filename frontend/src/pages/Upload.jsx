import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, ArrowRight, Upload as UploadIcon, AlertCircle, PlusCircle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import FileUpload from '../components/FileUpload'
import UploadProgress from '../components/UploadProgress'
import { documentService } from '../services/documentService'

export default function Upload() {
  const navigate = useNavigate()
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSuccess, setUploadSuccess] = useState(null) // Array of uploaded doc objects

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one PDF file.')
      return
    }

    setError('')
    setIsUploading(true)
    setUploadProgress(0)

    try {
      const response = await documentService.uploadDocuments(files, (percent) => {
        setUploadProgress(percent)
      })

      setUploadSuccess(response.documents)
      setFiles([])
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(
        typeof detail === 'string'
          ? detail
          : 'Failed to upload documents. Please ensure all files are valid PDFs.'
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleReset = () => {
    setFiles([])
    setError('')
    setUploadSuccess(null)
    setUploadProgress(0)
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Upload Documents"
        subtitle="Upload your legal documents (PDF format) for secure storage and management."
        action={
          <Link to="/documents" className="btn-secondary">
            View My Documents
          </Link>
        }
      />

      {/* Success banner */}
      {uploadSuccess && (
        <div className="card p-6 bg-emerald-50/60 border-emerald-200 animate-in fade-in duration-200">
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
                {uploadSuccess.length === 1 ? 'document' : 'documents'}. Your files are securely stored and ready.
              </p>

              {/* Uploaded files summary */}
              <ul className="mt-3 divide-y divide-emerald-100 bg-white/70 rounded-lg p-3 text-xs text-slate-700 border border-emerald-200/60">
                {uploadSuccess.map((doc) => (
                  <li key={doc.id} className="py-1.5 flex items-center justify-between">
                    <span className="font-medium truncate max-w-md">{doc.original_filename}</span>
                    <span className="badge bg-emerald-100 text-emerald-800">Uploaded</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center gap-3">
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
        <div className="card p-6 space-y-6">
          <FileUpload
            files={files}
            setFiles={setFiles}
            error={error}
            setError={setError}
          />

          {isUploading && (
            <UploadProgress
              progress={uploadProgress}
              statusText={uploadProgress === 100 ? 'Processing and saving metadata...' : 'Uploading PDF files...'}
            />
          )}

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Files are stored in private isolated vaults accessible only by your account.
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
