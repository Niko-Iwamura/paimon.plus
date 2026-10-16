import { fetchUid, type ApiResponse } from './uid-api.js'

export class ShowcaseStore {
  private readonly cache = new Map<string, Record<string, any>>()
  readonly history: string[] = []

  async load(uid: string): Promise<ApiResponse> {
    const cached = this.cache.get(uid)
    if (cached) return { status: 200, json: cached }
    const response = await fetchUid(uid)
    if (!response.json) return response
    this.cache.set(uid, response.json)
    const oldIndex = this.history.indexOf(uid); if (oldIndex >= 0) this.history.splice(oldIndex, 1)
    this.history.unshift(uid); this.history.splice(10)
    return response
  }
}
