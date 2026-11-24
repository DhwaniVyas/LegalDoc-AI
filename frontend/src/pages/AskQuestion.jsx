import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Sparkles,
  Search,
  FileText,
  Eye,
  AlertCircle,
  Loader2,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  BookOpen,
  Info,
  ExternalLink,
  ShieldCheck,
  FileQuestion,
  RotateCw,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { documentService } from '../services/documentService'

const EXAMPLE_QUESTIONS = [
  'What constitutes a material breach and what are the remedies?',
  'What are the required termination notice periods and conditions?',
  'What is the limitation of liability or maximum cap on damages?',
  'What confidentiality obligations and exclusions are specified?',
  'What is the governing law and agreed dispute resolution forum?',
]

export default function AskQuestion() {
  const [searchParams] = useSearchParams()
  const initialDocId = searchParams.get('document_id') || ''

  const [question, setQuestion] = useState('')
  const [selectedDocId, setSelectedDocId] = useState(initialDocId)
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)

  // QA Request state
  const [asking, setAsking] = useState(false)
  const [qaError, setQaError] = useState('')
  const [qaErrorStatus, setQaErrorStatus] = useState(null)
  const [qaResponse, setQaResponse] = useState(null)
  const [hasAsked, setHasAsked] = useState(false)

  // Load user's indexed documents
  useEffect(() => {
    async function loadDocs() {
      try {
        const data = await documentService.getDocuments({ pageSize: 100 })
        const docs = data.items || []
        setDocuments(docs)
        if (initialDocId && docs.some((d) => d.id === initialDocId)) {
          setSelectedDocId(initialDocId)
        }
      } catch (err) {
        console.error('Failed to load documents for QA:', err)
      } finally {
        setLoadingDocs(false)
      }
    }
    loadDocs()
  }, [initialDocId])

  const handleAsk = async (e) => {
    if (e) e.preventDefault()
    const cleanQ = question.trim()
    if (!cleanQ || asking) return

    setAsking(true)
    setQaError('')
    setQaErrorStatus(null)
    try {
      const res = await documentService.askQuestion({
        question: cleanQ,
        documentId: selectedDocId || null,
      })
      setQaResponse(res)
      setHasAsked(true)
    } catch (err) {
      setQaErrorStatus(err.response?.status || 500)
      setQaError(
        err.response?.data?.detail ||
          'Failed to generate answer. Please verify your connection and try again.'
      )
    } finally {
      setAsking(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleAsk()
    }
  }

  const scrollToSource = (citationId) => {
    const el = document.getElementById(`source-${citationId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-navy-600')
      setTimeout(() => el.classList.remove('ring-2', 'ring-navy-600'), 2500)
    }
  }

  // Render inline citation tags [S1] as interactive clickable badges
  const renderFormattedAnswer = (text) => {
    if (!text) return null
    const parts = text.split(/(\[S\d+\])/g)
    return parts.map((part, index) => {
      const match = part.match(/^\[(S\d+)\]$/)
      if (match) {
        const cid = match[1]
        return (
          <button
            key={index}
            type="button"
            onClick={() => scrollToSource(cid)}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-semibold bg-navy-100 text-navy-800 hover:bg-navy-200 transition-colors cursor-pointer border border-navy-200 align-baseline"
            title={`Jump to Source [${cid}]`}
          >
            [{cid}]
          </button>
        )
      }
      return <span key={index}>{part}</span>
    })
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'answered':
        return (
          <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 font-medium">
            <CheckCircle2 size={13} /> Grounded in Document Evidence
          </span>
        )
      case 'insufficient_evidence':
        return (
          <span className="badge bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5 font-medium">
            <AlertCircle size={13} /> Insufficient Evidence in Documents
          </span>
        )
      case 'no_relevant_sources':
        return (
          <span className="badge bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5 font-medium">
            <FileQuestion size={13} /> No Relevant Passages Found
          </span>
        )
      default:
        return null
    }
  }

  const indexedDocs = documents.filter((d) => d.embedding_status === 'completed')

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="AI Legal Question Answering"
        subtitle="Ask questions grounded strictly in your indexed legal documents, powered by semantic retrieval and Google Gemini."
      />

      {/* Privacy Notice Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-600">
        <Info size={18} className="text-navy-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-800">
            Privacy & Grounding Notice
          </p>
          <p>
            Relevant extracted text passages from your indexed documents are retrieved via local vector embeddings and sent to Google Gemini to formulate answers. Responses are grounded strictly in your files and do not constitute formal legal counsel.
          </p>
        </div>
      </div>

      {/* Warning if no documents are indexed */}
      {!loadingDocs && indexedDocs.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900">No indexed documents available</p>
            <p className="text-amber-700 mt-0.5">
              Upload and index a legal PDF to begin asking questions grounded in your documents.
            </p>
            <Link
              to="/upload"
              className="inline-flex items-center gap-1 font-medium text-amber-900 underline mt-2 hover:text-amber-950"
            >
              Upload a document <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* Question Form Card */}
      <div className="card p-6 bg-white shadow-sm border border-slate-200">
        <form onSubmit={handleAsk} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="qa-question"
                className="text-xs font-semibold text-slate-700 uppercase tracking-wider"
              >
                Your Legal Question
              </label>
              <span className="text-[11px] text-slate-400">
                {question.length}/2000 characters · <kbd className="font-mono bg-slate-100 px-1 rounded">Ctrl+Enter</kbd> to submit
              </span>
            </div>
            <textarea
              id="qa-question"
              rows={4}
              maxLength={2000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="E.g., What are the terms for contract termination, and what notice period must be provided?"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent text-sm resize-none"
            />
          </div>

          {/* Form Actions & Scope Filter */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
            {/* Scope Filter */}
            <div className="flex items-center gap-2">
              <label htmlFor="qa-scope" className="text-xs font-medium text-slate-600">
                Document Scope:
              </label>
              <select
                id="qa-scope"
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="text-xs py-1.5 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-navy-600 max-w-sm truncate"
              >
                <option value="">All Indexed Documents ({indexedDocs.length})</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.original_filename} {d.embedding_status !== 'completed' ? '(Not Indexed)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Ask Button */}
            <button
              type="submit"
              disabled={asking || !question.trim()}
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm"
            >
              {asking ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Researching with Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Ask Question</span>
                </>
              )}
            </button>
          </div>

          {/* Suggested Questions */}
          <div className="pt-2">
            <span className="text-xs text-slate-400 font-medium block mb-1.5">
              Suggested Questions:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_QUESTIONS.map((ex, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setQuestion(ex)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-md transition-colors text-left"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>

      {/* Error Banner with Retry Support */}
      {qaError && (
        <div
          className={`rounded-xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm ${
            qaErrorStatus === 503 || qaError.toLowerCase().includes('high demand') || qaError.toLowerCase().includes('unavailable')
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              size={20}
              className={`shrink-0 mt-0.5 ${
                qaErrorStatus === 503 || qaError.toLowerCase().includes('high demand') || qaError.toLowerCase().includes('unavailable')
                  ? 'text-amber-600'
                  : 'text-red-600'
              }`}
            />
            <div className="space-y-0.5">
              <p className="font-semibold text-xs uppercase tracking-wider">
                {qaErrorStatus === 503
                  ? 'Gemini Service Temporarily Overloaded (503)'
                  : qaErrorStatus === 429
                  ? 'Rate Limit / Quota Exceeded (429)'
                  : 'Question Processing Error'}
              </p>
              <p className="text-xs">{qaError}</p>
              {(qaErrorStatus === 503 || qaError.toLowerCase().includes('high demand')) && (
                <p className="text-[11px] text-amber-700/80 mt-1">
                  Your question has been preserved. Automatic retries were exhausted—click Retry to request again.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleAsk}
            disabled={asking || !question.trim()}
            className="self-end sm:self-center shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white border shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed border-slate-300 text-slate-800"
          >
            <RotateCw size={14} className={asking ? 'animate-spin' : ''} />
            <span>{asking ? 'Retrying...' : 'Retry'}</span>
          </button>
        </div>
      )}

      {/* Loading State */}
      {asking && (
        <div className="card p-12 flex flex-col items-center justify-center text-center space-y-4 bg-white border border-slate-200 shadow-sm">
          <Loader2 size={36} className="text-navy-600 animate-spin" />
          <div className="space-y-1">
            <h3 className="font-semibold text-slate-800 text-base">
              Analyzing Documents & Generating Answer
            </h3>
            <p className="text-xs text-slate-500 max-w-md">
              Retrieving relevant clauses from ChromaDB, applying strict legal grounding rules, and verifying citations with Gemini Flash.
            </p>
          </div>
        </div>
      )}

      {/* Answer & Sources Section */}
      {!asking && hasAsked && qaResponse && (
        <div className="space-y-6">
          {/* Answer Card */}
          <div className="card p-6 bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-navy-50 text-navy-700 flex items-center justify-center">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Generated Answer
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Grounded in {qaResponse.sources?.length || 0} retrieved document passages
                  </p>
                </div>
              </div>

              {getStatusBadge(qaResponse.status)}
            </div>

            {/* Answer Content */}
            <div className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap font-sans space-y-2">
              {renderFormattedAnswer(qaResponse.answer)}
            </div>

            {/* Insufficient Evidence Guidance */}
            {qaResponse.status === 'insufficient_evidence' && (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p>
                  The AI determined that your indexed documents do not contain sufficient evidence to fully address this question. To prevent misinformation, no speculative answers were invented.
                </p>
              </div>
            )}
          </div>

          {/* Sources Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span>Supporting Sources & Citations</span>
                <span className="badge bg-slate-100 text-slate-700 text-xs">
                  {qaResponse.sources?.length || 0}
                </span>
              </h3>
              <span className="text-xs text-slate-400">
                Click any citation tag [S1] above to jump to its source excerpt
              </span>
            </div>

            {qaResponse.sources?.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No supporting sources"
                description="No relevant excerpts were retrieved from your document vault."
              />
            ) : (
              <div className="space-y-3">
                {qaResponse.sources.map((source) => (
                  <div
                    key={source.citation_id}
                    id={`source-${source.citation_id}`}
                    className="card p-5 bg-white border border-slate-200 hover:border-slate-300 transition-all space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-navy-700 text-white px-2 py-0.5 rounded">
                          [{source.citation_id}]
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-slate-800 font-medium">
                          <FileText size={14} className="text-navy-600" />
                          <span>{source.filename}</span>
                        </div>
                        <span className="badge bg-slate-100 text-slate-600 text-xs">
                          Page {source.page_number}
                        </span>
                      </div>

                      {/* Link to PDF Preview with Page parameter */}
                      <Link
                        to={`/documents/${source.document_id}/preview?page=${source.page_number}`}
                        className="btn-ghost py-1 px-2.5 text-xs text-navy-700 hover:bg-navy-50 inline-flex items-center gap-1 font-medium"
                      >
                        <Eye size={13} />
                        <span>View Page {source.page_number} in Preview</span>
                      </Link>
                    </div>

                    {/* Excerpt content */}
                    <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100 text-xs leading-relaxed text-slate-800 font-mono whitespace-pre-wrap selection:bg-navy-200">
                      {source.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Initial Empty State */}
      {!asking && !hasAsked && (
        <div className="card p-8 bg-white border border-slate-200 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-navy-50 flex items-center justify-center mx-auto text-navy-700">
            <HelpCircle size={24} />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="font-semibold text-slate-800 text-base">
              Ask Any Legal Question
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              LegalDoc AI uses semantic retrieval and Google Gemini to provide answers directly cited from your uploaded PDFs. Type a question or choose an example above.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

