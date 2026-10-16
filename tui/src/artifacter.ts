import { avatarRemap } from './uid-api.js'

export type ScoreType = 'CRIT' | 'HP' | 'ATK' | 'DEF' | 'EM' | 'ER'
const equipTypes = ['EQUIP_BRACER', 'EQUIP_NECKLACE', 'EQUIP_SHOES', 'EQUIP_RING', 'EQUIP_DRESS']
const propNames: Record<string, string> = {
  FIGHT_PROP_CRITICAL: 'CRIT Rate', FIGHT_PROP_CRITICAL_HURT: 'CRIT DMG', FIGHT_PROP_ATTACK_PERCENT: 'ATK %',
  FIGHT_PROP_HP_PERCENT: 'HP %', FIGHT_PROP_DEFENSE_PERCENT: 'DEF %', FIGHT_PROP_ELEMENT_MASTERY: 'Elemental Mastery', FIGHT_PROP_CHARGE_EFFICIENCY: 'Energy Recharge',
}
export const scoreArtifact = (artifact: any, type: ScoreType) => (artifact?.flat?.reliquarySubstats ?? []).reduce((score: number, sub: any) => {
  const name = sub.type ?? propNames[sub.appendPropId]; const value = Number(sub.statValue ?? 0); if (name === 'CRIT Rate') return score + value * 2; if (name === 'CRIT DMG') return score + value
  if (type === 'ATK' && name === 'ATK %') return score + value; if (type === 'HP' && name === 'HP %') return score + value
  if (type === 'DEF' && name === 'DEF %') return score + value; if (type === 'EM' && name === 'Elemental Mastery') return score + value / 4; if (type === 'ER' && name === 'Energy Recharge') return score + value
  return score
}, 0)
export const artifactGrade = (score: number, equipType: string, type: ScoreType) => {
  const adjusted = score + (equipType === 'EQUIP_SHOES' || equipType === 'EQUIP_RING' ? 5 : equipType === 'EQUIP_DRESS' ? 10 : 0) + (type === 'CRIT' ? 5 : 0)
  return equipType === 'EQUIP_RING' && type !== 'CRIT' ? adjusted < 42 ? 'B' : adjusted < 45 ? 'A' : adjusted < 50 ? 'S' : 'SS' : adjusted < 40 ? 'B' : adjusted < 45 ? 'A' : adjusted < 50 ? 'S' : 'SS'
}
export const scoreCharacterArtifacts = (avatar: any, type: ScoreType) => {
  const remapped = avatarRemap(avatar); const artifacts = (remapped.equipList ?? []).filter((item: any) => item.reliquary)
  const rows = equipTypes.map(equipType => { const item = artifacts.find((entry: any) => entry.flat?.equipType === equipType); const value = scoreArtifact(item, type); return { equipType, value, grade: item ? artifactGrade(value, equipType, type) : '' } })
  const total = rows.reduce((sum, row) => sum + row.value, 0); const adjusted = total + (type === 'CRIT' ? 20 : 0); const grade = adjusted < 180 ? 'B' : adjusted < 200 ? 'A' : adjusted < 220 ? 'S' : 'SS'
  return { rows, total, grade }
}
