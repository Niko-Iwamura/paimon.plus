import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const localRoot = resolve(scriptDir, '../..')
const root = process.env.PAIMON_ORIGINAL_DIR || (existsSync(join(localRoot, 'src/game/avatar.json')) ? localRoot : '/home/niko/Загрузки/paimon.plus-main')
const archive = process.env.PAIMON_ORIGINAL_ZIP || '/home/niko/Загрузки/paimon.plus-main.zip'
const out = join(scriptDir, '../src/generated')
mkdirSync(out, { recursive: true })
const assetOut = join(out, 'assets')
mkdirSync(assetOut, { recursive: true })

const readSource = relative => {
  const direct = join(root, relative)
  if (existsSync(direct)) return readFileSync(direct)
  if (existsSync(archive)) return execFileSync('unzip', ['-p', archive, `paimon.plus-main/${relative}`], { maxBuffer: 50 * 1024 * 1024 })
  throw new Error(`Original data not found: ${relative}`)
}
const writeSource = (name, relative, transform = value => value) => {
  writeFileSync(join(out, name), transform(readSource(relative)))
}
const copySource = (name, relative) => writeSource(name, relative, value => value)
const sourceFiles = prefix => {
  const directDir = join(root, prefix)
  if (existsSync(directDir)) return readdirSync(directDir).filter(name => !name.startsWith('.')).map(name => `${prefix}/${name}`)
  if (!existsSync(archive)) return []
  return execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).split('\n').filter(name => name.startsWith(`paimon.plus-main/${prefix}/`) && !name.endsWith('/')).map(name => name.slice('paimon.plus-main/'.length))
}
const copyAsset = (relative, target = relative.split('/').slice(-1).join('/')) => {
  const destination = join(assetOut, target); mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, readSource(relative))
}

for (const file of ['avatar.json', 'text-map.json', 'weapon.json', 'reliquary-set.json', 'reliquary-affix.json']) copySource(file, `src/game/${file}`)
writeSource('team-builder-types.ts', 'src/components/team-builder/types.ts')
writeSource('team-builder-data.ts', 'src/.manual-update/team-builder-data.ts', value => value.toString().replaceAll('@components/team-builder/types', './team-builder-types.js'))
writeSource('team-builder-worker.ts', 'src/components/team-builder/worker.ts', value => value.toString().replaceAll('@manual/team-builder-data', './team-builder-data.js').replaceAll("'./types'", "'./team-builder-types.js'"))
copySource('wish-banner.ts', 'src/.manual-update/wish-banner.ts')
copySource('ui.ts', 'src/i18n/ui.ts')
copySource('nav-data.ts', 'src/components/home/nav-data.ts')
copySource('player-card-data.txt', 'src/components/player-card/data.ts')
writeSource('showcase-default-marks.ts', 'src/.manual-update/showcase-default-marks.ts', value => value.toString().replace("import type { defineSub } from '@components/showcase-utils'\n\n", '').replace('(typeof defineSub)[number][]', 'string[]'))

// Small, useful original assets for terminal exports/previews. The full game
// image cache is intentionally not copied into the TUI build.
for (const file of ['public/fonts/genshin.woff2', 'public/fonts/genshin-ja.woff2']) copyAsset(file, `fonts/${file.split('/').at(-1)}`)
for (const file of sourceFiles('src/assets/webp/player-card-sample')) copyAsset(file, `player-card-sample/${file.split('/').at(-1)}`)
for (const file of sourceFiles('public/images/player-card/fukafukafuka29-sample')) copyAsset(file, `player-card-fukafukafuka29-sample/${file.split('/').at(-1)}`)

const manifest = { source: existsSync(join(root, 'src/game/avatar.json')) ? 'folder' : 'archive', syncedAt: new Date().toISOString(), assets: ['fonts/*', 'player-card-sample/*', 'player-card-fukafukafuka29-sample/*'] }
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`Original data synced from ${manifest.source}`)
