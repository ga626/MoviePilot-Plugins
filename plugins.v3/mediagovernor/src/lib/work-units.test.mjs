import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkUnits } from './work-units.js'

const file = (path, name = path.split('/').pop()) => ({ type: 'file', path, name })

test('多季合集按季拆成作品单元，不把跨季同集号报成重复', () => {
  const rows = createWorkUnits({ id: 'pkg', root: { path: '/d/show', name: 'Show' }, entries: [file('/d/show/Show.S01E01.mkv'), file('/d/show/Show.S02E01.mkv')], history: [], complete: true })
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(row => row.season_hint), [1, 2])
})

test('电影合集按独立子目录拆分', () => {
  const rows = createWorkUnits({ id: 'pkg', root: { path: '/d/collection' }, entries: [file('/d/collection/Film A/Film A.mkv'), file('/d/collection/Film B/Film B.mkv')], history: [], complete: true })
  assert.equal(rows.length, 2)
})

test('同一下载任务跨多个顶层项目时按每个项目拆分', () => {
  const rows = createWorkUnits({ id: 'pkg', roots: [{ path: '/d/Film A' }, { path: '/d/Film B' }], root: { path: '/d/Film A' }, entries: [file('/d/Film A/Film A.mkv'), file('/d/Film B/Film B.mkv')], history: [], complete: true })
  assert.equal(rows.length, 2)
})
