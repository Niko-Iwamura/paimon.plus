import { avatar as sourceAvatar, globalCoop } from './generated/team-builder-data.js'
import { teamBuild } from './generated/team-builder-worker.js'
import type { AvatarData, Elem } from './generated/team-builder-types.js'
import { readFileSync } from 'node:fs'

type AvatarJson = { id: number; key: string; nameTextMapHash: number; qualityType?: string }
const avatarJson = JSON.parse(readFileSync(new URL('./generated/avatar.json', import.meta.url), 'utf8')) as AvatarJson[]
const textMap = JSON.parse(readFileSync(new URL('./generated/text-map.json', import.meta.url), 'utf8')) as { en: Record<string, string> }
const nameToId = new Map(avatarJson.map(item => [textMap.en[String(item.nameTextMapHash)] ?? item.key, item]))
const elementMap: Record<string, Elem> = { Fire: 'Pyro', Water: 'Hydro', Ice: 'Cryo', Electric: 'Electro', Grass: 'Dendro', Wind: 'Anemo', Rock: 'Geo' }

export type EnrichedAvatarData = AvatarData & { qualityType?: string }
export const avatars: EnrichedAvatarData[] = sourceAvatar.map(item => {
  const game = nameToId.get(item.name)
  const elem = item.elem ?? (game?.key ? elementMap[(game as AvatarJson & { element?: string }).element ?? ''] : undefined)
  return { ...item, elem, qualityType: game?.qualityType, avatarId: game?.id, id: `${item.name}:${elem ?? ''}` }
})
export const displayName = (item: AvatarData) => item.elem && (item.name === 'Traveler' || item.name === 'Manekin') ? `${item.name} — ${item.elem}` : item.name
export const defaultOwnedIds = new Set(avatars.filter(item => item.name === 'Traveler' || item.qualityType === 'QUALITY_PURPLE').map(item => item.id))
export const buildTeams = (ownedIds: Set<string>, favoriteIds: string[] = []) => {
  // The web builder always includes favorites in the worker input, even when
  // a favorite is not in the active owned tab. Keep that behavior in the TUI.
  const owned = avatars.filter(item => (ownedIds.has(item.id) || favoriteIds.includes(item.id)) && item.avatarId !== undefined)
  if (!owned.length) return undefined
  return teamBuild(owned, favoriteIds, { ...globalCoop, avatarNum: avatars.length })
}
export type TeamBuildResult = NonNullable<ReturnType<typeof buildTeams>>
