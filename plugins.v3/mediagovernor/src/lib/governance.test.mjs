import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyFinding, createDownloadUnits, diffMap, fileFingerprint, strictEpisodeHints, summarizeUnit } from './governance.js'

test('下载区顶层目录和单文件各是一个真实下载单元，不按相似标题拼包', () => {
  const units = createDownloadUnits({ storage: 'local', path: '/downloads' }, [{ type: 'dir', path: '/downloads/A', name: 'A' }, { type: 'file', path: '/downloads/B.mkv', name: 'B.mkv' }, { type: 'file', name: 'note.txt' }])
  assert.equal(units.length, 2)
})

test('文件指纹包含会随实际文件变动的名称、大小和时间', () => {
  assert.notEqual(fileFingerprint({ name: 'A.mkv', size: 1, modify_time: 'a' }), fileFingerprint({ name: 'A.mkv', size: 2, modify_time: 'a' }))
  assert.deepEqual(diffMap({ map_version: 1, download_units: [{ id: 'a', fingerprint: 'old' }] }, { download_units: [{ id: 'a', fingerprint: 'new' }, { id: 'b', fingerprint: 'x' }] }), { changed: ['a', 'b'], unchanged: 0, first: false })
})

test('集号只接收明确集号，不把清晰度误读为集数', () => {
  assert.deepEqual(strictEpisodeHints('Show.S01E02.2160p.mkv'), [2])
  assert.deepEqual(strictEpisodeHints('Movie.2024.2160p.mkv'), [])
})

test('真实失败与目标丢失才是问题，成功 move 的源缺失不是问题', () => {
  const unit = { id: 'u', root: { name: 'Show' }, entries: [{ name: 'Show.S01E01.mkv' }] }; const summary = summarizeUnit(unit)
  assert.equal(classifyFinding({ unit, summary, history: [{ id: 1, status: false }] })[0].kind, 'native_failure')
  assert.equal(classifyFinding({ unit, summary, history: [{ id: 2, status: true, dest: '/library/A.mkv' }] }).length, 0)
})

test('分类、季和作品名错误需要已确认身份，不能由猜测生成', () => {
  const unit = { id: 'u', root: { name: 'Show' }, entries: [{ name: 'Show.S01E01.mkv' }] }; const summary = summarizeUnit(unit)
  const diagnosis = { title: '正确作品', original_title: '', media_type: 'tv', season: 2, confidence: .9, abstain: false }
  const results = classifyFinding({ unit, summary, history: [{ status: true, dest: '/library/A', title: '错误作品', type: '电影', season: 1 }], diagnosis })
  assert.equal(results.some(item => item.kind === 'category_error'), true)
})
