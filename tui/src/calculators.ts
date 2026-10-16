export type CritNote = { type?: 'ATK' | 'HP' | 'DEF'; base?: number; add?: number; cr: number; cd: number; avg: number; cDmg: number }
export const clip01 = (num: number) => Math.min(1, Math.max(0, num))
export const critAverage = (base: number, add: number, cr: number, cd: number) => Number(((base + add) * (1 + clip01(cr) * cd)).toFixed(1))
export const critMax = (base: number, add: number, cd: number) => critAverage(base, add, 1, cd)
export const averageDamage = (cr: number, cd: number, isCrit: boolean, damage: number) => isCrit ? Number(((damage * (1 + clip01(cr) * cd)) / (1 + cd)).toFixed(0)) : Number((damage * (1 + clip01(cr) * cd)).toFixed(0))
export const maxCritDamage = (cd: number, isCrit: boolean, damage: number) => isCrit ? Number(damage.toFixed(0)) : Number((damage * (1 + cd)).toFixed(0))

// These are the same score/ideal-value equations used by the original radar
// chart. Keeping them here makes the terminal result useful without Chart.js.
export const critRatioScore = (type: 'ATK' | 'HP' | 'DEF', base: number, add: number, cr: number, cd: number) =>
  (type === 'DEF' ? 0.8 : 1) * (base === 0 ? 0 : add / base) + 1.5 * cr + 0.75 * cd

export const critIdeal = (type: 'ATK' | 'HP' | 'DEF', base: number, add: number, cr: number, cd: number) => {
  const score = critRatioScore(type, base, add, cr, cd)
  const normalized = score + (type === 'DEF' ? 0.8 : 1) - 1
  const defense = (value: number) => (type === 'DEF' ? 1.25 : 1) * value
  if (normalized < 2.525) return { addRatio: defense(score - 1.5 * 0.05 - 0.375), cr: 0.05, cd: 0.5 }
  if (normalized < 2.776) {
    const idealCr = (normalized - 2.375) / 3
    return { addRatio: defense(score - 1.5 * idealCr - 0.375), cr: idealCr, cd: 0.5 }
  }
  if (normalized < 4.25) {
    const idealCr = (normalized + 1 + Math.sqrt(Math.max(0, (normalized + 1) ** 2 - 13.5))) / 9
    return { addRatio: defense(score - 3 * idealCr), cr: idealCr, cd: idealCr * 2 }
  }
  const idealCd = ((normalized - 1.25) * 2) / 3
  return { addRatio: defense(score - 0.75 * idealCd - 1.5), cr: 1, cd: idealCd }
}

export const critDifference = (current: number, ideal: number) => current === 0 ? 0 : (ideal - current) / current
