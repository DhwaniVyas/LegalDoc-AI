import { useState, useEffect, useRef } from 'react'
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
  Clock,
  Zap,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { documentService } from '../services/documentService'
import LegalAnswerRenderer from '../components/LegalAnswerRenderer'
import CitationVerificationModal from '../components/CitationVerificationModal'

const FormattedLegalAnswer = LegalAnswerRenderer

const EXAMPLE_QUESTIONS = [
  'Explain the Right to Equality under the Constitution of India.',
  'What are the prohibited grounds of discrimination under Article 15?',
  'Explain equality of opportunity in public employment under Article 16.',
  'Compare Articles 14 and 15 in detail.',
  'What constitutes a material breach and what are the remedies?',
]

export default function AskQuestion() {
  const [searchParams] = useSearchParams()
  const initialDocId = searchParams.get('document_id') || ''

  const [question, setQuestion] = useState('')
  const [selectedDocId, setSelectedDocId] = useState(initialDocId)
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)

  // QA Request & Streaming state
  const [asking, setAsking] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [useStreaming, setUseStreaming] = useState(true)
  const [stageMessage, setStageMessage] = useState('')
  const [qaError, setQaError] = useState('')
  const [qaErrorStatus, setQaErrorStatus] = useState(null)
  const [qaResponse, setQaResponse] = useState(null)
  const [hasAsked, setHasAsked] = useState(false)

  // Interactive PDF citation verification modal state
  const [citationModalOpen, setCitationModalOpen] = useState(false)
  const [activeCitationSource, setActiveCitationSource] = useState(null)

  const abortControllerRef = useRef(null)

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

    if (useStreaming) {
      setIsStreaming(true)
      setStageMessage('Searching indexed documents and expanding adjacent legal provisions...')
      abortControllerRef.current = new AbortController()

      let currentSources = []

      await documentService.askQuestionStream({
        question: cleanQ,
        documentId: selectedDocId || null,
        signal: abortControllerRef.current.signal,
        onSources: (sources, timings) => {
          currentSources = sources
          setStageMessage('Generating grounded legal analysis with Groq...')
          setQaResponse({
            question: cleanQ,
            answer: '',
            sources,
            timings,
            status: 'answered',
          })
          setHasAsked(true)
        },
        onDelta: (textChunk) => {
          setStageMessage('')
          setQaResponse((prev) => ({
            ...prev,
            answer: (prev?.answer || '') + textChunk,
          }))
        },
        onDone: (finalData) => {
          setIsStreaming(false)
          setAsking(false)
          setStageMessage('')
          setQaResponse((prev) => ({
            ...prev,
            answer: finalData.answer,
            status: finalData.status,
            sources: currentSources.length > 0 ? currentSources : (prev?.sources || []),
            timings: finalData.timings,
          }))
        },
        onError: (err, status) => {
          setIsStreaming(false)
          setAsking(false)
          setStageMessage('')
          setQaErrorStatus(status || 500)
          setQaError(err.message || 'Failed to generate answer. Please try again.')
        },
      })
    } else {
      // Non-streaming fallback
      try {
        setStageMessage('Researching documents and generating grounded answer...')
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
        setStageMessage('')
      }
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

  const handleOpenCitationModal = (citationId, sourcesList) => {
    const sources = sourcesList || qaResponse?.sources || []
    const found = sources.find((s) => s.citation_id === citationId)
    if (found) {
      setActiveCitationSource(found)
      setCitationModalOpen(true)
    }
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
        subtitle="Ask complex legal questions grounded strictly in your indexed documents, powered by multi-aspect semantic retrieval, contiguous clause expansion, and Groq (openai/gpt-oss-120b)."
      />

      {/* Privacy Notice Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-600">
        <Info size={18} className="text-navy-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-800">
            Privacy & Grounding Guarantee
          </p>
          <p>
            Relevant extracted text passages from your indexed documents are retrieved via local vector embeddings, enriched with adjacent provisions, and passed to Groq. Responses are grounded strictly in your files and do not constitute formal legal counsel.
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
              placeholder="E.g., Explain the Right to Equality under the Constitution of India, covering Articles 14 through 18."
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent text-sm resize-none"
            />
          </div>

          {/* Form Actions & Scope Filter */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
            {/* Scope Filter & Streaming Toggle */}
            <div className="flex flex-wrap items-center gap-4">
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

              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useStreaming}
                  onChange={(e) => setUseStreaming(e.target.checked)}
                  className="rounded text-navy-600 focus:ring-navy-500 h-3.5 w-3.5"
                />
                <span className="inline-flex items-center gap-1 font-medium">
                  <Zap size={13} className="text-amber-500" />
                  Real-time Progressive Streaming
                </span>
              </label>
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
                  <span>Researching with Groq...</span>
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
                  ? 'Groq Service Temporarily Unavailable (503)'
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

      {/* Loading State with Stage Status */}
      {asking && stageMessage && (
        <div className="card p-8 flex flex-col items-center justify-center text-center space-y-3 bg-white border border-slate-200 shadow-sm animate-pulse">
          <Loader2 size={32} className="text-navy-600 animate-spin" />
          <div className="space-y-1">
            <h3 className="font-semibold text-slate-800 text-sm">
              {stageMessage}
            </h3>
            <p className="text-xs text-slate-500 max-w-md">
              Executing multi-aspect vector retrieval, expanding adjacent statutory clauses, and generating grounded analysis.
            </p>
          </div>
        </div>
      )}

      {/* Answer & Sources Section */}
      {hasAsked && qaResponse && (
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
                    Generated Legal Analysis
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Grounded in {qaResponse.sources?.length || 0} retrieved document passages
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {getStatusBadge(qaResponse.status)}
              </div>
            </div>

            {/* Answer Content rendered with formatted markdown */}
            <div className="text-sm leading-relaxed text-slate-800 font-sans">
              <FormattedLegalAnswer
                text={qaResponse.answer}
                onCitationClick={(cid) => {
                  scrollToSource(cid)
                  handleOpenCitationModal(cid, qaResponse.sources)
                }}
                scrollToSource={scrollToSource}
                isStreaming={isStreaming}
              />
            </div>

            {/* Stage Timings Badge */}
            {qaResponse.timings && (
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-mono">
                <span className="flex items-center gap-1 font-sans font-medium text-slate-600">
                  <Clock size={12} className="text-navy-600" />
                  Response Pipeline:
                </span>
                {qaResponse.timings.retrieval_ms !== undefined && (
                  <span>Retrieval: {qaResponse.timings.retrieval_ms}ms</span>
                )}
                {qaResponse.timings.adjacent_expansion_ms !== undefined && (
                  <span>Adjacent Expansion: {qaResponse.timings.adjacent_expansion_ms}ms</span>
                )}
                {qaResponse.timings.generation_ms !== undefined && (
                  <span>Generation: {(qaResponse.timings.generation_ms / 1000).toFixed(1)}s</span>
                )}
                {qaResponse.timings.total_ms !== undefined && (
                  <span className="font-semibold text-navy-800">
                    Total: {(qaResponse.timings.total_ms / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            )}

            {/* Insufficient Evidence Guidance */}
            {qaResponse.status === 'insufficient_evidence' && (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p>
                  The AI determined that the indexed documents do not contain sufficient evidence to address this question completely. To prevent legal hallucination, only available excerpts were used.
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

                      {/* Actions: Verify in Modal or Open in New Tab */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenCitationModal(source.citation_id, qaResponse.sources)}
                          className="btn-ghost py-1 px-2.5 text-xs text-navy-800 hover:bg-navy-50 inline-flex items-center gap-1 font-semibold border border-navy-200 rounded"
                          title="Open interactive PDF viewer at this page"
                        >
                          <Eye size={13} className="text-navy-700" />
                          <span>Verify in PDF (Page {source.page_number})</span>
                        </button>

                        <Link
                          to={`/documents/${source.document_id}/preview?page=${source.page_number}&citation=${source.citation_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-ghost p-1 text-xs text-slate-500 hover:text-navy-900 inline-flex items-center"
                          title="Open in full tab"
                        >
                          <ExternalLink size={13} />
                        </Link>
                      </div>
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

      {/* Interactive PDF Citation Verification Modal */}
      <CitationVerificationModal
        isOpen={citationModalOpen}
        onClose={() => setCitationModalOpen(false)}
        citation={activeCitationSource}
        allSources={qaResponse?.sources || []}
        onSelectCitation={(s) => {
          setActiveCitationSource(s)
          scrollToSource(s.citation_id)
        }}
      />
    </div>
  )
}
