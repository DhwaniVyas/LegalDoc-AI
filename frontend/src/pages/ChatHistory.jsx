import { MessageSquare } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'

export default function ChatHistory() {
  return (
    <div className="p-8">
      <PageHeader
        title="Chat History"
        subtitle="Browse and revisit your previous AI research conversations."
      />
      <div className="card">
        <EmptyState
          icon={MessageSquare}
          title="No chat history"
          description="Your AI research conversations will appear here once you start using the AI Research feature."
          action={
            <a href="/research" className="btn-primary">
              Start Research
            </a>
          }
        />
      </div>
    </div>
  )
}

