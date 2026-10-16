import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../src/generated/', import.meta.url))
const target = fileURLToPath(new URL('../dist/generated/', import.meta.url))
mkdirSync(target, { recursive: true })
const copyTree = (from, to) => {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from)) {
    const sourcePath = join(from, entry); const targetPath = join(to, entry)
    if (statSync(sourcePath).isDirectory()) copyTree(sourcePath, targetPath)
    else copyFileSync(sourcePath, targetPath)
  }
}
copyTree(source, target)
console.log('Generated data and original preview assets copied to dist/generated')
