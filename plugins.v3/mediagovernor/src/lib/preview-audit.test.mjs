import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateOfficialPreview } from './preview-audit.js'

const identity = { title: 'Example', media_source: 'themoviedb', media_id: '10', media_type: 'movie', abstain: false }
const preview = target => ({ summary: { total: 1, success: 1, failed: 0 }, items: [{ source: '/d/a.mkv', target, success: true }] })
const unit = history => ({ id: 'u', complete: true, entries: [{ path: '/d/a.mkv' }], history })

test('官方目标存在时不误报正常项目', () => {
  const target = '/library/movie/Example/a.mkv'
  assert.equal(evaluateOfficialPreview({ unit: unit([]), identity, preview: preview(target), presentPaths: new Set([target.toLowerCase()]) }), null)
})

test('原文件仍在而官方目标不存在才报原生失败', () => {
  assert.equal(evaluateOfficialPreview({ unit: unit([]), identity, preview: preview('/library/movie/Example/a.mkv'), presentPaths: new Set() }).kind, 'native_failure')
})

test('错误目标与官方目标不同只输出一个假成功结论', () => {
  const actual = '/library/tv/Other/S01/a.mkv'; const expected = '/library/movie/Example/a.mkv'
  const result = evaluateOfficialPreview({ unit: unit([{ id: 1, status: true, dest: actual }]), identity, preview: preview(expected), presentPaths: new Set([actual.toLowerCase()]), libraryRootFor: path => ({ media_type: path.includes('/movie/') ? 'movie' : 'tv' }) })
  assert.equal(result.kind, 'category_error')
})

test('不完整预览不能产生问题结论', () => {
  const result = evaluateOfficialPreview({ unit: unit([]), identity, preview: { summary: { total: 1, success: 0, failed: 1 }, items: [] }, presentPaths: new Set() })
  assert.equal(result.kind, 'unconfirmed')
})

