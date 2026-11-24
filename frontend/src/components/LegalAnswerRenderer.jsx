import React from 'react'

/**
 * Render inline markdown text with bolding, inline code, and interactive citation badges.
 */
export function renderInlineContent(text, handleCitation) {
  if (!text) return null

  // Split on [S1] / 【S1】 / [ S1 ] / [Source S1], **bold**, and `code`
  const tokenRegex = /([\[\u3010\(]\s*(?:source\s*)?S\d+\s*[\]\u3011\)]|\*\*.*?\*\*|`[^`]+`)/gi
  const tokens = text.split(tokenRegex)

  return tokens.map((token, idx) => {
    if (!token) return null

    // Citation tag match: e.g. [S1], 【S1】, [ S1 ], [Source S2]
    const cidMatch = token.match(/^[\[\u3010\(]\s*(?:source\s*)?(S\d+)\s*[\]\u3011\)]$/i)
    if (cidMatch) {
      const cid = cidMatch[1].toUpperCase()
      return (
        <button
          key={idx}
          type="button"
          onClick={() => handleCitation && handleCitation(cid)}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-semibold bg-navy-100 text-navy-800 hover:bg-navy-200 transition-colors cursor-pointer border border-navy-200 align-baseline select-none"
          title={`View Source [${cid}]`}
        >
          [{cid}]
        </button>
      )
    }

    // Bold text match: **text**
    const boldMatch = token.match(/^\*\*(.*?)\*\*$/)
    if (boldMatch) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {renderInlineContent(boldMatch[1], handleCitation)}
        </strong>
      )
    }

    // Inline code match: `code`
    const codeMatch = token.match(/^`([^`]+)`$/)
    if (codeMatch) {
      return (
        <code key={idx} className="font-mono text-xs bg-slate-100 text-slate-800 px-1 py-0.5 rounded border border-slate-200">
          {codeMatch[1]}
        </code>
      )
    }

    return <span key={idx}>{token}</span>
  })
}

/**
 * Parses markdown table lines into headers and rows.
 */
function parseMarkdownTable(lines) {
  const parsedRows = lines.map((line) => {
    let trimmed = line.trim()
    if (trimmed.startsWith('|')) trimmed = trimmed.substring(1)
    if (trimmed.endsWith('|')) trimmed = trimmed.substring(0, trimmed.length - 1)
    return trimmed.split('|').map((cell) => cell.trim())
  })

  if (parsedRows.length === 0) return null

  // Header is row 0
  const headers = parsedRows[0]

  // Check if row 1 is a delimiter row (e.g. :---, ---:, ---)
  let bodyStartIndex = 1
  if (
    parsedRows.length > 1 &&
    parsedRows[1].every((cell) => /^:?-+:?$/.test(cell.replace(/\s+/g, '')))
  ) {
    bodyStartIndex = 2
  }

  const rows = parsedRows.slice(bodyStartIndex).filter((row) => row.some((cell) => cell.length > 0))

  return { headers, rows }
}

/**
 * Full structured legal answer renderer.
 * Handles headings (#, ##, ###, ####), lists (ol, ul), markdown tables, blockquotes,
 * inline bolding, inline code, and interactive citation badges.
 */
export default function LegalAnswerRenderer({
  text,
  onCitationClick,
  scrollToSource,
  isStreaming = false,
  className = '',
}) {
  if (!text) return null

  const handleCitation = onCitationClick || scrollToSource

  const lines = text.split('\n')
  const elements = []
  let listItems = []
  let listType = null
  let tableLines = []

  const flushList = (key) => {
    if (listItems.length === 0) return
    if (listType === 'ol') {
      elements.push(
        <ol key={`list-${key}`} className="list-decimal pl-6 my-2 space-y-1.5 text-slate-800 text-sm">
          {listItems.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInlineContent(item, handleCitation)}
            </li>
          ))}
        </ol>
      )
    } else {
      elements.push(
        <ul key={`list-${key}`} className="list-disc pl-6 my-2 space-y-1.5 text-slate-800 text-sm">
          {listItems.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInlineContent(item, handleCitation)}
            </li>
          ))}
        </ul>
      )
    }
    listItems = []
    listType = null
  }

  const flushTable = (key) => {
    if (tableLines.length === 0) return
    const tableData = parseMarkdownTable(tableLines)
    tableLines = []
    if (!tableData) return

    const { headers, rows } = tableData
    elements.push(
      <div key={`table-${key}`} className="overflow-x-auto my-3 rounded-lg border border-slate-200 shadow-xs">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-slate-800">
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-r border-slate-200 last:border-r-0"
                >
                  {renderInlineContent(h, handleCitation)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-slate-50/60 transition-colors">
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className="px-3.5 py-2 text-slate-800 border-r border-slate-200 last:border-r-0 align-top leading-relaxed"
                  >
                    {renderInlineContent(cell, handleCitation)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim()

    // Table row detection: lines starting with | and containing |
    if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      flushList(idx)
      tableLines.push(trimmed)
      return
    } else if (tableLines.length > 0) {
      flushTable(idx)
    }

    // Headings
    if (trimmed.startsWith('#### ')) {
      flushList(idx)
      elements.push(
        <h4 key={idx} className="text-sm font-bold text-navy-950 mt-3.5 mb-1.5 uppercase tracking-wide">
          {renderInlineContent(trimmed.substring(5), handleCitation)}
        </h4>
      )
      return
    }
    if (trimmed.startsWith('### ')) {
      flushList(idx)
      elements.push(
        <h3 key={idx} className="text-base font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-100">
          {renderInlineContent(trimmed.substring(4), handleCitation)}
        </h3>
      )
      return
    }
    if (trimmed.startsWith('## ')) {
      flushList(idx)
      elements.push(
        <h2 key={idx} className="text-lg font-bold text-slate-900 mt-5 mb-2 pb-1 border-b border-slate-200">
          {renderInlineContent(trimmed.substring(3), handleCitation)}
        </h2>
      )
      return
    }
    if (trimmed.startsWith('# ')) {
      flushList(idx)
      elements.push(
        <h1 key={idx} className="text-xl font-bold text-slate-900 mt-6 mb-2">
          {renderInlineContent(trimmed.substring(2), handleCitation)}
        </h1>
      )
      return
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      flushList(idx)
      elements.push(<hr key={idx} className="my-4 border-slate-200" />)
      return
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flushList(idx)
      elements.push(
        <blockquote key={idx} className="border-l-4 border-navy-500 bg-slate-50 pl-3 py-1.5 my-2 text-slate-700 italic text-sm rounded-r">
          {renderInlineContent(trimmed.substring(2), handleCitation)}
        </blockquote>
      )
      return
    }

    // Numbered list item: e.g. 1. , 12. 
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/)
    if (numMatch) {
      if (listType && listType !== 'ol') flushList(idx)
      listType = 'ol'
      listItems.push(numMatch[2])
      return
    }

    // Bullet list item: e.g. - , * , •
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)/)
    if (bulletMatch) {
      if (listType && listType !== 'ul') flushList(idx)
      listType = 'ul'
      listItems.push(bulletMatch[1])
      return
    }

    // Empty line
    if (!trimmed) {
      flushList(idx)
      return
    }

    // Standard paragraph
    flushList(idx)
    elements.push(
      <p key={idx} className="text-sm leading-relaxed text-slate-800 my-2">
        {renderInlineContent(line, handleCitation)}
      </p>
    )
  })

  // Flush remaining buffers
  flushList('final')
  flushTable('final')

  return (
    <div className={`space-y-1 ${className}`}>
      {elements}
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-navy-600 animate-pulse ml-1 align-middle" />
      )}
    </div>
  )
}

