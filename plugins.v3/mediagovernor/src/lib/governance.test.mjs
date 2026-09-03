import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptanceFixtures, dedupeRoots, episodeAudit, organizationAudit, resolveIdentity } from './governance.js'

test('重叠根目录只保留最小可扫描范围', () => {
  const result = dedupeRoots([{ path: '/library', storage: 'local' }, { path: '/library/tv', storage: 'local' }, { path: '/downloads', storage: 'local' }])
  assert.deepEqual(result.roots.map(item => item.path), ['/library', '/downloads'])
  assert.equal(result.skipped.length, 1)
})

test('集号审计可同时发现缺集和重复集', () => {
  assert.deepEqual(episodeAudit([1, 2, 2, 4]), { episodes: [1, 2, 4], duplicates: [2], missing: [3] })
})

test('候选只有在明显领先时才自动确认', () => {
  assert.equal(resolveIdentity([{ title: 'A', score: 10, conflicts: [] }, { title: 'B', score: 8, conflicts: [] }]).state, 'needs_selection')
  assert.equal(resolveIdentity([{ title: 'A', score: 12, conflicts: [] }, { title: 'B', score: 8, conflicts: [] }]).state, 'confirmed')
})

test('整理审计会锁定缺集和目录扫描已记录的重复集', () => {
  const issues = organizationAudit({ evidence: { episodes: [1, 3], duplicateEpisodes: [1], videos: 3 }, identity: { title: 'A', type_name: 'tv', episodeCount: 3 } })
  assert.equal(issues.some(item => item.includes('重复集号')), true)
  assert.equal(issues.some(item => item.includes('集号缺失')), true)
})

test('用户可见样例全部通过同一规则', () => {
  assert.equal(acceptanceFixtures().every(item => item.pass), true)
})
