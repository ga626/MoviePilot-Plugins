import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptanceFixtures, auditCoverage, bundleFamily, dedupeRoots, episodeAudit, historyIdentityAudit, initialIssueSignals, organizationAudit, pathRelationship, resolveIdentity, strictEpisodeHints } from './governance.js'

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

test('整理审计只锁定可证明的重复集，不把部分下载当成错误', () => {
  const issues = organizationAudit({ evidence: { episodes: [1, 3], duplicateEpisodes: [1], videos: 3 }, identity: { title: 'A', type_name: 'tv', episodeCount: 3 } })
  assert.equal(issues.some(item => item.includes('重复集号')), true)
  assert.equal(issues.some(item => item.includes('集号缺失')), false)
})

test('目录名差异、历史线索和集号间隔不能单独成为问题', () => {
  assert.deepEqual(initialIssueSignals(), [])
  assert.deepEqual(initialIssueSignals({ duplicateEpisodes: [] }), [])
  assert.deepEqual(initialIssueSignals({ activeFailure: true }), ['此当前包仍只有失败整理记录，没有对应成功记录，需要官方预览核验'])
  assert.deepEqual(initialIssueSignals({ duplicateEpisodes: [3] }), ['不同视频文件重复标为同一集：3'])
})

test('全量基线不能把未核验、年份冲突或类型冲突伪装成通过', () => {
  assert.deepEqual(historyIdentityAudit({}, { title: '示例剧', year: '2024', media_type: 'tv', confidence: 0.9 }), ['当前包没有可核验整理记录'])
  assert.deepEqual(historyIdentityAudit({ title: '示例剧', year: '2024', type: '电视剧' }, null), ['作品身份尚未核验'])
  assert.deepEqual(historyIdentityAudit({ title: '示例剧', year: '2024', type: '电视剧' }, { title: '示例剧', year: '2023', media_type: 'tv', confidence: 0.9 }), ['作品年份与现有整理记录不一致'])
  assert.deepEqual(historyIdentityAudit({ title: '示例剧', year: '2024', type: '电影' }, { title: '示例剧', year: '2024', media_type: 'tv', confidence: 0.9 }), ['作品类型与现有整理记录不一致'])
  assert.deepEqual(historyIdentityAudit({ title: '示例剧', year: '2024', type: '电视剧' }, { title: '示例剧', year: '2024', media_type: 'tv', confidence: 0.9 }), [])
})

test('全量检查覆盖不完整时不能给出通过结论', () => {
  assert.deepEqual(auditCoverage({ expected: 180, scanned: 180, limited: false }), { complete: true, message: '已覆盖全部 180 个当前包' })
  assert.deepEqual(auditCoverage({ expected: 181, scanned: 180, limited: true }), { complete: false, message: '只覆盖 180/181 个当前包' })
})

test('集号只接受明确的剧集格式，清晰度数字不能伪造缺集', () => {
  assert.deepEqual(strictEpisodeHints('示例剧.S01E02.2160p.mkv'), [2])
  assert.deepEqual(strictEpisodeHints('示例剧.EP12.mkv'), [12])
  assert.deepEqual(strictEpisodeHints('示例动画.[03].mkv'), [3])
  assert.deepEqual(strictEpisodeHints('示例电影.2024.2160p.mkv'), [])
})

test('用户可见样例全部通过同一规则', () => {
  assert.equal(acceptanceFixtures().every(item => item.pass), true)
})

test('平铺目录的文件名可归入不同作品，季集号不会误当标题', () => {
  assert.equal(bundleFamily('Cowboy.Bebop.S01E26.1080p.mkv'), 'cowboy bebop')
  assert.equal(bundleFamily('The.Movie.2024.EP01.mkv'), 'the movie 2024')
  assert.notEqual(bundleFamily('Movie.A.S01E01.mkv'), bundleFamily('Movie.B.S01E01.mkv'))
})

test('宽泛历史目录只作线索，不能作为当前作品包重新检查', () => {
  assert.equal(pathRelationship('/library/tv', '/library/tv/Show/Season 1'), 'ancestor')
  assert.equal(pathRelationship('/library/tv/Show/Season 1', '/library/tv'), 'descendant')
  assert.equal(pathRelationship('/library/tv/A', '/library/movie/B'), 'unrelated')
})
