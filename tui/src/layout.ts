export const ansi = { cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', reset: '\x1b[0m' }
export const clear = () => process.stdout.write('\x1b[2J\x1b[H')
export const width = () => Math.max(1, Math.min(120, process.stdout.columns || 80))
export const height = () => Math.max(1, process.stdout.rows || 24)
export const fit = (value: string, size: number) => {
  if (size <= 0) return ''
  const plain = value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
  if ([...plain].length > size) return size === 1 ? '…' : [...plain].slice(0, size - 1).join('') + '…'
  return value + ' '.repeat(Math.max(0, size - [...plain].length))
}
export const wrap = (value: string, size = Math.max(1, width() - 4)) => {
  if (size <= 0) return ['']
  const plain = value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
  const characters = [...plain]; if (!characters.length) return ['']
  const rows: string[] = []
  for (let i = 0; i < characters.length; i += size) rows.push(characters.slice(i, i + size).join(''))
  return rows
}
export const box = (title: string, lines: string[], size = width()) => {
  const safeSize = Math.max(1, size); if (safeSize < 3) { console.log(fit(title, safeSize)); for (const line of lines) console.log(fit(line, safeSize)); return }
  const inner = safeSize - 2; const prefix = fit(`─ ${title} `, inner)
  console.log(`╭${fit(`${prefix}${'─'.repeat(Math.max(0, inner - [...prefix].length))}`, inner)}${safeSize > 1 ? '╮' : ''}`)
  for (const line of lines) console.log(`│${fit(` ${line}`, inner)}│`)
  console.log(`╰${'─'.repeat(inner)}${safeSize > 1 ? '╯' : ''}`)
}
export const gridMetrics = (itemWidth: number, headerLines = 5, footerLines = 2) => {
  const rows = Math.max(1, height() - headerLines - footerLines)
  const columns = Math.max(1, Math.floor((width() - 2) / itemWidth))
  return { rows, columns, pageSize: rows * columns }
}
export const adaptiveItemWidth = (preferred: number) => {
  const available = Math.max(1, width() - 2); const columns = Math.max(1, Math.floor(available / preferred))
  return Math.max(1, Math.floor(available / columns))
}
export function pageGrid<T>(items: T[], page: number, itemWidth: number, render: (item: T, index: number) => string, metrics = gridMetrics(itemWidth)) {
  const { rows, columns, pageSize } = metrics; const start = page * pageSize; const visible = items.slice(start, start + pageSize)
  const lines: string[] = []
  for (let row = 0; row < rows; row++) {
    const cells = []
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column; cells.push(index < visible.length ? fit(render(visible[index], start + index), itemWidth) : ' '.repeat(itemWidth))
    }
    lines.push(cells.join(''))
  }
  return { lines, start, pageSize, rows, columns, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) }
}
