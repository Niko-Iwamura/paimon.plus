import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'
export async function exportCard(title: string, lines: string[], path = './paimon-card.png') {
  const escaped = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const text = lines.map((line, index) => `<text x="32" y="${72 + index * 30}" fill="#fff" font-size="22">${escaped(line)}</text>`).join('')
  const svg = `<svg width="1000" height="${Math.max(160, 110 + lines.length * 30)}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#22252a"/><text x="32" y="38" fill="#58e0d0" font-size="26">${escaped(title)}</text>${text}</svg>`
  const svgPath = path.replace(/\.[^.]+$/, '.svg'); await writeFile(svgPath, svg); await writeFile(path, await sharp(Buffer.from(svg)).png().toBuffer()); return { png: path, svg: svgPath }
}
