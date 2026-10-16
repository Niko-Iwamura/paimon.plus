import { readFileSync } from 'node:fs'

export type CardField = { type: 'text' | 'textarea' | 'number' | 'frame' | 'checkbox'; label: string; items: string[] }
export type CardTemplate = { id: string; fields: CardField[]; link: string; editable: boolean; canvas?: { width: number; height: number }; customItems: string[] }

const source = () => readFileSync(new URL('./generated/player-card-data.txt', import.meta.url), 'utf8')

// Split the original metadata array without executing it (the source imports
// browser-only image metadata and cannot be loaded directly in Node).
const topLevelObjects = (text: string) => {
  const arrayStart = text.indexOf('= [', text.indexOf('}[]'))
  if (arrayStart < 0) return []
  const result: string[] = []; let start = -1; let depth = 0; let quote = ''; let escaped = false
  for (let i = arrayStart + 3; i < text.length; i++) {
    const char = text[i]
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue }
    if (char === '{') { if (depth === 0) start = i; depth++; continue }
    if (char === '}') { depth--; if (depth === 0 && start >= 0) { result.push(text.slice(start, i + 1)); start = -1 } continue }
    if (char === ']' && depth === 0) break
  }
  return result
}

const unquote = (value: string | undefined) => value?.replaceAll('\\\'', "'") ?? ''

export const templates = (): CardTemplate[] => {
  const text = source(); if (!text) return []
  return topLevelObjects(text).map((block, index) => {
    const toolId = unquote(block.match(/\btoolId:\s*'([^']+)'/)?.[1])
    const sample = unquote(block.match(/\bsample:\s*([A-Za-z0-9_]+)/)?.[1])
    const id = toolId || sample || `template-${index + 1}`
    const fields: CardField[] = []; const seen = new Set<string>(); const fieldPattern = /\btype:\s*'(text|textarea|number|frame|checkbox)'\s*,[\s\S]*?\blabel:\s*'([^']+)'/g
    for (const match of block.matchAll(fieldPattern)) {
      const type = match[1] as CardField['type']; const label = match[2]; const key = `${type}:${label}`
      if (seen.has(key)) continue
      seen.add(key)
      const items = type === 'frame' || type === 'checkbox' ? (() => {
        const itemsStart = block.indexOf('items:', match.index ?? 0); const bracketStart = block.indexOf('[', itemsStart); if (itemsStart < 0 || bracketStart < 0) return []
        let depth = 0; let quote = ''; let escaped = false; let end = bracketStart
        for (; end < block.length; end++) { const char = block[end]; if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; continue } if (char === "'") { quote = char; continue } if (char === '[') depth++; if (char === ']') { depth--; if (depth === 0) break } }
        return [...block.slice(bracketStart, end + 1).matchAll(/\blabel:\s*'([^']+)'/g)].map(item => item[1]).filter((item, i, all) => all.indexOf(item) === i)
      })() : []
      fields.push({ type, label, items })
    }
    const canvasMatch = block.match(/\bcanvas:\s*\{\s*w:\s*(\d+)\s*,\s*h:\s*(\d+)\s*\}/)
    const customStart = block.indexOf('custom:')
    const customText = customStart >= 0 ? block.slice(customStart) : ''
    const customItems = [...customText.matchAll(/'([^']+)'/g)].map(item => item[1]).filter(item => item !== 'avatar').filter((item, i, all) => all.indexOf(item) === i)
    return { id, fields, link: unquote(block.match(/\blink:\s*'([^']+)'/)?.[1]), editable: fields.length > 0, canvas: canvasMatch ? { width: Number(canvasMatch[1]), height: Number(canvasMatch[2]) } : undefined, customItems }
  })
}
