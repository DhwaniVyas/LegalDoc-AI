import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Sparkles,
  FileText,
  Eye,
  Sliders,
  ChevronRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Layers,
  ArrowRight,
  BookOpen,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { documentService } from '../services/documentService'

const EXAMPLE_QUERIES = [
  'Termination of contract and required notice period',
  'Confidentiality obligations and non-disclosure terms',
  'Limitation of liability and indemnification clauses',
  'Payment milestones, default interest and penalties',
  'Governing law and dispute resolution jurisdiction',
]

export default function SemanticSearch() {
  const [query, setQuery] = useState('')
  const [selectedDocId, setSelectedDocId] = useState('')
  const [topK, setTopK] = useState(5)
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)

  // Search state
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchResponse, setSearchResponse] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)

  // Load user's indexed documents for the scope dropdown
  useEffect(() => {
    async function loadDocs() {
      try {
        const data = await documentService.getDocuments({ pageSize: 100 })
        setDocuments(data.items || [])
      } catch (err) {
        console.error('Failed to load documents for search filter:', err)
      } finally {
        setLoadingDocs(false)
      }
    }
    loadDocs()
  }, [])

  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    const cleanQuery = query.trim()
    if (!cleanQuery) return

    setSearching(true)
    setSearchError('')
    try {
      const res = await documentService.searchSemantic({
        query: cleanQuery,
        documentId: selectedDocId || null,
        topK,
      })
      setSearchResponse(res)
      setHasSearched(true)
    } catch (err) {
      setSearchError(err.response?.data?.detail || 'Failed to perform semantic search. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  const handleExampleClick = (example) => {
    setQuery(example)
  }

  const getRelevanceBadge = (distance) => {
    // Cosine distance = 1 - cosine_similarity (0 is identical, 2 is opposite)
    if (distance <= 0.4) {
      return (
        <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
          High Relevance ({distance.toFixed(3)})
        </span>
      )
    }
    if (distance <= 0.7) {
      return (
        <span className="badge bg-blue-50 text-blue-700 border border-blue-200">
          Moderate Relevance ({distance.toFixed(3)})
        </span>
      )
    }
    return (
      <span className="badge bg-amber-50 text-amber-700 border border-amber-200">
        Low Relevance ({distance.toFixed(3)})
      </span>
    )
  }

  const indexedDocsCount = documents.filter((d) => d.embedding_status === 'completed').length

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Semantic Vector Search"
        subtitle="Retrieve relevant legal document clauses using local dense vector embeddings (all-MiniLM-L6-v2) and cosine similarity."
      />

      {/* Warning if no documents are indexed yet */}
      {!loadingDocs && indexedDocsCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900">No documents indexed yet</p>
            <p className="text-amber-700 mt-0.5">
              To perform semantic search, upload a legal PDF document and ensure its vector embeddings are indexed.
            </p>
            <Link
              to="/upload"
              className="inline-flex items-center gap-1 font-medium text-amber-900 underline mt-2 hover:text-amber-950"
            >
              Go to Upload <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* Search Input Box Card */}
      <div className="card p-6 bg-white shadow-sm border border-slate-200">
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label htmlFor="search-query" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Legal Research Query / Question
            </label>
            <div className="relative">
              <div className="absolute top-3.5 left-3.5 text-slate-400">
                <Search size={18} />
              </div>
              <textarea
                id="search-query"
                rows={3}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Describe a legal concept, obligation, clause, or question... (e.g., 'What are the consequences of contract breach?')"
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent text-sm resize-none"
              />
            </div>
          </div>

          {/* Search Options Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-3">
              {/* Document Scope Filter */}
              <div className="flex items-center gap-2">
                <label htmlFor="doc-filter" className="text-xs font-medium text-slate-600">
                  Scope:
                </label>
                <select
                  id="doc-filter"
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="text-xs py-1.5 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-navy-600 max-w-xs truncate"
                >
                  <option value="">All Indexed Documents ({indexedDocsCount})</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.original_filename} {d.embedding_status !== 'completed' ? '(Not Indexed)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Top K Selector */}
              <div className="flex items-center gap-2">
                <label htmlFor="topk-filter" className="text-xs font-medium text-slate-600">
                  Results:
                </label>
                <select
                  id="topk-filter"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="text-xs py-1.5 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-navy-600"
                >
                  <option value={3}>Top 3</option>
                  <option value={5}>Top 5 (Recommended)</option>
                  <option value={10}>Top 10</option>
                  <option value={20}>Top 20</option>
                </select>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm"
            >
              {searching ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Searching Chunks...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Execute Semantic Search</span>
                </>
              )}
            </button>
          </div>

          {/* Example Queries */}
          <div className="pt-2">
            <span className="text-xs text-slate-400 font-medium block mb-1.5">Suggested Queries:</span>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_QUERIES.map((example, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleExampleClick(example)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-md transition-colors text-left"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>

      {/* Error Message */}
      {searchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-sm text-red-700">
          <AlertCircle size={18} className="shrink-0 text-red-600" />
          <span>{searchError}</span>
        </div>
      )}

      {/* Search Results */}
      {searching ? (
        <div className="card p-12 flex flex-col items-center justify-center text-center space-y-3 bg-white">
          <Loader2 size={32} className="text-navy-600 animate-spin" />
          <h3 className="font-semibold text-slate-800 text-base">Encoding Query & Searching Vectors...</h3>
          <p className="text-xs text-slate-500 max-w-md">
            Query embedding is being generated locally and compared against chunk vectors using cosine distance in ChromaDB.
          </p>
        </div>
      ) : hasSearched && searchResponse ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <span>Results for:</span>
              <span className="italic text-navy-800">"{searchResponse.query}"</span>
              <span className="badge bg-slate-100 text-slate-700">
                {searchResponse.total_results} {searchResponse.total_results === 1 ? 'chunk' : 'chunks'} found
              </span>
            </h2>
            <span className="text-xs text-slate-500">
              Sorted by vector cosine similarity (lower distance is closer)
            </span>
          </div>

          {searchResponse.results.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No relevant chunks found"
              description="No document chunks matched your query closely enough, or your document collection is empty."
            />
          ) : (
            <div className="space-y-3">
              {searchResponse.results.map((result, idx) => (
                <div
                  key={result.chunk_id || idx}
                  className="card p-5 bg-white border border-slate-200 hover:border-navy-300 transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-navy-50 flex items-center justify-center text-navy-700">
                        <FileText size={15} />
                      </div>
                      <span className="font-medium text-slate-900 text-sm">
                        {result.filename}
                      </span>
                      <span className="badge bg-slate-100 text-slate-600 text-xs">
                        Page {result.page_number}
                      </span>
                      <span className="badge bg-slate-50 text-slate-500 text-xs">
                        Chunk #{result.chunk_index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {getRelevanceBadge(result.distance)}
                      <Link
                        to={`/documents/${result.document_id}/preview`}
                        className="btn-ghost py-1 px-2 text-xs text-navy-700 hover:bg-navy-50 inline-flex items-center gap-1 font-medium"
                      >
                        <Eye size={13} />
                        Preview PDF
                      </Link>
                    </div>
                  </div>

                  {/* Chunk text content */}
                  <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100 text-xs leading-relaxed text-slate-800 font-mono whitespace-pre-wrap selection:bg-navy-200">
                    {result.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Initial Placeholder State */
        <div className="card p-8 bg-white border border-slate-200 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-navy-50 flex items-center justify-center mx-auto text-navy-700">
            <Sparkles size={24} />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="font-semibold text-slate-800 text-base">Ready for Semantic Research</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Enter any legal question or concept above to search across your document vault. The search compares meaning rather than just keyword matches.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

