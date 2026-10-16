import { fetchUid, UID_RE, uidUrl } from './uid-api.js'

export type CommandContext = { uid?: string; args?: string[] }
export type CommandSpec = { id: string; title: string; description: string; build: (context: CommandContext) => string; run?: (context: CommandContext) => Promise<string> }

const page = (path: string) => `https://paimon.plus${path}`
const simple = (id: string, title: string, description: string, path: string): CommandSpec => ({ id, title, description, build: () => page(path) })

export const commands: CommandSpec[] = [
  {
    id: 'uid', title: 'UID Showcase', description: 'Получить showcase-профиль игрока по UID',
    build: ({ uid }) => `GET ${uidUrl(uid || '<uid>')}`,
    run: async ({ uid }) => {
      if (!uid || !UID_RE.test(uid)) throw new Error('UID должен состоять из 9 цифр и начинаться с допустимого региона')
      const response = await fetchUid(uid)
      if (!response.json) throw new Error(response.error ?? `HTTP ${response.status || 'network'}`)
      return JSON.stringify(response.json, null, 2)
    },
  },
  simple('crit-ratio', 'CRIT Ratio', 'Калькулятор соотношения CRIT Rate / CRIT DMG', '/crit-ratio/'),
  simple('avg-dmg', 'Average Damage', 'Калькулятор среднего урона', '/avg-dmg/'),
  simple('team-builder', 'Team Builder', 'Оригинальный scoring worker для owned-пула персонажей', '/team-builder/'),
  simple('randomizer', 'Randomizer', 'Abyss, Domain и Character из owned-пула', '/team-randomizer/'),
  simple('showcase', 'UID Showcase', 'Профиль, персонажи, экипировка и таланты', '/showcase/'),
  simple('analytics', 'Showcase Analytics', 'Statistics, median stats и ranking', '/showcase-analytics/'),
  simple('artifacter', 'Artifacter', 'Оценка артефактов и team card', '/artifacter/'),
  simple('wish-banner', 'Wish Banner', 'История версий и половин баннеров', '/wish-banner/'),
  simple('player-card', 'Player Card', 'Оригинальные metadata шаблонов', '/player-card-templates/'),
  simple('translator', 'Translator Tools', 'Developer-only i18n generator', '/translator-tools/'),
]

export function getCommand(id: string) { return commands.find(command => command.id === id) }
