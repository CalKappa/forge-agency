/**
 * streamAnthropicCall — unified fetch-based streaming helper for all Anthropic API calls.
 *
 * Uses the raw SSE endpoint so the browser's ReadableStream keeps the connection
 * alive even if the React component that initiated the call unmounts (navigation).
 * The PipelineContext provider at app root is never unmounted, so onChunk callbacks
 * that update pipeline state will still fire correctly after navigation.
 *
 * @param {object}   params
 * @param {Array}    params.messages      - Anthropic messages array
 * @param {string}   params.systemPrompt  - System prompt string
 * @param {string}  [params.model]        - Model ID (default: claude-opus-4-6)
 * @param {number}  [params.maxTokens]    - max_tokens (default: 30000)
 * @param {Function}[params.onChunk]      - Called with each text chunk as it arrives
 * @param {Function}[params.onComplete]   - Called with full accumulated text on completion
 *
 * @returns {Promise<{text, inputTokens, outputTokens, stopReason}>}
 */
export async function streamAnthropicCall({
  messages,
  systemPrompt,
  model = 'claude-opus-4-6',
  maxTokens = 30000,
  tools,
  toolChoice,
  extraHeaders,
  onChunk,
  onToolUse,
  onComplete,
}) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true,
      ...(tools ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''
  let buffer = ''
  let inputTokens = 0
  let outputTokens = 0
  let stopReason = 'end_turn'

  // Tool-use block tracking — accumulate input JSON across delta events
  let currentToolName  = null
  let currentToolInput = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep incomplete last line in buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue
        try {
          const event = JSON.parse(data)
          if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'tool_use') {
              currentToolName  = event.content_block.name
              currentToolInput = ''
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolName !== null) {
              let parsedInput = {}
              try { parsedInput = JSON.parse(currentToolInput || '{}') } catch { /* partial JSON */ }
              onToolUse?.(currentToolName, parsedInput)
              currentToolName  = null
              currentToolInput = ''
            }
          } else if (event.type === 'message_start') {
            inputTokens = event.message?.usage?.input_tokens ?? 0
          } else if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta') {
              const chunk = event.delta.text
              accumulated += chunk
              onChunk?.(chunk)
            } else if (event.delta?.type === 'input_json_delta') {
              currentToolInput += event.delta.partial_json ?? ''
            }
          } else if (event.type === 'message_delta') {
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason
            if (event.usage?.output_tokens) outputTokens = event.usage.output_tokens
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  onComplete?.(accumulated)
  return { text: accumulated, inputTokens, outputTokens, stopReason }
}
