/** Best-effort extract human reply from `openclaw agent --json` stdout. */
export function replyFromAgentJson(parsed) {
  if (parsed == null) return null
  if (typeof parsed === 'string') return parsed
  if (typeof parsed.reply === 'string') return parsed.reply
  if (typeof parsed.response === 'string') return parsed.response
  if (typeof parsed.output === 'string') return parsed.output
  if (typeof parsed.text === 'string') return parsed.text
  if (typeof parsed.message === 'string') return parsed.message
  if (Array.isArray(parsed.payloads) && parsed.payloads.length > 0) {
    const parts = parsed.payloads
      .map((p) => (p && typeof p === 'object' && typeof p.text === 'string' ? p.text.trim() : ''))
      .filter(Boolean)
    if (parts.length > 0) return parts.join('\n\n')
  }
  if (parsed.meta && typeof parsed.meta === 'object') {
    const visible = parsed.meta.finalAssistantVisibleText ?? parsed.meta.finalAssistantRawText
    if (typeof visible === 'string' && visible.trim()) return visible.trim()
  }
  if (Array.isArray(parsed.messages)) {
    for (let i = parsed.messages.length - 1; i >= 0; i--) {
      const m = parsed.messages[i]
      if (m && typeof m === 'object') {
        const c = m.content ?? m.text ?? m.body
        if (typeof c === 'string') return c
      }
    }
  }
  if (typeof parsed.result === 'object' && parsed.result && typeof parsed.result.text === 'string') {
    return parsed.result.text
  }
  try {
    return JSON.stringify(parsed, null, 2)
  } catch {
    return String(parsed)
  }
}
