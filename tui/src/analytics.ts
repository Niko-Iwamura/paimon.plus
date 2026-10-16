export type StatisticsResponse = { status: number; json?: Record<string, any>; error?: string }
export const statisticsUrl = 'https://paimon.plus/api/statistics'

export async function fetchStatistics(timeoutMs = 15_000): Promise<StatisticsResponse> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(statisticsUrl, { headers: { accept: 'application/json', 'user-agent': 'paimon-plus-tui' }, signal: controller.signal })
    const body = await response.text(); let json: Record<string, any> | undefined
    try { json = JSON.parse(body) } catch { /* handled as an API error below */ }
    if (!response.ok) return { status: response.status, error: `Statistics API returned HTTP ${response.status}.` }
    return { status: response.status, json, error: json ? undefined : 'Statistics API returned invalid JSON.' }
  } catch (error) {
    return { status: 0, error: error instanceof Error && error.name === 'AbortError' ? 'Запрос статистики превысил тайм-аут.' : String(error) }
  } finally { clearTimeout(timer) }
}

export const percentage = (all: number, count: number) => {
  if (!all) return '0'
  const value = (count / all) * 100
  return value.toFixed(value < 1 ? 1 : 0)
}

export const ranking = (avatars: any[]) => [...avatars].sort((a, b) => Number(b.count ?? 0) - Number(a.count ?? 0))
