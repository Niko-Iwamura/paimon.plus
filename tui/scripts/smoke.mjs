import assert from 'node:assert/strict'
import { avatars, buildTeams, defaultOwnedIds } from '../dist/team-builder.js'
import { randomAbyss, randomTeam } from '../dist/randomizer.js'
import { averageDamage, critAverage, critMax } from '../dist/calculators.js'
import { templates } from '../dist/player-card.js'
import { wish } from '../dist/generated/wish-banner.js'
import { parseKeySequence } from '../dist/keyboard.js'
import { apiError, fetchUid } from '../dist/uid-api.js'

assert.ok(avatars.length >= 100, `expected original team data, got ${avatars.length}`)
assert.ok(defaultOwnedIds.size > 0, 'default owned list is empty')
assert.equal(critAverage(1000, 500, 0.5, 1), 2250)
assert.equal(critMax(1000, 500, 1), 3000)
assert.equal(averageDamage(0.5, 1, true, 2000), 1500)
const teams = buildTeams(defaultOwnedIds); assert.ok(teams?.battle.length, 'team builder returned no battle result')
const pool = avatars.filter(item => defaultOwnedIds.has(item.id)); const domain = randomTeam(pool); if (domain) assert.equal(new Set(domain.map(item => item.avatarId)).size, domain.length)
const abyss = randomAbyss(pool); if (abyss) assert.equal(new Set(abyss.flat().map(item => item.avatarId)).size, 8)
assert.ok(wish.length > 10, 'wish banner data was not synced')
assert.ok(templates().length >= 13, `expected all original player-card metadata, got ${templates().length}`)
assert.ok(templates().some(template => !template.editable), 'read-only player-card templates are missing')
const keys = parseKeySequence('\x1b[A\x1b[B\x1b[C\x1b[D\x1b[H\x1b[F\x1b[1~\x1b[4~\r \x7fq\x03').map(item => item.key)
assert.deepEqual(keys, ['up', 'down', 'right', 'left', 'home', 'end', 'home', 'end', 'enter', 'space', 'backspace', 'char', 'ctrl-c'])
assert.deepEqual(parseKeySequence('й').map(item => item.value), ['й'])
assert.equal((await fetchUid('123')).status, 499)
assert.match(apiError(429), /лимит/i)
console.log(`smoke ok: avatars=${avatars.length}, owned=${defaultOwnedIds.size}, battle=${teams.battle.length}, wish=${wish.length}, cards=${templates().length}`)
