import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { evaluateUnitAudit, summarizeGoldenResult } from './audit-evaluator.js'

const fixturePath = resolve(import.meta.dirname, '../../../../tests/v3/mediagovernor/fixtures/golden/v1/cases.json')
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))

test('每个金标准样本均由生产审计层判对', () => {
  for (const item of fixture.cases) {
    const inputs = item.inputs || [item.input]
    const expected = Array.isArray(item.expected) ? item.expected : [item.expected]
    assert.equal(inputs.length, expected.length, `${item.id}: 输入与预期数量不一致`)
    for (let index = 0; index < inputs.length; index += 1) {
      const actual = summarizeGoldenResult(evaluateUnitAudit(inputs[index]))
      assert.deepEqual(actual.kinds, [...expected[index].kinds].sort(), `${item.id}#${index + 1}: 问题类别`)
      assert.equal(actual.disposition, expected[index].disposition, `${item.id}#${index + 1}: 最终状态`)
    }
  }
})

test('未覆盖与身份不确定都不能被报告为正常', () => {
  const result = evaluateUnitAudit({ unit: { id: 'safe', root: { name: 'Safe' }, entries: [{ name: 'Safe.mkv' }] }, coverageComplete: false })
  assert.equal(result.disposition, 'uncovered')
  assert.notEqual(result.disposition, 'normal')
})

test('没有关联历史的下载单元必须留下无法确认结论，不能静默归零', () => {
  const result = evaluateUnitAudit({ unit: { id: 'unlinked', root: { name: 'Unlinked' }, entries: [{ name: 'Unlinked.mkv' }] }, history: [], coverageComplete: true, identityRequired: true })
  assert.equal(result.disposition, 'unconfirmed')
  assert.equal(result.findings[0].kind, 'unconfirmed')
})

test('最近失败不能被旧成功掩盖，且假成功要核验实际目标文件和目录', () => {
  const unit = { id: 'case', root: { name: 'Show' }, entries: [{ name: 'Show.S01E01.mkv' }] }
  const failure = evaluateUnitAudit({ unit, history: [{ id: 1, status: true }, { id: 2, status: false }], latest: { id: 2, status: false } })
  assert.equal(failure.findings[0].kind, 'native_failure')
  const falseSuccess = evaluateUnitAudit({
    unit,
    history: [{ id: 3, status: true, dest: '/library/tv/Show/S01/E01.mkv' }],
    diagnosis: { title: 'Show', media_type: 'tv', season: 1, confidence: .9, abstain: false },
    targetEvidence: { target: { category_ok: false, season_ok: false, identity_ok: false, episode_ok: false } },
  })
  assert.deepEqual(falseSuccess.findings.map(item => item.kind).sort(), ['category_error', 'episode_error', 'hierarchy_error', 'identity_error'])
})
