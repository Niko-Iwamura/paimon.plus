import type { AvatarData } from './generated/team-builder-types.js'
const random = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]
const isBuild = (pool: AvatarData[], number: number) => {
  const count = [0, 1, 2, 3].map(role => new Set(pool.filter(item => item.score[role]).map(item => item.avatarId)).size)
  return count[0] >= number && count[1] + count[2] >= number * 2 && count[3] >= number
}
const pick = (pool: AvatarData[], role?: 0 | 1 | 2 | 3) => random(pool.filter(item => role === undefined ? true : Boolean(item.score[role])))
export const randomTeam = (pool: AvatarData[]) => {
  if (!isBuild(pool, 1)) return undefined
  for (let tries = 300; tries; tries--) {
    const team = [pick(pool, 0), pick(pool, 1), pick(pool, 1), pick(pool, 3)]
    if (team.every(Boolean) && new Set(team.map(item => item?.avatarId)).size === 4) return team as AvatarData[]
  }
  return undefined
}
export const randomAbyss = (pool: AvatarData[]) => {
  if (!isBuild(pool, 2)) return undefined
  for (let tries = 300; tries; tries--) {
    const teams = [randomTeam(pool), randomTeam(pool)]
    if (teams.every(Boolean) && teams.every(team => !team?.some(item => item.avatarId === 10000117 || item.avatarId === 10000118)) && new Set(teams.flat().map(item => item?.avatarId)).size === 8) return teams as AvatarData[][]
  }
  return undefined
}
export const randomCharacter = (pool: AvatarData[]) => random(pool)
