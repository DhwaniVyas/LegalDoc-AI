import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Edit2,
  Send,
  Loader2,
  Sparkles,
  FileText,
  Eye,
  ExternalLink,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Clock,
  BookOpen,
  Scale,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Square,
} from 'lucide-react'
import { conversationService } from '../services/conversationService'
import { documentService, formatDate } from '../services/documentService'
import { useAuth } from '../context/AuthContext'
import LegalAnswerRenderer from '../components/LegalAnswerRenderer'

const FormattedLegalAnswer = LegalAnswerRenderer

const SUGGESTED_PROMPTS = [
  'Explain the Right to Equality under the Constitution of India.',
  'What are the exceptions to Article 15 prohibition of discrimination?',
  'Explain equality of opportunity in public employment under Article 16.',
  'What remedies are available for enforcement of fundamental rights under Article 32?',
]

export default function Chat() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  // Conversations list state
  const [conversations, setConversations] = useState([])
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [sidebarFilter, setSidebarFilter] = useState('')

  // Active conversation state
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)

  // Document selection
  const [documents, setDocuments] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [selectedDocIds, setSelectedDocIds] = useState([])
  const [showDocSelector, setShowDocSelector] = useState(false)

  // Message input & streaming state
  const [inputMessage, setInputMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingSources, setStreamingSources] = useState([])
  const [stageMessage, setStageMessage] = useState('')
  const [errorBanner, setErrorBanner] = useState('')

  // Selected citation for viewing details
  const [activeCitationId, setActiveCitationId] = useState(null)
  const [expandedSourcesMsgId, setExpandedSourcesMsgId] = useState(null)

  // Rename modal/inline state
  const [editingConvId, setEditingConvId] = useState(null)
  const [editTitle, setEditTitle] = useState('')

  // Delete modal state
  const [deletingConv, setDeletingConv] = useState(null)

  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const abortControllerRef = useRef(null)

  // Scroll to bottom
  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  useEffect(() => {
    scrollToBottom('smooth')
  }, [messages, streamingText, stageMessage])

  // Load user's conversations and documents on mount
  useEffect(() => {
    loadConversations()
    loadDocuments()
  }, [])

  // When route parameter conversationId changes, load that conversation
  useEffect(() => {
    if (conversationId) {
      loadConversationDetails(conversationId)
    } else {
      setActiveConversation(null)
      setMessages([])
      setSelectedDocIds([])
    }
  }, [conversationId])

  const loadConversations = async () => {
    try {
      const data = await conversationService.getConversations()
      setConversations(data)
    } catch (err) {
      console.error('Failed to load conversations:', err)
    } finally {
      setLoadingConversations(false)
    }
  }

  const loadDocuments = async () => {
    try {
      const res = await documentService.getDocuments({ pageSize: 100 })
      const completed = (res.items || []).filter((d) => d.processing_status === 'completed')
      setDocuments(completed)
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      setLoadingDocs(false)
    }
  }

  const loadConversationDetails = async (id) => {
    setLoadingMessages(true)
    setErrorBanner('')
    try {
      const conv = await conversationService.getConversation(id)
      setActiveConversation(conv)
      setMessages(conv.messages || [])
      setSelectedDocIds(conv.document_ids || [])
    } catch (err) {
      console.error('Failed to load conversation details:', err)
      setErrorBanner('Conversation could not be loaded or was deleted.')
      setActiveConversation(null)
    } finally {
      setLoadingMessages(false)
    }
  }

  // Create new conversation
  const handleNewChat = async () => {
    try {
      const newConv = await conversationService.createConversation({
        title: 'New Conversation',
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
      })
      setConversations((prev) => [newConv, ...prev])
      navigate(`/chat/${newConv.id}`)
    } catch (err) {
      console.error('Failed to create new conversation:', err)
    }
  }

  // Handle document scope change
  const handleToggleDocScope = async (docId) => {
    let updated = []
    if (selectedDocIds.includes(docId)) {
      updated = selectedDocIds.filter((id) => id !== docId)
    } else {
      updated = [...selectedDocIds, docId]
    }
    setSelectedDocIds(updated)

    if (activeConversation) {
      try {
        await conversationService.updateConversation(activeConversation.id, {
          document_ids: updated,
        })
        setActiveConversation((prev) => ({ ...prev, document_ids: updated }))
      } catch (err) {
        console.error('Failed to update conversation document scope:', err)
      }
    }
  }

  const handleSelectAllDocs = async () => {
    setSelectedDocIds([])
    if (activeConversation) {
      try {
        await conversationService.updateConversation(activeConversation.id, {
          document_ids: [],
        })
        setActiveConversation((prev) => ({ ...prev, document_ids: [] }))
      } catch (err) {
        console.error('Failed to reset document scope:', err)
      }
    }
  }

  // Start renaming a conversation
  const handleStartRename = (conv, e) => {
    e.stopPropagation()
    setEditingConvId(conv.id)
    setEditTitle(conv.title)
  }

  const handleSaveRename = async (convId, e) => {
    if (e) e.preventDefault()
    const cleanTitle = editTitle.trim()
    if (!cleanTitle) return
    try {
      await conversationService.updateConversation(convId, { title: cleanTitle })
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: cleanTitle } : c))
      )
      if (activeConversation?.id === convId) {
        setActiveConversation((prev) => ({ ...prev, title: cleanTitle }))
      }
      setEditingConvId(null)
    } catch (err) {
      console.error('Failed to rename conversation:', err)
    }
  }

  // Delete conversation
  const handleDeleteConversation = async () => {
    if (!deletingConv) return
    const idToDelete = deletingConv.id
    try {
      await conversationService.deleteConversation(idToDelete)
      setConversations((prev) => prev.filter((c) => c.id !== idToDelete))
      setDeletingConv(null)
      if (activeConversation?.id === idToDelete) {
        navigate('/chat')
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    }
  }

  // Stop streaming response
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsSending(false)
      setStageMessage('')
    }
  }

  // Send message
  const handleSendMessage = async (customText = null) => {
    const textToSend = (customText !== null ? customText : inputMessage).trim()
    if (!textToSend || isSending) return

    setInputMessage('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setErrorBanner('')
    setIsSending(true)
    setStreamingText('')
    setStreamingSources([])
    setStageMessage('Searching indexed documents and expanding legal provisions...')

    let targetConvId = activeConversation?.id

    // If no active conversation, create one first
    if (!targetConvId) {
      try {
        const newConv = await conversationService.createConversation({
          title: textToSend.substring(0, 40),
          document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
        })
        targetConvId = newConv.id
        setConversations((prev) => [newConv, ...prev])
        setActiveConversation(newConv)
        navigate(`/chat/${newConv.id}`, { replace: true })
      } catch (err) {
        setIsSending(false)
        setErrorBanner('Failed to create new conversation. Please try again.')
        return
      }
    }

    abortControllerRef.current = new AbortController()
    let currentSources = []

    await conversationService.sendMessageStream(
      targetConvId,
      {
        message: textToSend,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
      },
      {
        signal: abortControllerRef.current.signal,
        onUserMessage: (userMsg) => {
          setMessages((prev) => [...prev, userMsg])
          // Update conversation title in sidebar if auto-titled
          loadConversations()
        },
        onSources: (sources) => {
          currentSources = sources
          setStreamingSources(sources)
          setStageMessage('Generating grounded legal analysis with Groq...')
        },
        onDelta: (chunk) => {
          setStageMessage('')
          setStreamingText((prev) => prev + chunk)
        },
        onDone: (doneData) => {
          setIsSending(false)
          setStageMessage('')
          setStreamingText('')
          setStreamingSources([])

          const assistantMsg = {
            id: `msg-${Date.now()}`,
            conversation_id: targetConvId,
            role: 'assistant',
            content: doneData.answer,
            sources: currentSources,
            created_at: new Date().toISOString(),
          }

          setMessages((prev) => [...prev, assistantMsg])
          loadConversations()
        },
        onError: (err) => {
          setIsSending(false)
          setStageMessage('')
          setErrorBanner(err.message || 'Error generating AI response.')
        },
      }
    )
  }

  // Handle textarea keypress (Enter to send, Shift+Enter for newline)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Auto-resize textarea
  const handleTextareaInput = (e) => {
    setInputMessage(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`
  }

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(sidebarFilter.toLowerCase())
  )

  const getScopeLabel = () => {
    if (selectedDocIds.length === 0) return 'All Indexed Documents'
    if (selectedDocIds.length === 1) {
      const doc = documents.find((d) => d.id === selectedDocIds[0])
      return doc ? doc.original_filename : '1 Document Selected'
    }
    return `${selectedDocIds.length} Documents Selected`
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50">
      {/* ── Left Sidebar: Conversation List ────────────────────────────── */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
        {/* Top actions */}
        <div className="p-4 border-b border-slate-200 space-y-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-navy-800 hover:bg-navy-900 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <Plus size={18} />
            <span>New Chat</span>
          </button>

          {/* Search conversations */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={sidebarFilter}
              onChange={(e) => setSidebarFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-navy-600 focus:border-navy-600 transition-colors"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingConversations ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 size={24} className="animate-spin mb-2" />
              <p className="text-xs">Loading conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              {sidebarFilter ? 'No matching conversations' : 'No conversations yet. Click "New Chat" to begin.'}
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isActive = activeConversation?.id === conv.id
              const isEditing = editingConvId === conv.id

              return (
                <div
                  key={conv.id}
                  onClick={() => navigate(`/chat/${conv.id}`)}
                  className={`group relative p-3 text-left transition-colors cursor-pointer ${
                    isActive ? 'bg-navy-50/80 border-l-4 border-navy-700' : 'hover:bg-slate-50'
                  }`}
                >
                  {isEditing ? (
                    <form
                      onSubmit={(e) => handleSaveRename(conv.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        autoFocus
                        className="flex-1 px-2 py-1 text-xs border border-navy-400 rounded focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="p-1 text-emerald-600 hover:text-emerald-700"
                        title="Save title"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingConvId(null)}
                        className="p-1 text-slate-400 hover:text-slate-600"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </form>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={`text-xs font-semibold truncate ${isActive ? 'text-navy-900 font-bold' : 'text-slate-800'}`}>
                          {conv.title}
                        </span>

                        {/* Hover actions */}
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => handleStartRename(conv, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded"
                            title="Rename"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeletingConv(conv)
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {conv.last_message_preview && (
                        <p className="text-[11px] text-slate-500 truncate mb-1">
                          {conv.last_message_preview}
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>{formatDate(conv.last_message_at)}</span>
                        {conv.message_count > 0 && (
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full font-medium">
                            {conv.message_count} {conv.message_count === 1 ? 'msg' : 'msgs'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Main Chat Area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
        {/* Top Header: Title & Document Scoper */}
        <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <Scale size={20} className="text-navy-700" />
            <h1 className="text-sm font-bold text-slate-900 truncate max-w-md">
              {activeConversation ? activeConversation.title : 'New Legal Research Chat'}
            </h1>
            {activeConversation && (
              <button
                type="button"
                onClick={(e) => handleStartRename(activeConversation, e)}
                className="text-slate-400 hover:text-slate-700 p-1"
                title="Rename conversation"
              >
                <Edit2 size={13} />
              </button>
            )}
          </div>

          {/* Document Scope Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDocSelector(!showDocSelector)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            >
              <FileText size={14} className="text-navy-700" />
              <span>Scope: <strong className="font-semibold text-slate-900">{getScopeLabel()}</strong></span>
              <ChevronDown size={14} className="text-slate-500" />
            </button>

            {/* Scope dropdown */}
            {showDocSelector && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-slate-200 p-2 z-30">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-xs font-semibold text-slate-700">
                  <span>Scope Chat Context</span>
                  <button
                    type="button"
                    onClick={handleSelectAllDocs}
                    className="text-[11px] text-navy-700 hover:underline"
                  >
                    Select All Docs
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1">
                  {loadingDocs ? (
                    <div className="p-3 text-center text-xs text-slate-400">Loading documents...</div>
                  ) : documents.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">No indexed documents found</div>
                  ) : (
                    documents.map((doc) => {
                      const isChecked = selectedDocIds.includes(doc.id)
                      return (
                        <label
                          key={doc.id}
                          className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded text-xs text-slate-800 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleDocScope(doc.id)}
                            className="rounded border-slate-300 text-navy-600 focus:ring-navy-500"
                          />
                          <span className="truncate flex-1" title={doc.original_filename}>
                            {doc.original_filename}
                          </span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages scroll area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorBanner && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorBanner}</span>
            </div>
          )}

          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Loader2 size={28} className="animate-spin mb-2" />
              <p className="text-sm">Loading message history...</p>
            </div>
          ) : messages.length === 0 && !isSending ? (
            /* Welcome / Empty State */
            <div className="max-w-2xl mx-auto py-12 text-center">
              <div className="w-12 h-12 bg-navy-100 text-navy-800 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Sparkles size={24} />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                Conversational Legal Assistant
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Ask questions and follow-ups grounded exclusively in your indexed legal documents.
                Pronouns and contextual references will be resolved seamlessly.
              </p>

              <div className="text-left bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">
                  <HelpCircle size={14} className="text-navy-600" />
                  <span>Suggested Prompts</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {SUGGESTED_PROMPTS.map((prompt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSendMessage(prompt)}
                      className="text-left text-xs text-slate-700 hover:text-navy-900 bg-slate-50 hover:bg-navy-50 p-2.5 rounded-lg border border-slate-200 transition-colors flex items-center justify-between group"
                    >
                      <span>{prompt}</span>
                      <ChevronRight size={14} className="text-slate-400 group-hover:text-navy-700 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Message list */
            messages.map((msg) => {
              const isUser = msg.role === 'user'
              const hasSources = msg.sources && msg.sources.length > 0
              const isSourcesExpanded = expandedSourcesMsgId === msg.id

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-4xl ${isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-full bg-navy-700 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                      <Scale size={16} />
                    </div>
                  )}

                  <div className={`space-y-2 max-w-2xl ${isUser ? 'items-end' : 'items-start'}`}>
                    {/* Message Bubble */}
                    <div
                      className={`p-4 rounded-2xl text-sm leading-relaxed ${
                        isUser
                          ? 'bg-navy-800 text-white rounded-br-xs shadow-xs'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs shadow-xs'
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <FormattedLegalAnswer
                          text={msg.content}
                          onCitationClick={(cid) => {
                            setExpandedSourcesMsgId(msg.id)
                            setActiveCitationId(cid)
                          }}
                        />
                      )}
                    </div>

                    {/* Assistant Source Citations Accordion */}
                    {!isUser && hasSources && (
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs text-xs">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSourcesMsgId(isSourcesExpanded ? null : msg.id)
                          }
                          className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <BookOpen size={14} className="text-navy-700" />
                            <span>Retrieved Document Sources ({msg.sources.length})</span>
                          </div>
                          <ChevronDown
                            size={14}
                            className={`transform transition-transform text-slate-400 ${
                              isSourcesExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {isSourcesExpanded && (
                          <div className="p-3 space-y-2.5 divide-y divide-slate-100 max-h-80 overflow-y-auto">
                            {msg.sources.map((s) => {
                              const isHighlighted = activeCitationId === s.citation_id
                              return (
                                <div
                                  key={s.citation_id}
                                  id={`citation-${s.citation_id}`}
                                  className={`pt-2.5 first:pt-0 transition-colors ${
                                    isHighlighted ? 'p-2 bg-navy-50/70 rounded-lg border border-navy-200' : ''
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-navy-800 bg-navy-100 px-1.5 py-0.5 rounded text-[11px]">
                                        [{s.citation_id}]
                                      </span>
                                      <span className="font-semibold text-slate-800 truncate max-w-xs" title={s.filename}>
                                        {s.filename}
                                      </span>
                                    </div>

                                    {/* View in PDF page preview link */}
                                    <Link
                                      to={`/documents/${s.document_id}/preview?page=${s.page_number}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy-700 hover:text-navy-900 bg-navy-50 hover:bg-navy-100 px-2 py-0.5 rounded transition-colors"
                                    >
                                      <Eye size={11} />
                                      <span>Page {s.page_number}</span>
                                      <ExternalLink size={10} className="opacity-60" />
                                    </Link>
                                  </div>

                                  <p className="text-slate-600 bg-slate-50 p-2 rounded text-[11px] font-mono whitespace-pre-wrap leading-relaxed border border-slate-100">
                                    {s.content}
                                  </p>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className={`text-[10px] text-slate-400 px-1 ${isUser ? 'text-right' : 'text-left'}`}>
                      {formatDate(msg.created_at)}
                    </div>
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-full bg-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                      {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
                    </div>
                  )}
                </div>
              )
            })
          )}

          {/* Live Streaming Message Display */}
          {isSending && (
            <div className="flex gap-3 max-w-4xl mr-auto justify-start">
              <div className="w-8 h-8 rounded-full bg-navy-700 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Scale size={16} />
              </div>
              <div className="space-y-2 max-w-2xl">
                <div className="p-4 rounded-2xl bg-white text-slate-800 border border-slate-200 rounded-bl-xs shadow-xs text-sm">
                  {stageMessage && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-navy-700 mb-2">
                      <Loader2 size={14} className="animate-spin" />
                      <span>{stageMessage}</span>
                    </div>
                  )}
                  {streamingText && (
                    <FormattedLegalAnswer
                      text={streamingText}
                      isStreaming={true}
                      onCitationClick={(cid) => setActiveCitationId(cid)}
                    />
                  )}
                </div>

                {/* Streaming sources preview if already retrieved */}
                {streamingSources.length > 0 && (
                  <div className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg p-2 flex items-center gap-2">
                    <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                    <span>Grounding across {streamingSources.length} retrieved document passages...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-white border-t border-slate-200 shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex items-end bg-slate-50 border border-slate-300 rounded-2xl shadow-xs focus-within:ring-2 focus-within:ring-navy-600 focus-within:border-navy-600 focus-within:bg-white transition-all p-2">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask a legal question or follow-up (e.g. 'What are its exceptions?')..."
                rows={1}
                disabled={isSending}
                className="w-full bg-transparent resize-none px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none max-h-44"
              />

              <div className="flex items-center gap-1.5 shrink-0 pl-2">
                {isSending ? (
                  <button
                    type="button"
                    onClick={handleStopStreaming}
                    className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors shadow-sm"
                    title="Stop generation"
                  >
                    <Square size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!inputMessage.trim()}
                    className="p-2 bg-navy-800 hover:bg-navy-900 disabled:opacity-40 disabled:hover:bg-navy-800 text-white rounded-xl transition-colors shadow-sm"
                    title="Send message (Enter)"
                  >
                    <Send size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
              <span>Press <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[10px]">Shift+Enter</kbd> for newline</span>
              <span>Grounded exclusively in your indexed documents</span>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingConv && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Delete Conversation?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <strong>"{deletingConv.title}"</strong>?
              This will remove all message history in this thread. Uploaded documents and vector embeddings are not affected.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingConv(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConversation}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

