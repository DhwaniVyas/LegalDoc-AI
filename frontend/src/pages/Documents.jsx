import { FileText } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function Documents() {
  return (
    <div className="p-8">
      <PageHeader
        title="Documents"
        subtitle="Manage and browse your uploaded legal documents."
        action={
          <a href="/upload" className="btn-primary">
            <FileText size={16} />
            Upload New
          </a>
        }
      />

      {/* Filter bar placeholder */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Search documents…"
          className="input max-w-xs"
          disabled
        />
        <select className="input max-w-[160px]" disabled>
          <option>All types</option>
        </select>
      </div>

      <div className="card">
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload your first legal document to get started with AI-powered research."
          action={
            <a href="/upload" className="btn-primary">
              Upload Document
            </a>
          }
        />
      </div>
    </div>
  )
}

