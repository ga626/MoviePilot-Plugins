import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateUnitAudit, summarizeGoldenResult } from '../src/lib/audit-evaluator.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const fixturePath = resolve(root, 'tests/v3/mediagovernor/fixtures/golden/v1/cases.json')
const args = new Set(process.argv.slice(2))
const reportIndex = process.argv.indexOf('--report')
const reportPath = reportIndex >= 0 ? resolve(process.cwd(), process.argv[reportIndex + 1]) : ''
const stable = value => JSON.stringify(value)

function expectedRows (item) { return Array.isArray(item.expected) ? item.expected : [item.expected] }
function inputRows (item) { return item.inputs || [item.input] }
function compare (actual, expected) { return actual.disposition === expected.disposition && stable(actual.kinds) === stable([...expected.kinds].sort()) }
function html (result) {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
  const rows = result.cases.map(item => `<tr class="${item.pass ? 'pass' : 'fail'}"><td>${escape(item.id)}</td><td>${escape(item.expected.disposition)} / ${escape(item.expected.kinds.join(', ') || '正常')}</td><td>${escape(item.actual.disposition)} / ${escape(item.actual.kinds.join(', ') || '正常')}</td><td>${item.pass ? '通过' : '失败'}</td></tr>`).join('')
  return `<!doctype html><meta charset="utf-8"><title>MediaGovernor 金标准验收回执</title><style>body{font:16px system-ui;margin:32px;color:#172033}table{border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #d8dee9;text-align:left}.pass{background:#ecfdf3}.fail{background:#fff1f2}.summary{padding:16px;border-radius:12px;background:#eef2ff}</style><h1>MediaGovernor 金标准验收回执</h1><p class="summary">样本 ${result.summary.total} · 通过 ${result.summary.passed} · 失败 ${result.summary.failed} · ${result.summary.status}</p><table><thead><tr><th>样本</th><th>预期</th><th>实际</th><th>结果</th></tr></thead><tbody>${rows}</tbody></table>`
}

const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
if (fixture.schema !== 'mediagovernor-golden-fixture/v1' || (fixture.cases || []).length < 10) throw new Error('金标准样本 schema 或数量不符合门禁')
const containsRealPath = value => {
  if (Array.isArray(value)) return value.some(containsRealPath)
  if (value && typeof value === 'object') return Object.entries(value).some(([key, item]) => ['path', 'src_fileitem', 'dest_fileitem'].includes(key.toLowerCase()) || containsRealPath(item))
  return typeof value === 'string' && (/^[\\/]/.test(value) || /:\\/.test(value))
}
if (containsRealPath(fixture)) throw new Error('金标准样本包含路径字段，拒绝生成回执')
const cases = []
for (const item of fixture.cases || []) {
  const inputs = inputRows(item); const expected = expectedRows(item)
  if (inputs.length !== expected.length) throw new Error(`${item.id}: 输入与预期数量不一致`)
  for (let index = 0; index < inputs.length; index += 1) {
    const result = evaluateUnitAudit(inputs[index]); const actual = summarizeGoldenResult(result); const wanted = expected[index]
    cases.push({ id: inputs.length === 1 ? item.id : `${item.id}#${index + 1}`, expected: wanted, actual, pass: compare(actual, wanted) })
  }
}
const summary = { total: cases.length, passed: cases.filter(item => item.pass).length, failed: cases.filter(item => !item.pass).length }
summary.status = summary.failed ? '失败：禁止冻结候选' : '通过：可进入其余候选门禁'
const result = { schema: 'mediagovernor-golden-receipt/v1', fixture_schema: fixture.schema, summary, cases }
if (reportPath) {
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, html(result), 'utf8')
  await writeFile(reportPath.replace(/\.html?$/i, '.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
}
console.log(JSON.stringify(result, null, 2))
if (summary.failed) process.exitCode = 1
