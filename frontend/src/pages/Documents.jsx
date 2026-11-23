import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText,
  Upload,
  Search,
  LayoutGrid,
  List as ListIcon,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import DocumentCard from '../components/DocumentCard'
import DocumentTable from '../components/DocumentTable'
import DeleteDocumentModal from '../components/DeleteDocumentModal'
import { documentService } from '../services/documentService'

export default function Documents() {
  const [documents, setDocuments] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(9)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('table') // 'table' | 'grid'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Delete modal state
  const [docToDelete, setDocToDelete] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Fetch documents
  const fetchDocuments = useCallback(async (targetPage = 1, searchQuery = '') => {
    setLoading(true)
    setError('')
    try {
      const data = await documentService.getDocuments({
        page: targetPage,
        pageSize,
        search: searchQuery,
      })
      setDocuments(data.items)
      setTotal(data.total)
      setPage(data.page)
      setTotalPages(data.total_pages)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load documents. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [pageSize])

  useEffect(() => {
    fetchDocuments(page, search)
  }, [page, search, fetchDocuments])

  // Search handler
  const handleSearchChange = (e) => {
    setSearch(e.target.value)
    setPage(1)
  }

  // Download action
  const handleDownload = async (doc) => {
    try {
      await documentService.downloadDocument(doc.id, doc.original_filename)
    } catch {
      alert('Failed to download document.')
    }
  }

  // Delete modal trigger
  const handleDeleteClick = (doc) => {
    setDocToDelete(doc)
  }

  // Delete confirmation
  const handleConfirmDelete = async (docId) => {
    setIsDeleting(true)
    try {
      await documentService.deleteDocument(docId)
      setDocToDelete(null)
      // Refresh current page (or page 1 if this was the only item on the last page)
      const nextPage = documents.length === 1 && page > 1 ? page - 1 : page
      fetchDocuments(nextPage, search)
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete document.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeader
        title="My Documents"
        subtitle="Manage, preview, and download your uploaded legal PDF documents."
        action={
          <Link to="/upload" className="btn-primary">
            <Upload size={16} />
            <span>Upload PDF</span>
          </Link>
        }
      />

      {/* Filter and View toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search bar */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search documents by name..."
            className="input pl-9 pr-8"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(1) }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 bg-slate-100 rounded px-1.5 py-0.5"
            >
              Clear
            </button>
          )}
        </div>

        {/* Count badge & View mode switches */}
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <span className="badge bg-navy-50 text-navy-800 text-xs py-1 px-2.5 font-medium">
            {total} {total === 1 ? 'Document' : 'Documents'}
          </span>

          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-navy-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Table view"
            >
              <ListIcon size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-navy-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="card p-4 bg-red-50 border-red-200 text-red-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchDocuments(page, search)}
            className="btn-secondary text-xs py-1 px-2.5"
          >
            <RefreshCw size={13} />
            Retry
          </button>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner message="Loading your documents..." />
        </div>
      ) : documents.length === 0 ? (
        <div className="card">
          {search ? (
            <EmptyState
              icon={Search}
              title="No documents found"
              description={`No documents match your query "${search}".`}
              action={
                <button
                  onClick={() => { setSearch(''); setPage(1) }}
                  className="btn-secondary"
                >
                  Clear search
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Upload your legal documents (PDF) to begin building your AI research vault."
              action={
                <Link to="/upload" className="btn-primary">
                  <Upload size={16} />
                  <span>Upload Document</span>
                </Link>
              }
            />
          )}
        </div>
      ) : viewMode === 'table' ? (
        <DocumentTable
          documents={documents}
          onDownload={handleDownload}
          onDelete={handleDeleteClick}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onDownload={handleDownload}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">
            Showing <span className="font-medium text-slate-700">{(page - 1) * pageSize + 1}</span> to{' '}
            <span className="font-medium text-slate-700">
              {Math.min(page * pageSize, total)}
            </span>{' '}
            of <span className="font-medium text-slate-700">{total}</span> documents
          </p>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary py-1.5 px-2.5 text-xs disabled:opacity-40"
              title="Previous page"
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>

            <span className="text-xs font-medium px-3 text-slate-600">
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-secondary py-1.5 px-2.5 text-xs disabled:opacity-40"
              title="Next page"
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteDocumentModal
        isOpen={Boolean(docToDelete)}
        document={docToDelete}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDocToDelete(null)}
        isDeleting={isDeleting}
      />
    </div>
  )
}
