import { writeFile } from 'node:fs/promises'

export async function exportTextCard(title: string, lines: string[], path = './paimon-card.txt') {
  await writeFile(path, [title, '='.repeat(title.length), ...lines].join('\n') + '\n', 'utf8')
  return path
}
