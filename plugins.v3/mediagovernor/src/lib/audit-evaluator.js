import { classifyFinding, summarizeUnit } from './governance.js'

const uniqueFindings = rows => {
  const seen = new Map()
  for (const row of rows) {
    const key = `${row.kind}:${row.reason}`
    if (!seen.has(key)) seen.set(key, row)
  }
  return [...seen.values()]
}

/**
 * 将“当前下载单元 + 当前目标状态”转换为可判卷的结论。
 * 生产页面和金标准测试共用这一层，避免测试另一套想象中的规则。
 */
export function evaluateUnitAudit ({
  unit,
  history = [],
  library = [],
  diagnosis = null,
  targetPresent = true,
  coverageComplete = true,
  identityRequired = false,
} = {}) {
  const summary = unit?.summary || summarizeUnit(unit)
  const finding = (kind, reason, strength = 'strong') => ({ kind, reason, strength, unit_id: unit?.id || '', history_id: history.at(-1)?.id || null })
  if (!summary.video_count) return { summary, findings: [], disposition: 'normal' }
  if (!coverageComplete) {
    return { summary, findings: [finding('uncovered', '当前目录或官方预览未完整读取，暂不能下结论', 'review')], disposition: 'uncovered' }
  }
  const successful = history.filter(row => row?.status === true)
  const findings = classifyFinding({ unit, summary, history, library, diagnosis })
  if (successful.length && targetPresent === false) {
    findings.unshift(finding('native_failure', '原生整理目标当前不存在或已被手动改动'))
  }
  const unique = uniqueFindings(findings)
  if (unique.length) return { summary, findings: unique, disposition: 'problem' }
  if (identityRequired && !history.length) {
    return { summary, findings: [finding('unconfirmed', '当前下载单元没有可关联的整理历史，不能判断是否已正确整理', 'review')], disposition: 'unconfirmed' }
  }
  if (identityRequired && (!diagnosis || diagnosis.abstain || diagnosis.confidence < 0.5)) {
    return { summary, findings: [finding('unconfirmed', '作品身份证据不足，不能把它算作正常')], disposition: 'unconfirmed' }
  }
  return { summary, findings: [], disposition: 'normal' }
}

export function summarizeGoldenResult (result = {}) {
  return {
    disposition: result.disposition || 'uncovered',
    kinds: (result.findings || []).map(item => item.kind).sort(),
    reasons: (result.findings || []).map(item => item.reason),
  }
}
