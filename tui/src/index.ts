import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fetchStatistics } from './analytics.js'
import { avatars, buildTeams, defaultOwnedIds, displayName } from './team-builder.js'
import { randomAbyss, randomCharacter, randomTeam } from './randomizer.js'
import { averageDamage, clip01, critAverage, critDifference, critIdeal, critMax, maxCritDamage } from './calculators.js'
import { artifactSetName, avatarName, fetchUid, formatAvatarForTerminal, UID_RE, uidUrl, weaponName } from './uid-api.js'
import { scoreCharacterArtifacts, type ScoreType } from './artifacter.js'
import { exportTextCard } from './export-text.js'
import { wish } from './generated/wish-banner.js'
import { templates } from './player-card.js'
import { ui } from './generated/ui.js'
import { navLink, officialLink } from './generated/nav-data.js'
import { adaptiveItemWidth, box, clear, ansi, fit, gridMetrics, height, pageGrid, width, wrap } from './layout.js'
import { readKey, startTerminal, stopTerminal, type KeyEvent } from './keyboard.js'
import { ShowcaseStore } from './showcase.js'

type Screen = 'home' | 'crit' | 'damage' | 'team' | 'random' | 'uid' | 'analytics' | 'artifacter' | 'wish' | 'cards' | 'translator' | 'official' | 'unavailable'
const menu: { id: Screen; label: string; status?: string }[] = [
  { id: 'home', label: 'Dashboard' }, { id: 'crit', label: 'CRIT Ratio' }, { id: 'damage', label: 'Average Damage' },
  { id: 'team', label: 'Team Builder' }, { id: 'random', label: 'Randomizer' }, { id: 'uid', label: 'UID Showcase' },
  { id: 'analytics', label: 'Showcase Analytics' }, { id: 'artifacter', label: 'Artifacter' }, { id: 'wish', label: 'Wish Banner' },
  { id: 'cards', label: 'Player Card' }, { id: 'translator', label: 'Translator Tools' }, { id: 'official', label: 'Official Links' },
  { id: 'unavailable', label: 'Unavailable pages', status: 'Talent Materials / Developer Tools' },
]
let owned = new Set(defaultOwnedIds); const profiles = new Map<string, Set<string>>([['default', new Set(defaultOwnedIds)]]); const profileFavorites = new Map<string, Set<string>>([['default', new Set<string>()]]); let favorites = new Set<string>(); const showcase = new ShowcaseStore(); const notes: string[] = []; let redraw: () => void = () => undefined; let active = true; let quitRequested = false
const profilePath = './.paimon-tui-profiles.json'
try { const saved = JSON.parse(readFileSync(profilePath, 'utf8')) as { name: string; owned: string[]; favorites?: string[] }[]; for (const profile of saved) { if (profile?.name && Array.isArray(profile.owned)) { profiles.set(profile.name, new Set(profile.owned)); profileFavorites.set(profile.name, new Set(profile.favorites ?? [])) } } } catch { /* first run or read-only directory */ }
const saveProfiles = () => { try { writeFileSync(profilePath, JSON.stringify([...profiles].map(([name, ids]) => ({ name, owned: [...ids], favorites: [...(profileFavorites.get(name) ?? [])] })), null, 2)) } catch { /* profile saving is optional in a read-only checkout */ } }
const isQuitKey = (key: KeyEvent) => key.key === 'ctrl-c' || (key.key === 'char' && ['q', 'й'].includes(key.value?.toLowerCase() ?? ''))
const readAction = async () => { const key = await readKey(); if (isQuitKey(key)) quitRequested = true; return key }

function header(selected: number, status = '') {
  const w = width(); const inner = Math.max(0, w - 2); const visible = Math.max(1, height() - 8); const start = Math.min(Math.floor(selected / visible) * visible, Math.max(0, menu.length - visible)); const shown = menu.slice(start, start + visible)
  clear(); if (w >= 3) { console.log(`${ansi.cyan}╭${'─'.repeat(inner)}╮`); console.log(`│${fit(' PAIMON+   TUI • terminal adaptations', inner)}│`); console.log(`╰${'─'.repeat(inner)}╯${ansi.reset}`) } else console.log(fit('P', w))
  shown.forEach((item, index) => { const actual = start + index; console.log(`${actual === selected ? `${ansi.cyan}▸${ansi.reset}` : ' '} ${actual === selected ? ansi.cyan : ansi.dim}${fit(item.label + (item.status ? ` (${item.status})` : ''), Math.max(1, w - 3))}${ansi.reset}`) })
  const nav = `↑/↓/j/k Enter Esc q  ${start + 1}-${Math.min(menu.length, start + shown.length)}/${menu.length}`; console.log(`\n${ansi.dim}${fit(nav, Math.max(1, w))}${ansi.reset}${status ? `\n\n${fit(status, Math.max(1, w))}` : ''}`)
}

async function waitBack(title: string, lines: string[]) {
  let page = 0
  while (true) {
    const wrapped = lines.flatMap(line => wrap(line)); const perPage = Math.max(1, height() - 7); const pages = Math.max(1, Math.ceil(wrapped.length / perPage)); page = Math.min(page, pages - 1)
    clear(); box(title, [`${ansi.dim}Page ${page + 1}/${pages} • ←/→ or j/k page • Enter/Esc back${ansi.reset}`, ...wrapped.slice(page * perPage, (page + 1) * perPage)]); const key = await readAction()
    if (quitRequested || key.key === 'enter' || key.key === 'escape') return
    if (key.key === 'home') page = 0
    else if (key.key === 'end') page = pages - 1
    else if (key.key === 'left' || key.key === 'up' || (key.key === 'char' && key.value?.toLowerCase() === 'k')) page = Math.max(0, page - 1)
    else if (key.key === 'right' || key.key === 'down' || (key.key === 'char' && key.value?.toLowerCase() === 'j')) page = Math.min(pages - 1, page + 1)
  }
}
async function textInput(title: string, validator: (value: string) => string | undefined = () => undefined, initial = ''): Promise<string | undefined> {
  let value = initial; let error = ''
  const titleParts = title.split('\n').map(part => part.trim()).filter(Boolean); const heading = titleParts.shift() || 'Input'
  while (true) { clear(); const promptLines = titleParts.slice(0, Math.max(0, height() - 9)); box(heading, [...promptLines, `${ansi.dim}Enter confirm • Esc cancel • Backspace delete${ansi.reset}`, '', value || `${ansi.dim}type here${ansi.reset}`, error ? `${ansi.red}${error}${ansi.reset}` : '']); const key = await readAction(); if (quitRequested || key.key === 'escape') return; if (key.key === 'enter') { const issue = validator(value); if (!issue) return value; error = issue } else if (key.key === 'backspace') { value = [...value].slice(0, -1).join(''); error = '' } else if (key.key === 'char') { value += key.value ?? ''; error = '' } }
}
async function numberInput(title: string, min = 0, max?: number) { return textInput(title, value => { if (!value.trim()) return 'Значение обязательно.'; const n = Number(value); if (!Number.isFinite(n)) return 'Введите число.'; if (n < min) return `Минимум: ${min}.`; if (max !== undefined && n > max) return `Максимум: ${max}.`; return undefined }) }
async function pickIndex(title: string, labels: string[]): Promise<number | undefined> {
  if (!labels.length) return undefined
  let cursor = 0
  while (true) {
    const itemWidth = adaptiveItemWidth(36); const metrics = gridMetrics(itemWidth, 6, 3); const page = Math.floor(cursor / metrics.pageSize); const grid = pageGrid(labels, page, itemWidth, (label, index) => `${index === cursor ? ansi.yellow + '▸ ' : '  '}${label}`, metrics)
    clear(); box(title, [`${ansi.dim}↑/↓ row  ←/→ column  Home/End  Enter select  Esc back${ansi.reset}`, `Page ${page + 1}/${grid.totalPages}`]); grid.lines.forEach(line => console.log(line))
    const key = await readAction(); const offset = cursor % grid.pageSize; const row = Math.floor(offset / grid.columns); const column = offset % grid.columns; const pageEnd = Math.min(labels.length - 1, page * grid.pageSize + grid.pageSize - 1)
    if (quitRequested || key.key === 'escape') return undefined
    if (key.key === 'up' || (key.key === 'char' && key.value?.toLowerCase() === 'k')) cursor = row > 0 ? cursor - grid.columns : cursor >= grid.columns ? cursor - grid.columns : cursor
    else if (key.key === 'down' || (key.key === 'char' && key.value?.toLowerCase() === 'j')) cursor = cursor + grid.columns < labels.length ? Math.min(labels.length - 1, cursor + grid.columns) : cursor
    else if (key.key === 'left') cursor = column > 0 ? cursor - 1 : cursor
    else if (key.key === 'right') cursor = column + 1 < grid.columns && cursor < pageEnd ? Math.min(pageEnd, cursor + 1) : cursor
    else if (key.key === 'home') cursor = 0
    else if (key.key === 'end') cursor = labels.length - 1
    else if (key.key === 'enter') return cursor
  }
}
async function result(title: string, lines: string[]) { await waitBack(title, lines) }

async function teamPicker() {
  const list = avatars; let cursor = 0; let profileName = 'default'; const selected = new Set(owned); const favorite = new Set(favorites)
  while (true) {
    const itemWidth = adaptiveItemWidth(28); const metrics = gridMetrics(itemWidth, 6, 3); const page = Math.floor(cursor / metrics.pageSize); const grid = pageGrid(list, page, itemWidth, (item, index) => `${selected.has(item.id) ? '[x]' : '[ ]'}${favorite.has(item.id) ? '[★]' : '[ ]'} ${index === cursor ? ansi.yellow + '▸ ' : '  '}${displayName(item)}`, metrics)
    clear(); box('TEAM BUILDER — OWNED CHARACTERS', [`${ansi.dim}↑/↓ row  ←/→ column  j/k row  Space owned  f favorite  Enter auto-build  s save  l load  Esc back${ansi.reset}`, `Profile: ${profileName}   Owned: ${selected.size}/${list.length}   Favorites: ${favorite.size}   Page: ${page + 1}/${grid.totalPages}`, `Profiles: ${[...profiles.keys()].join(', ')}`]); grid.lines.forEach(line => console.log(line))
    const key = await readAction(); const { columns, pageSize } = metrics; const offset = cursor % pageSize; const row = Math.floor(offset / columns); const column = offset % columns; const pageEnd = Math.min(list.length - 1, page * pageSize + pageSize - 1)
    if (quitRequested || key.key === 'escape') return
    if (key.key === 'up' || (key.key === 'char' && key.value?.toLowerCase() === 'k')) cursor = row > 0 ? cursor - columns : cursor >= columns ? cursor - columns : cursor
    else if (key.key === 'down' || (key.key === 'char' && key.value?.toLowerCase() === 'j')) cursor = cursor + columns < list.length ? Math.min(list.length - 1, cursor + columns) : cursor
    else if (key.key === 'left') cursor = column > 0 ? cursor - 1 : cursor
    else if (key.key === 'right') cursor = column + 1 < columns && cursor < pageEnd ? Math.min(pageEnd, cursor + 1) : cursor
    else if (key.key === 'home') cursor = 0
    else if (key.key === 'end') cursor = list.length - 1
    else if (key.key === 'space') { if (selected.has(list[cursor].id)) selected.delete(list[cursor].id); else selected.add(list[cursor].id) }
    else if (key.key === 'char' && key.value?.toLowerCase() === 'f') { if (favorite.has(list[cursor].id)) favorite.delete(list[cursor].id); else favorite.add(list[cursor].id) }
    else if (key.key === 'char' && key.value?.toLowerCase() === 's') { const name = await textInput('SAVE OWNED LIST\n\nName:'); if (quitRequested) return; if (name?.trim()) { profileName = name.trim(); profiles.set(profileName, new Set(selected)); profileFavorites.set(profileName, new Set(favorite)); saveProfiles() } }
    else if (key.key === 'char' && key.value?.toLowerCase() === 'l') { const name = await textInput(`LOAD OWNED LIST\n\nAvailable: ${[...profiles.keys()].join(', ')}\n\nName:`); if (quitRequested) return; if (name && profiles.has(name)) { profileName = name; selected.clear(); profiles.get(name)?.forEach(id => selected.add(id)); favorite.clear(); profileFavorites.get(name)?.forEach(id => favorite.add(id)) } }
    else if (key.key === 'enter') { owned = new Set(selected); favorites = new Set(favorite); profiles.set(profileName, new Set(selected)); profileFavorites.set(profileName, new Set(favorite)); saveProfiles(); clear(); box('TEAM BUILDER — CALCULATING', ['Оригинальный scoring worker строит Battle/Exploration teams…', `Owned: ${owned.size}  Favorites: ${favorites.size}`]); await new Promise<void>(resolve => setImmediate(resolve)); const teams = buildTeams(owned, [...favorites]); if (!teams) return result('TEAM BUILDER', ['Недостаточно выбранных персонажей для расчёта.']); return showTeams(teams) }
  }
}
async function showTeams(teams: ReturnType<typeof buildTeams>) {
  if (!teams) return
  const lines = (title: string, groups: typeof teams.battle) => [title, ...groups.slice(0, 5).flatMap((group, i) => { const score = group.all[0]; return [`${i + 1}. ${(score?.data ?? group.base).map(displayName).join(' | ')}`, `   Battle: ${(score?.battle ?? 0).toFixed(2)}  Exploration: ${(score?.explor ?? 0).toFixed(2)}`] })]
  await result('AUTO-BUILT TEAMS', [...lines('BATTLE TEAMS', teams.battle), '', ...lines('EXPLORATION TEAMS', teams.explor)])
}
async function randomScreen() {
  const pool = avatars.filter(item => owned.has(item.id)); let mode: 'domain' | 'abyss' | 'character' = 'domain'
  while (true) {
    const lines: string[] = [`Mode: ${mode}   ${ansi.dim}1 domain  2 abyss  3 character  r regenerate  Esc back${ansi.reset}`]
    const domain = randomTeam(pool); const abyss = randomAbyss(pool); const character = randomCharacter(pool)
    if (mode === 'domain') lines.push(domain ? domain.map(displayName).join(' | ') : 'Недостаточно подходящих персонажей.')
    if (mode === 'abyss') lines.push(...(abyss ? abyss.map((team, i) => `Team ${i + 1}: ${team.map(displayName).join(' | ')}`) : ['Недостаточно подходящих персонажей.']))
    if (mode === 'character') lines.push(character ? displayName(character) : 'Пул пуст.')
    clear(); box('RANDOMIZER', lines); const key = await readAction()
    if (quitRequested || key.key === 'escape') return
    if (key.key === 'resize' || (key.key === 'char' && key.value?.toLowerCase() === 'r')) continue
    if (key.key === 'left' || key.key === 'up' || (key.key === 'char' && key.value?.toLowerCase() === 'k')) mode = mode === 'domain' ? 'character' : mode === 'abyss' ? 'domain' : 'abyss'
    if (key.key === 'right' || key.key === 'down' || (key.key === 'char' && key.value?.toLowerCase() === 'j')) mode = mode === 'domain' ? 'abyss' : mode === 'abyss' ? 'character' : 'domain'
    if (key.key === 'char' && key.value === '1') mode = 'domain'
    if (key.key === 'char' && key.value === '2') mode = 'abyss'
    if (key.key === 'char' && key.value === '3') mode = 'character'
  }
}
async function critScreen() {
  const type = await textInput('CRIT RATIO\n\nStat (ATK/HP/DEF):', value => ['ATK', 'HP', 'DEF'].includes(value.toUpperCase()) ? undefined : 'Выберите ATK, HP или DEF.')
  if (!type || quitRequested) return
  const base = await numberInput('CRIT RATIO\n\nWhite stat:', 0); if (base === undefined || quitRequested) return
  const add = await numberInput('CRIT RATIO\n\nGreen stat:', 0); if (add === undefined || quitRequested) return
  const cr = await numberInput('CRIT RATIO\n\nCRIT Rate %:', 0, 100); if (cr === undefined || quitRequested) return
  const cd = await numberInput('CRIT RATIO\n\nCRIT DMG %:', 0); if (cd === undefined || quitRequested) return
  const baseNumber = Number(base); const addNumber = Number(add); const rate = Number(cr) / 100; const critDmg = Number(cd) / 100; const average = critAverage(baseNumber, addNumber, rate, critDmg); const ideal = critIdeal(type.toUpperCase() as 'ATK' | 'HP' | 'DEF', baseNumber, addNumber, rate, critDmg); const idealAverage = critAverage(baseNumber, ideal.addRatio * baseNumber, ideal.cr, ideal.cd); const note = { type: type.toUpperCase(), base: baseNumber, add: addNumber, cr: Number(cr), cd: Number(cd), avg: average, cDmg: critMax(baseNumber, addNumber, critDmg) }
  notes.unshift(JSON.stringify(note))
  await result('CRIT RESULT', [`${note.type}: ${note.base} + ${note.add}`, `Average: ${average}`, `Ideal: ${(ideal.addRatio * 100).toFixed(1)}% green / ${(ideal.cr * 100).toFixed(1)}% CRIT Rate / ${(ideal.cd * 100).toFixed(1)}% CRIT DMG`, `Ideal average: ${idealAverage}`, `Difference: ${(critDifference(average, idealAverage) * 100).toFixed(2)}%`, `Max CRIT: ${note.cDmg}`, `Saved notes: ${notes.length}`, '', 'Recent notes:', ...notes.slice(0, 5).map((item, index) => `#${index + 1} ${item}`)])
}
async function damageScreen() {
  const cr = await numberInput('AVERAGE DAMAGE\n\nCRIT Rate %:', 0, 100); if (cr === undefined || quitRequested) return
  const cd = await numberInput('AVERAGE DAMAGE\n\nCRIT DMG %:', 0); if (cd === undefined || quitRequested) return
  const damage = await numberInput('AVERAGE DAMAGE\n\nDamage:', 0); if (damage === undefined || quitRequested) return
  const isCrit = await textInput('AVERAGE DAMAGE\n\nMode: crit/noncrit', value => ['crit', 'noncrit'].includes(value.toLowerCase()) ? undefined : 'Введите crit или noncrit.'); if (!isCrit || quitRequested) return
  const crit = isCrit.toLowerCase() === 'crit'; const rate = Number(cr) / 100; const critDmg = Number(cd) / 100; const rawDamage = Number(damage); const average = averageDamage(rate, critDmg, crit, rawDamage); notes.unshift(JSON.stringify({ cr: Number(cr), cd: Number(cd), damage: rawDamage, crit, avg: average }))
  await result('DAMAGE RESULT', [`Mode: ${crit ? 'CRIT' : 'non-CRIT'}`, `Average: ${average}`, `Max CRIT: ${maxCritDamage(critDmg, crit, rawDamage)}`, `Saved notes: ${notes.length}`, '', 'Recent notes:', ...notes.slice(0, 5).map((item, index) => `#${index + 1} ${item}`)])
}

async function uidScreen() {
  const history = showcase.history.length ? `\nHistory: ${showcase.history.map((item, i) => `${i + 1}:${item}`).join('  ')}` : ''
  const input = await textInput(`UID SHOWCASE${history}\n\nUID or history number:` , value => {
    if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= showcase.history.length) return undefined
    return UID_RE.test(value) ? undefined : 'UID должен состоять из 9 цифр.'
  })
  if (!input || quitRequested) return
  const uid = /^\d+$/.test(input) && Number(input) >= 1 && Number(input) <= showcase.history.length ? showcase.history[Number(input) - 1] : input
  const response = await showcase.load(uid); const data = response.json; const error = response.error; const status = response.status
  if (!data) return result('UID ERROR', [`HTTP status: ${status || 'network'}`, error ?? 'Нет данных.'])
  const list = data.avatarInfoList ?? []; const choice = await pickIndex('UID SHOWCASE — CHARACTER', ['0. Summary', ...list.map((item: any, i: number) => `${i + 1}. ${avatarName(item.avatarId)}`)]); if (choice === undefined || quitRequested) return
  const selected = choice === 0 ? undefined : list[choice - 1]; const lines = [`UID: ${data.uid ?? uid}`, `Nickname: ${data.playerInfo?.nickname ?? '—'}`, `Signature: ${data.playerInfo?.signature ?? '—'}`, `AR: ${data.playerInfo?.level ?? '—'}`, `World level: ${data.playerInfo?.worldLevel ?? '—'}`, `Achievements: ${data.playerInfo?.finishAchievementNum ?? '—'}`, `Spiral Abyss: ${data.playerInfo?.towerFloorIndex ?? '—'}-${data.playerInfo?.towerLevelIndex ?? '—'}`, `Showcase characters: ${list.length}`]
  if (selected) { const details = formatAvatarForTerminal(selected); lines.push('', ...details.lines) }
  lines.push('', `Endpoint: ${uidUrl(uid)}`); await result('UID SHOWCASE', lines)
}
const bar = (value: number, max: number, size = 18) => { const filled = max > 0 ? Math.round((value / max) * size) : 0; return `${'█'.repeat(Math.max(0, Math.min(size, filled)))}${'░'.repeat(Math.max(0, size - filled))}` }
const buckets = (label: string, values: unknown[]) => { const numbers = values.map(value => Number(value ?? 0)); const max = Math.max(0, ...numbers); return [label, ...numbers.map((value, index) => `  ${String(index).padStart(2, ' ')} ${bar(value, max)} ${value}`)] }
async function analyticsScreen() {
  try {
    const response = await fetchStatistics(); if (!response.json) throw new Error(response.error ?? `HTTP ${response.status || 'network'}`)
    const data = response.json as any; const player = data.playerInfo ?? {}; const list = (data.avatarInfoList ?? []) as any[]; if (!list.length) return result('ANALYTICS', ['API вернул пустой список персонажей.'])
    const rankingMode = await pickIndex('SHOWCASE ANALYTICS — RANKING', ['Users', 'C0 rate (5-star)', 'C6 rate (5-star)']); if (rankingMode === undefined || quitRequested) return
    const fiveStarIds = new Set(avatars.filter(item => item.qualityType === 'QUALITY_ORANGE' && !['10000005', '10000007'].includes(item.id)).map(item => Number(item.id)))
    const score = (item: any) => rankingMode === 0 ? Number(item.count ?? 0) : Number(item.consts?.[rankingMode === 1 ? 0 : 6] ?? 0) / Math.max(1, Number(item.count ?? 0))
    const ranked = [...list].filter(item => rankingMode === 0 || fiveStarIds.has(Number(item.avatarId))).sort((a, b) => score(b) - score(a))
    const percent = (value: number) => `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`
    const choice = await pickIndex('SHOWCASE ANALYTICS — CHARACTER', ranked.map((item, i) => `${i + 1}. ${avatarName(item.avatarId)} (${rankingMode === 0 ? `${item.count ?? 0} users` : percent(score(item))})`)); if (choice === undefined || quitRequested) return
    const avatar = ranked[choice]; const statNames: Record<number, string> = { 2000: 'HP', 2001: 'ATK', 2002: 'DEF', 28: 'Elemental Mastery', 20: 'CRIT Rate', 22: 'CRIT DMG', 23: 'Energy Recharge', 30: 'Physical DMG Bonus', 40: 'Pyro DMG Bonus', 41: 'Electro DMG Bonus', 42: 'Hydro DMG Bonus', 43: 'Dendro DMG Bonus', 44: 'Anemo DMG Bonus', 45: 'Geo DMG Bonus', 46: 'Cryo DMG Bonus' }
    const percentStats = new Set([20, 22, 23, 30, 40, 41, 42, 43, 44, 45, 46])
    const stats = (avatar.stats ?? []).map((item: any) => { const id = Number(item.fightProp); const value = Number(item.value?.median ?? 0); const name = statNames[id] ?? 'Elemental DMG Bonus'; return `${name} median=${percentStats.has(id) || !item.fightProp ? `${(value * 100).toFixed(1)}%` : value.toFixed(0)}` })
    const skills = (avatar.skills ?? []).map((item: any) => `Talent ${item.id}: median ${item.median ?? '—'} / mean ${item.mean ?? '—'} / mode ${item.mode ?? '—'}`); const constellations = (avatar.consts ?? []).map((count: number, index: number) => `  C${index}: ${percent(Number(count) / Math.max(1, Number(avatar.count ?? 0)))}`); const travelerElements = (avatar.travelerElement ?? []).map((item: any) => `  Skill depot ${item.id}: ${percent(Number(item.count) / Math.max(1, Number(avatar.count ?? 0)))}`); const weapons = [...(avatar.weapon ?? [])].sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0)).map((item: any) => `  ${weaponName(item.id)}: ${item.count} (${bar(item.count ?? 0, avatar.count ?? 0)} ${(Number(item.count ?? 0) / Math.max(1, avatar.count ?? 0) * 100).toFixed(1)}%)`); const sets = [...(avatar.reliquarySet ?? [])].sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0)).map((item: any) => `  ${item.set?.map((set: any) => `${artifactSetName(set.id)}×${set.piece}`).join(' + ') || 'none'}: ${item.count} (${(Number(item.count ?? 0) / Math.max(1, avatar.count ?? 0) * 100).toFixed(1)}%)`)
    const rank = choice + 1; const rankingLines = ranked.map((item, index) => `  #${index + 1} ${avatarName(item.avatarId)}: ${rankingMode === 0 ? item.count : percent(score(item))}`)
    const achievementInput = await numberInput('SHOWCASE ANALYTICS\n\nYour achievement count:', 0)
    if (achievementInput === undefined || quitRequested) return
    const achievementCount = Number(achievementInput); const bucket = Math.floor(achievementCount); const accumulated = (player.finishAchievementNum ?? []).slice(0, bucket).reduce((sum: number, count: number) => sum + Number(count ?? 0), 0) + Number(player.finishAchievementNum?.[bucket] ?? 0) / 2
    const achievementTop = player.count ? Math.max(0, (Number(player.count) - accumulated) / Number(player.count) * 100) : 0
    const lines = [`Players: ${player.count ?? '—'}`, `Top achievements: ${player.finishAchievementNumTop ?? '—'}`, `Your achievement percentile: ${achievementCount >= Number(player.finishAchievementNumTop ?? Infinity) ? 'at/above top recorded value' : `${achievementTop.toFixed(achievementTop < 1 ? 1 : 0)}%`}`, `Character: ${avatarName(avatar.avatarId)} (${avatar.count ?? 0} users)`, `Ranking view: ${['Users', 'C0 rate', 'C6 rate'][rankingMode]} · #${rank}/${ranked.length}`, ...(rankingMode > 0 ? [`Selected rate: ${percent(score(avatar))}`] : []), '', 'Median stats:', ...stats, '', 'Talent levels:', ...(skills.length ? skills : ['—']), ...(constellations.length ? ['', 'Constellations: ', ...constellations] : []), ...(travelerElements.length ? ['', 'Traveler elements:', ...travelerElements] : []), '', 'Weapons:', ...(weapons.length ? weapons : ['—']), '', 'Artifact sets:', ...(sets.length ? sets : ['—']), '', 'Player Adventure Rank distribution:', ...buckets('AR buckets (count)', player.level ?? []), '', 'Achievements distribution:', ...buckets('Achievement buckets (count)', player.finishAchievementNum ?? []), '', 'Spiral Abyss:', ...buckets('Floor buckets (count)', player.towerFloorIndex ?? []), '', 'Imaginarium Theater:', ...buckets('Act buckets (count)', player.theaterActIndex ?? []), '', 'Character ranking:', ...rankingLines]
    await result('SHOWCASE ANALYTICS', lines)
  } catch (error) { await result('ANALYTICS ERROR', [String(error)]) }
}
async function artifacterScreen() {
  const uid = await textInput('ARTIFACTER\n\nUID:', value => UID_RE.test(value) ? undefined : 'UID должен состоять из 9 цифр.'); if (!uid || quitRequested) return
  const response = await fetchUid(uid); const list = response.json?.avatarInfoList as any[] | undefined; if (!list?.length) return result('ARTIFACTER', [response.error ?? 'Showcase пуст.'])
  const index = await pickIndex('ARTIFACTER — CHARACTER', list.map((item, i) => `${i + 1}. ${avatarName(item.avatarId)}`)); if (index === undefined || quitRequested) return
  const avatar = list[index]; const type = await textInput('ARTIFACTER\n\nScore type: CRIT/HP/ATK/DEF/EM/ER', value => ['CRIT', 'HP', 'ATK', 'DEF', 'EM', 'ER'].includes(value.toUpperCase()) ? undefined : 'Неизвестный score type.'); if (!type || quitRequested) return
  const selectedType = type.toUpperCase() as ScoreType; const team: { avatar: any; type: ScoreType }[] = [{ avatar, type: selectedType }]; const used = new Set([avatar.avatarId])
  while (team.length < 4) { const slot = await pickIndex('ARTIFACTER — TEAM CARD', ['Done', ...list.filter(item => !used.has(item.avatarId)).map(item => `${avatarName(item.avatarId)} (${item.avatarId})`)]); if (slot === undefined || quitRequested) return; if (slot === 0) break; const candidates = list.filter(item => !used.has(item.avatarId)); const member = candidates[slot - 1]; if (!member) break; const memberType = await textInput(`ARTIFACTER — ${avatarName(member.avatarId)}\n\nScore type: CRIT/HP/ATK/DEF/EM/ER`, value => ['CRIT', 'HP', 'ATK', 'DEF', 'EM', 'ER'].includes(value.toUpperCase()) ? undefined : 'Неизвестный score type.'); if (!memberType || quitRequested) return; used.add(member.avatarId); team.push({ avatar: member, type: memberType.toUpperCase() as ScoreType }) }
  const remapped = formatAvatarForTerminal(avatar); const score = scoreCharacterArtifacts(avatar, selectedType); const lines = [remapped.lines[0], `Score type: ${selectedType}`, ...score.rows.map(row => `${row.equipType}: ${row.value.toFixed(2)} (${row.grade || '—'})`), `Total: ${score.total.toFixed(2)} / ${score.grade}`, '', 'TEAM CARD:', ...team.flatMap(member => { const memberScore = scoreCharacterArtifacts(member.avatar, member.type); return [`${avatarName(member.avatar.avatarId)} — ${member.type}: ${memberScore.total.toFixed(2)} / ${memberScore.grade}`] }), '', ...remapped.lines.slice(2)]; try { const exported = await exportTextCard('Paimon+ Artifacter', lines, './paimon-artifacter.txt'); lines.push('', `Exported text: ${exported}`) } catch { lines.push('', 'Text export unavailable; terminal preview is still available.') } await result('ARTIFACTER CARD', lines)
}
async function wishScreen() { let page = 0; while (true) { const rows = wish.flatMap(item => wrap(`v${item.ver.toFixed(1)} | 1: ${(item.c51 ?? []).join(', ')} | 2: ${(item.c52 ?? []).join(', ')}${item.c5e1 ? ` | rerun: ${item.c5e1.join(', ')}` : ''}`)); const perPage = Math.max(1, height() - 7); const pages = Math.max(1, Math.ceil(rows.length / perPage)); page = Math.min(page, pages - 1); clear(); box('WISH BANNER HISTORY', [`Page ${page + 1}/${pages} • ←/→ or j/k page • Esc back`, ...rows.slice(page * perPage, page * perPage + perPage)]); const key = await readAction(); if (quitRequested || key.key === 'escape') return; if (key.key === 'home') page = 0; if (key.key === 'end') page = pages - 1; if (key.key === 'left' || key.key === 'up' || (key.key === 'char' && key.value?.toLowerCase() === 'k')) page = Math.max(0, page - 1); if (key.key === 'right' || key.key === 'down' || (key.key === 'char' && key.value?.toLowerCase() === 'j')) page = Math.min(pages - 1, page + 1) } }
async function cardsScreen() {
  const available = templates(); if (!available.length) return result('PLAYER CARD', ['Оригинальные metadata шаблонов не найдены.'])
  const selected = await pickIndex('PLAYER CARD — TEMPLATE', available.map((item, i) => `${i + 1}. ${item.id} — ${item.editable ? `${item.fields.length} editable fields` : 'read-only'}${item.link ? ` — ${item.link}` : ''}`)); if (selected === undefined || quitRequested) return
  const template = available[selected]
  if (!template.editable) return result('PLAYER CARD — READ ONLY', [`Template: ${template.id}`, `Source: ${template.link || '—'}`, 'У этого оригинального шаблона нет editable metadata; доступен только preview/source link.'])
  const values: string[] = []
  for (const field of template.fields) {
    const options = field.items.length ? `\nOptions: ${field.items.join(', ')}` : ''
    const validator = field.type === 'frame' ? (value: string) => field.items.includes(value.trim()) ? undefined : `Выберите один вариант: ${field.items.join(', ')}` : field.type === 'checkbox' ? (value: string) => value.split(',').map(item => item.trim()).filter(Boolean).every(item => field.items.includes(item)) ? undefined : `Варианты: ${field.items.join(', ')}` : (value: string) => value.trim() ? undefined : 'Поле обязательно.'
    const value = field.type === 'number' ? await numberInput(`PLAYER CARD — ${template.id}\n\n${field.label}${options}:`, 0) : await textInput(`PLAYER CARD — ${template.id}\n\n${field.label} (${field.type})${options}:`, validator)
    if (value === undefined || quitRequested) return
    values.push(`${field.label} [${field.type}]: ${value}`)
  }
  if (template.customItems.length) {
    const custom = await textInput(`PLAYER CARD — ${template.id}\n\nCustom character/list values (optional, comma-separated):`, value => value.split(',').map(item => item.trim()).filter(Boolean).every(item => template.customItems.includes(item)) ? undefined : 'Есть значение вне оригинального custom list.')
    if (custom === undefined || quitRequested) return
    if (custom.trim()) values.push(`Custom: ${custom}`)
  }
  const lines = [`Template: ${template.id}`, ...values, `Source: ${template.link || '—'}`]; try { const exported = await exportTextCard(`Paimon+ ${template.id}`, lines, `./paimon-${template.id}.txt`); lines.push('', `Exported text: ${exported}`) } catch { lines.push('', 'Text export unavailable; terminal preview is still available.') } await result('PLAYER CARD PREVIEW', lines)
}
async function translatorScreen() {
  const keys = Object.keys(ui.en); const values = new Map<string, string>(); let cursor = 0; let untranslatedOnly = true; let status = 'No file written.'
  const translationText = () => `  en: {\n${keys.filter(key => values.get(key)?.trim()).map(key => `    ${JSON.stringify(key)}: ${JSON.stringify(values.get(key))},`).join('\n')}\n  },\n`
  while (true) {
    const visible = untranslatedOnly ? keys.filter(key => !values.get(key)?.trim()) : keys; if (!visible.length) { untranslatedOnly = false; continue }
    cursor = Math.min(cursor, visible.length - 1); const itemWidth = adaptiveItemWidth(36); const metrics = gridMetrics(itemWidth, 7, 3); const page = Math.floor(cursor / metrics.pageSize); const grid = pageGrid(visible, page, itemWidth, (key, index) => `${values.get(key)?.trim() ? '[x]' : '[ ]'} ${index === cursor ? ansi.yellow + '▸ ' : '  '}${key}`, metrics)
    clear(); box('TRANSLATOR TOOLS — DEVELOPER ONLY', [`${ansi.dim}Enter/e edit  d export TS  u ${untranslatedOnly ? 'show all' : 'only untranslated'}  Esc back${ansi.reset}`, `Keys: ${keys.length}  Completed: ${[...values.values()].filter(value => value.trim()).length}  ${status}`, `Page ${page + 1}/${grid.totalPages}`]); grid.lines.forEach(line => console.log(line))
    const key = await readAction(); const offset = cursor % grid.pageSize; const row = Math.floor(offset / grid.columns); const column = offset % grid.columns; const pageEnd = Math.min(visible.length - 1, page * grid.pageSize + grid.pageSize - 1)
    if (quitRequested || key.key === 'escape') return
    if (key.key === 'up' || (key.key === 'char' && key.value?.toLowerCase() === 'k')) cursor = row > 0 ? cursor - grid.columns : cursor >= grid.columns ? cursor - grid.columns : cursor
    else if (key.key === 'down' || (key.key === 'char' && key.value?.toLowerCase() === 'j')) cursor = cursor + grid.columns < visible.length ? Math.min(visible.length - 1, cursor + grid.columns) : cursor
    else if (key.key === 'left') cursor = column > 0 ? cursor - 1 : cursor
    else if (key.key === 'right') cursor = column + 1 < grid.columns && cursor < pageEnd ? Math.min(pageEnd, cursor + 1) : cursor
    else if (key.key === 'home') cursor = 0
    else if (key.key === 'end') cursor = visible.length - 1
    else if (key.key === 'char' && key.value?.toLowerCase() === 'u') { untranslatedOnly = !untranslatedOnly; cursor = 0 }
    else if (key.key === 'char' && key.value?.toLowerCase() === 'd') { writeFileSync('./paimon-translation.en.txt', translationText()); status = 'Exported ./paimon-translation.en.txt' }
    else if (key.key === 'enter' || (key.key === 'char' && key.value?.toLowerCase() === 'e')) { const selected = visible[cursor]; const value = await textInput(`${selected}\n\nEnglish source: ${String(ui.en[selected as keyof typeof ui.en] ?? '')}`, () => undefined, values.get(selected) ?? ''); if (value === undefined || quitRequested) return; values.set(selected, value) }
  }
}
const officialNames: Record<string, string> = { checkin: 'Check-In', wiki: 'HoYoWiki', map: 'Teyvat Map', chronicle: 'Chronicle', calculator: 'Calculator', calendar: 'Calendar' }
const officialLinks = officialLink.map(item => [officialNames[item.img] ?? item.text, item.href] as const)
async function officialScreen() {
  let cursor = 0
  while (true) {
    clear(); box('OFFICIAL LINKS', [`${ansi.dim}↑/↓/j/k select  Enter show URL  o open in system browser  Esc back${ansi.reset}`, ...officialLinks.map(([name, url], index) => `${index === cursor ? ansi.cyan + '▸' : ' '} ${name} — ${url}`)])
    const key = await readAction(); if (quitRequested || key.key === 'escape') return
    if (key.key === 'up' || (key.key === 'char' && key.value?.toLowerCase() === 'k')) cursor = (cursor + officialLinks.length - 1) % officialLinks.length
    else if (key.key === 'down' || (key.key === 'char' && key.value?.toLowerCase() === 'j')) cursor = (cursor + 1) % officialLinks.length
    else if (key.key === 'home') cursor = 0
    else if (key.key === 'end') cursor = officialLinks.length - 1
    else if (key.key === 'enter') await result(officialLinks[cursor][0], [officialLinks[cursor][1], 'Скопируйте URL из терминала или нажмите Enter/Esc назад.'])
    else if (key.key === 'char' && key.value?.toLowerCase() === 'o') { const child = spawn('xdg-open', [officialLinks[cursor][1]], { detached: true, stdio: 'ignore' }); child.on('error', () => undefined); child.unref(); await result('OFFICIAL LINKS', [`Открыто системным opener: ${officialLinks[cursor][0]}`, officialLinks[cursor][1]]) }
  }
}
async function staticScreen(screen: Screen) { if (screen === 'official') return officialScreen(); return result('ORIGINAL PAGE STATUS', ['Talent Materials: page no longer available.', 'Developer Tools: under reconstruction.']) }

async function open(screen: Screen) { if (screen === 'home') return result('DASHBOARD', [`Original nav features: ${navLink.length}`, `Original datasets: ${avatars.length} team-builder entries`, `Owned characters: ${owned.size}`, `Favorites: ${favorites.size}`, `Owned profiles: ${[...profiles.keys()].join(', ')}`, 'Select a feature from the menu.']); if (screen === 'crit') return critScreen(); if (screen === 'damage') return damageScreen(); if (screen === 'team') return teamPicker(); if (screen === 'random') return randomScreen(); if (screen === 'uid') return uidScreen(); if (screen === 'analytics') return analyticsScreen(); if (screen === 'artifacter') return artifacterScreen(); if (screen === 'wish') return wishScreen(); if (screen === 'cards') return cardsScreen(); if (screen === 'translator') return translatorScreen(); return staticScreen(screen) }

async function main() {
  let selected = 0; let started = false; redraw = () => header(selected)
  try {
    startTerminal(); started = true
    while (active) {
      redraw(); const key: KeyEvent = await readAction(); if (quitRequested) break
      if (key.key === 'resize') continue
      if (key.key === 'up' || (key.key === 'char' && key.value?.toLowerCase() === 'k')) selected = (selected + menu.length - 1) % menu.length
      else if (key.key === 'down' || (key.key === 'char' && key.value?.toLowerCase() === 'j')) selected = (selected + 1) % menu.length
      else if (key.key === 'home') selected = 0
      else if (key.key === 'end') selected = menu.length - 1
      else if (key.key === 'enter') { await open(menu[selected].id); if (quitRequested) break }
    }
  } finally { active = false; if (started) { stopTerminal(); clear() } }
}
main().catch(error => { if (process.stdin.isTTY) stopTerminal(); process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
