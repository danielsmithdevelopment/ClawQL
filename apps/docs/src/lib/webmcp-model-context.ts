/**
 * Feature-detect WebMCP model context (Chrome: prefer document, navigator deprecated).
 * @see https://developer.chrome.com/docs/ai/webmcp/imperative-api
 */
export function getModelContext(): ModelContext | undefined {
  if (typeof window === 'undefined') return undefined
  return document.modelContext ?? navigator.modelContext
}
