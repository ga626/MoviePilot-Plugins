import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateUnitAudit } from './audit-evaluator.js'
import { configuredDownloadRoots, createDownloadUnits, historyRowsForUnit, latestHistory, summarizeUnit } from './governance.js'

test('宿主目录配置到审计结论：只读取配置下载区，并同时找出真失败与假成功', () => {
  // 形状与 MoviePilot storage/directories?directory_type=download 一致；没有真实路径或 NAS 调用。
  const scope = configuredDownloadRoots([{ name: '下载区', storage: 'local', download_path: '/configured/download' }])
  assert.deepEqual(scope.roots.map(item => item.path), ['/configured/download'])

  // 形状与 storage/list(FileItem) 一致。若错误地把配置对象传给 list，下面不会产生下载单元。
  const units = createDownloadUnits(scope.roots[0], [
    { type: 'dir', storage: 'local', path: '/configured/download/Native-Failure', name: 'Native-Failure' },
    { type: 'dir', storage: 'local', path: '/configured/download/False-Success', name: 'False-Success' },
  ])
  assert.deepEqual(units.map(item => item.root.path), ['/configured/download/Native-Failure', '/configured/download/False-Success'])

  const rows = [
    { id: 11, date: '2026-09-01T00:00:00Z', status: false, src: '/configured/download/Native-Failure/E01.mkv' },
    { id: 12, date: '2026-09-01T00:00:00Z', status: true, src: '/configured/download/False-Success/E01.mkv', dest: '/library/tv/Other/S02/E02.mkv' },
  ]
  const failure = { ...units[0], entries: [{ name: 'Native-Failure.E01.mkv' }] }
  const falseSuccess = { ...units[1], entries: [{ name: 'False-Success.S01E01.mkv' }] }
  failure.summary = summarizeUnit(failure); falseSuccess.summary = summarizeUnit(falseSuccess)
  const failureHistory = historyRowsForUnit(failure, rows)
  const falseSuccessHistory = historyRowsForUnit(falseSuccess, rows)

  const native = evaluateUnitAudit({ unit: failure, history: failureHistory, latest: latestHistory(failureHistory) })
  assert.deepEqual(native.findings.map(item => item.kind), ['native_failure'])

  const apparent = evaluateUnitAudit({
    unit: falseSuccess,
    history: falseSuccessHistory,
    latest: latestHistory(falseSuccessHistory),
    diagnosis: { title: 'Right Show', media_type: 'tv', season: 1, confidence: .9, abstain: false },
    targetEvidence: { actual: { category_ok: true, season_ok: false, identity_ok: false, episode_ok: false } },
  })
  assert.deepEqual(apparent.findings.map(item => item.kind).sort(), ['episode_error', 'hierarchy_error', 'identity_error'])
})
