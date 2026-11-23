import { Search, Sparkles } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function AiResearch() {
  return (
    <div className="p-8">
      <PageHeader
        title="AI Research"
        subtitle="Ask questions about your legal documents using AI-powered semantic search."
      />

      {/* Query input */}
      <div className="max-w-3xl mb-8">
        <div className="card p-4 flex gap-3">
          <Search size={18} className="text-slate-400 shrink-0 mt-0.5" />
          <textarea
            rows={3}
            placeholder="Ask a question about your documents… (e.g. 'What are the indemnification clauses in the service agreement?')"
            className="flex-1 resize-none text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
            disabled
          />
        </div>
        <div className="flex justify-end mt-2">
          <button className="btn-primary" disabled>
            <Sparkles size={16} />
            Research
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          AI research requires at least one uploaded document. This feature will be fully available after the RAG pipeline is integrated.
        </p>
      </div>

      <EmptyState
        icon={Sparkles}
        title="No research sessions yet"
        description="Upload a document and start your first AI research session."
      />
    </div>
  )
}

