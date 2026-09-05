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
