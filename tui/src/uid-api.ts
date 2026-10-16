import { readFileSync } from 'node:fs'

export type ApiResponse = { status: number; json?: Record<string, any>; error?: string }
export type RemappedSubstat = { appendPropId: string; statValue: number; type: string; display: string; rolls: { rank: number; value: number; display: string }[] }
export type RemappedAvatar = Record<string, any> & { level: number; levelLimit: number; name?: string; element?: string; stats: { type: string; value: number; display: string }[]; equipList?: any[]; reliquarySubStats: { appendPropId: string; statValue: number; type: string; display: string; rollCount: number }[] }

const avatarJson = JSON.parse(readFileSync(new URL('./generated/avatar.json', import.meta.url), 'utf8')) as any[]
const weaponJson = JSON.parse(readFileSync(new URL('./generated/weapon.json', import.meta.url), 'utf8')) as any[]
const reliquarySetJson = JSON.parse(readFileSync(new URL('./generated/reliquary-set.json', import.meta.url), 'utf8')) as any[]
const affixJson = JSON.parse(readFileSync(new URL('./generated/reliquary-affix.json', import.meta.url), 'utf8')) as any[]
const gameNames = JSON.parse(readFileSync(new URL('./generated/text-map.json', import.meta.url), 'utf8')) as { en: Record<string, string> }

export const UID_RE = /^(18|[1-35-9])\d{8}$/
export const uidUrl = (uid: string) => `https://paimon.plus/api/uid/${encodeURIComponent(uid)}`

export async function fetchUid(uid: string, timeoutMs = 15_000): Promise<ApiResponse> {
  if (!UID_RE.test(uid)) return { status: 499, error: 'UID должен состоять из 9 цифр и начинаться с допустимого региона.' }
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(uidUrl(uid), { headers: { accept: 'application/json', 'user-agent': 'paimon-plus-tui' }, signal: controller.signal })
    const body = await response.text(); let json: Record<string, any> | undefined
    try { json = JSON.parse(body) } catch { /* the status text below is more useful than a JSON parser error */ }
    if (!response.ok) return { status: response.status, error: apiError(response.status) }
    return { status: response.status, json }
  } catch (error) {
    return { status: 0, error: error instanceof Error && error.name === 'AbortError' ? 'Запрос превысил тайм-аут.' : String(error) }
  } finally { clearTimeout(timer) }
}

export const apiError = (status: number) => ({
  400: 'Превышен лимит Cloudflare.', 404: 'UID не найден.', 424: 'Сервер Genshin или Enka недоступен.',
  429: 'Превышен лимит Enka/Genshin.', 500: 'Ошибка Enka.', 503: 'Enka временно недоступен.',
} as Record<number, string>)[status] ?? `Неизвестная ошибка API (${status}).`

export const avatarName = (id: number) => {
  const avatar = avatarJson.find(item => item.id === id)
  return avatar ? gameNames.en[String(avatar.nameTextMapHash)] ?? avatar.key : `Avatar ${id}`
}
export const weaponName = (id: number | undefined) => {
  const weapon = weaponJson.find(item => item.id === id)
  return weapon ? gameNames.en[String(weapon.nameTextMapHash)] ?? `Weapon ${id}` : `Weapon ${id ?? '—'}`
}
export const artifactSetName = (hash: string | number | undefined) => {
  const set = reliquarySetJson.find(item => String(item.nameTextMapHash) === String(hash) || String(item.id) === String(hash))
  return set ? gameNames.en[String(set.nameTextMapHash)] ?? `Set ${hash}` : `Set ${hash ?? '—'}`
}

const propNames: Record<string, string> = {
  FIGHT_PROP_BASE_ATTACK: 'Base ATK', FIGHT_PROP_HP: 'HP', FIGHT_PROP_ATTACK: 'ATK', FIGHT_PROP_DEFENSE: 'DEF',
  FIGHT_PROP_HP_PERCENT: 'HP %', FIGHT_PROP_ATTACK_PERCENT: 'ATK %', FIGHT_PROP_DEFENSE_PERCENT: 'DEF %',
  FIGHT_PROP_CRITICAL: 'CRIT Rate', FIGHT_PROP_CRITICAL_HURT: 'CRIT DMG', FIGHT_PROP_CHARGE_EFFICIENCY: 'Energy Recharge',
  FIGHT_PROP_ELEMENT_MASTERY: 'Elemental Mastery', FIGHT_PROP_HEAL_ADD: 'Healing Bonus', FIGHT_PROP_PHYSICAL_ADD_HURT: 'Physical DMG Bonus',
  FIGHT_PROP_FIRE_ADD_HURT: 'Pyro DMG Bonus', FIGHT_PROP_ELEC_ADD_HURT: 'Electro DMG Bonus', FIGHT_PROP_WATER_ADD_HURT: 'Hydro DMG Bonus',
  FIGHT_PROP_GRASS_ADD_HURT: 'Dendro DMG Bonus', FIGHT_PROP_WIND_ADD_HURT: 'Anemo DMG Bonus', FIGHT_PROP_ROCK_ADD_HURT: 'Geo DMG Bonus', FIGHT_PROP_ICE_ADD_HURT: 'Cryo DMG Bonus',
}
const flatProps = new Set(['Base ATK', 'HP', 'ATK', 'DEF', 'Elemental Mastery'])
const propType = (prop: string | number | undefined) => propNames[String(prop)] ?? String(prop ?? '')
const statString = (type: string, value: number, x100 = false) => flatProps.has(type) ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : `${(value * (x100 ? 100 : 1)).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
const rollString = (type: string, value: number) => flatProps.has(type) ? value.toFixed(0) : (value * 100).toFixed(1)

const ascensionLevel = (value: string | number | undefined) => [20, 40, 50, 60, 70, 80, 90][Number(value)] || 20

const getRollSet = (ids: number[] | undefined) => {
  const result: { prop: string; rolls: { rank: number; value: number; display: string }[] }[] = []
  for (const id of ids ?? []) {
    const data = affixJson.find(item => item.id === id)
    if (!data) continue
    const existing = result.find(item => item.prop === data.propType)
    const roll = { rank: id % 10, value: data.propValue ?? 0, display: rollString(propType(data.propType), data.propValue ?? 0) }
    if (existing) existing.rolls.push(roll)
    else result.push({ prop: data.propType, rolls: [roll] })
  }
  return result.map(item => ({ ...item, rolls: item.rolls.sort((a, b) => a.rank - b.rank) }))
}

const characterStats = (info: any) => {
  const statProps: [string, string][] = [['HP', '2000'], ['ATK', '2001'], ['DEF', '2002'], ['Elemental Mastery', '28'], ['CRIT Rate', '20'], ['CRIT DMG', '22'], ['Energy Recharge', '23']]
  return statProps.map(([type, prop]) => ({ type, value: Number(info.fightPropMap?.[prop] ?? 0), display: statString(type, Number(info.fightPropMap?.[prop] ?? 0), true) }))
}

/**
 * Port of the original avatarRemap, kept independent from the terminal UI.
 * It enriches raw Enka payloads with names, readable stats and roll data.
 */
export const avatarRemap = (info: any): RemappedAvatar => {
  const data = avatarJson.find(item => item.id === info.avatarId && (!info.skillDepotId || item.skillDepotId === info.skillDepotId)) ?? avatarJson.find(item => item.id === info.avatarId)
  const costume = data?.costumes?.find((item: any) => item.skinId === info.costumeId)
  const level = Number(info.propMap?.['4001']?.val ?? info.propMap?.['4001']?.ival ?? 0)
  const remapped: RemappedAvatar = {
    ...JSON.parse(JSON.stringify(info)), level, levelLimit: ascensionLevel(info.propMap?.['1002']?.val), name: data ? gameNames.en[String(data.nameTextMapHash)] ?? data.key : avatarName(info.avatarId),
    element: data?.element, sideIcon: costume?.key ? `UI_AvatarIcon_Side_${costume.key}` : `UI_AvatarIcon_Side_${data?.key}`,
    avatarImg: costume?.key ? `UI_Costume_${costume.key}` : `UI_Gacha_AvatarImg_${data?.key}`, talentIcons: data?.consts?.map((icon: string, i: number) => ({ icon, unlock: i < (info.talentIdList?.length ?? 0) })) ?? [],
    skills: data?.skills?.map((skill: any) => ({ ...skill, level: info.skillLevelMap?.[skill.id] ?? 0, add: info.proudSkillExtraLevelMap?.[skill.proud] ?? 0 })) ?? [],
    stats: characterStats(info), reliquarySubStats: [], equipList: [],
  }
  for (const original of info.equipList ?? []) {
    const equip = JSON.parse(JSON.stringify(original))
    if (equip.reliquary) {
      const main = equip.flat?.reliquaryMainstat
      if (main) { main.type = propType(main.mainPropId); main.display = statString(main.type, Number(main.statValue ?? 0)) }
      const rollSet = getRollSet(equip.reliquary.appendPropIdList)
      for (const sub of equip.flat?.reliquarySubstats ?? []) {
        sub.type = propType(sub.appendPropId); sub.display = statString(sub.type, Number(sub.statValue ?? 0)); sub.rolls = rollSet.find(item => item.prop === sub.appendPropId)?.rolls ?? []
        const aggregate = remapped.reliquarySubStats.find(item => item.appendPropId === sub.appendPropId)
        if (aggregate) { aggregate.statValue += Number(sub.statValue ?? 0); aggregate.display = statString(sub.type, aggregate.statValue); aggregate.rollCount += sub.rolls.length }
        else remapped.reliquarySubStats.push({ appendPropId: sub.appendPropId, statValue: Number(sub.statValue ?? 0), type: sub.type, display: sub.display, rollCount: sub.rolls.length })
      }
      equip.flat.setName = artifactSetName(equip.flat.setNameTextMapHash)
    } else if (equip.weapon) {
      equip.weapon.levelLimit = ascensionLevel(equip.weapon.promoteLevel)
      equip.flat.name = gameNames.en[String(equip.flat.nameTextMapHash)] ?? weaponName(equip.itemId)
      for (const stat of equip.flat.weaponStats ?? []) { stat.type = propType(stat.appendPropId); stat.display = statString(stat.type, Number(stat.statValue ?? 0)) }
    }
    remapped.equipList?.push(equip)
  }
  remapped.reliquarySubStats.sort((a, b) => a.type.localeCompare(b.type))
  return remapped
}

export const formatAvatarForTerminal = (info: any) => {
  const avatar = avatarRemap(info)
  const lines = [`${avatar.name ?? avatarName(info.avatarId)} — ${avatar.level}/${avatar.levelLimit}`, `Element: ${avatar.element ?? '—'}`, '', 'Stats:', ...avatar.stats.map(stat => `  ${stat.type}: ${stat.display}`), '', 'Talents:', ...avatar.skills.map((skill: any) => `  ${skill.id}: ${skill.level ?? 0}${skill.add ? ` (+${skill.add})` : ''}`)]
  for (const equip of avatar.equipList ?? []) {
    if (equip.weapon) lines.push('', `Weapon: ${equip.flat?.name ?? weaponName(equip.itemId)} Lv.${equip.weapon.level}/${equip.weapon.levelLimit}`, ...(equip.flat?.weaponStats ?? []).map((stat: any) => `  ${stat.type}: ${stat.display}`))
    else if (equip.reliquary) lines.push('', `Artifact: ${equip.flat?.setName ?? artifactSetName(equip.flat?.setNameTextMapHash)} (${equip.flat?.equipType ?? '—'})`, `  Main: ${equip.flat?.reliquaryMainstat?.type ?? '—'} ${equip.flat?.reliquaryMainstat?.display ?? ''}`, ...(equip.flat?.reliquarySubstats ?? []).map((stat: any) => `  ${stat.type}: ${stat.display} [${stat.rolls?.length ?? 0} rolls]`))
  }
  return { avatar, lines }
}
