import { StringDecoder } from 'node:string_decoder'

export type Key =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'home'
  | 'end'
  | 'enter'
  | 'escape'
  | 'backspace'
  | 'space'
  | 'ctrl-c'
  | 'resize'
  | 'char'

export type KeyEvent = { key: Key; value?: string }

let decoder = new StringDecoder('utf8')
const queue: KeyEvent[] = []
const waiters: ((event: KeyEvent) => void)[] = []
let pendingEscape = ''
let installed = false
let terminalStarted = false
let resizeListener: (() => void) | undefined

const emit = (events: KeyEvent[]) => {
  queue.push(...events)
  while (queue.length && waiters.length) waiters.shift()?.(queue.shift()!)
}

const ansiKey = (sequence: string): { event: KeyEvent; length: number } | undefined => {
  const match = sequence.match(/^\x1b\[([0-9;]*)([A-Za-z~])|^\x1bO([HF])/)
  if (!match) return undefined
  const params = match[1] ?? ''
  const code = match[2] ?? match[3]
  const first = params.split(';')[0]

  if (code === 'A' || (code === '~' && first === '5')) return { event: { key: 'up' }, length: match[0].length }
  if (code === 'B' || (code === '~' && first === '6')) return { event: { key: 'down' }, length: match[0].length }
  if (code === 'C') return { event: { key: 'right' }, length: match[0].length }
  if (code === 'D') return { event: { key: 'left' }, length: match[0].length }
  if (code === 'H' || (code === '~' && (first === '1' || first === '7'))) return { event: { key: 'home' }, length: match[0].length }
  if (code === 'F' || (code === '~' && (first === '4' || first === '8'))) return { event: { key: 'end' }, length: match[0].length }
  return { event: { key: 'escape' }, length: match[0].length }
}

const parse = (chunk: Buffer) => {
  const text = pendingEscape + decoder.write(chunk)
  pendingEscape = ''
  const events: KeyEvent[] = []
  let i = 0

  while (i < text.length) {
    const character = text[i]
    if (character === '\x1b') {
      const rest = text.slice(i)
      const parsed = ansiKey(rest)
      if (parsed) {
        events.push(parsed.event)
        i += parsed.length
        continue
      }
      // Escape sequences can be split between input events. Keep the suffix
      // until the terminal sends the rest of the sequence.
      if (rest === '\x1b' || rest === '\x1b[' || /^\x1b\[[0-9;]*$/.test(rest) || rest === '\x1bO') {
        pendingEscape = rest
        break
      }
      events.push({ key: 'escape' })
      i += 1
      continue
    }
    if (character === '\u0003') events.push({ key: 'ctrl-c' })
    else if (character === '\r' || character === '\n') events.push({ key: 'enter' })
    else if (character === '\u007f' || character === '\b') events.push({ key: 'backspace' })
    else if (character === ' ') events.push({ key: 'space' })
    else if (character >= ' ') events.push({ key: 'char', value: character })
    i += 1
  }
  return events
}

// Exported for the non-interactive smoke test; the TUI itself uses readKey.
export const parseKeySequence = (value: string) => { decoder = new StringDecoder('utf8'); pendingEscape = ''; return parse(Buffer.from(value)) }

function install() {
  if (installed) return
  installed = true
  process.stdin.on('data', (chunk: Buffer | string) => emit(parse(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))))
  resizeListener = () => emit([{ key: 'resize' }])
  process.stdout.on('resize', resizeListener)
}

export const readKey = (): Promise<KeyEvent> => {
  install()
  if (queue.length) return Promise.resolve(queue.shift()!)
  return new Promise(resolve => waiters.push(resolve))
}

export function startTerminal() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('TUI требует интерактивный терминал (TTY).')
  if (terminalStarted) return
  terminalStarted = true
  install()
  process.stdin.setRawMode?.(true)
  process.stdin.resume()
  process.stdout.write('\x1b[?25l\x1b[?7l')
}

export function stopTerminal() {
  if (!terminalStarted) return
  terminalStarted = false
  if (resizeListener) process.stdout.off('resize', resizeListener)
  resizeListener = undefined
  try { process.stdin.setRawMode?.(false) } catch { /* stdin may already be closed */ }
  process.stdin.pause()
  pendingEscape = ''
  queue.length = 0
  process.stdout.write('\x1b[?25h\x1b[?7h\x1b[0m\n')
}
