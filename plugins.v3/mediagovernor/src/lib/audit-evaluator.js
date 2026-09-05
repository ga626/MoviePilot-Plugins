import { classifyFinding, latestHistory, summarizeUnit } from './governance.js'

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
  latest = null,
  targetEvidence = {},
} = {}) {
  const summary = unit?.summary || summarizeUnit(unit)
  const finding = (kind, reason, strength = 'strong') => ({ kind, reason, strength, unit_id: unit?.id || '', history_id: (latest || latestHistory(history))?.id || null })
  if (!summary.video_count) return { summary, findings: [], disposition: 'normal' }
  if (!coverageComplete) {
    return { summary, findings: [finding('uncovered', '当前目录或官方预览未完整读取，暂不能下结论', 'review')], disposition: 'uncovered' }
  }
  const successful = history.filter(row => row?.status === true)
  const current = latest || latestHistory(history)
  const findings = classifyFinding({ unit, summary, history, library, diagnosis })
  if (current?.status === false) {
    return { summary, findings: [finding('native_failure', '最近一次原生整理失败，且下载包仍在当前下载区')], disposition: 'problem' }
  }
  if (successful.length && targetPresent === false) {
    findings.unshift(finding('native_failure', '原生整理目标当前不存在或已被手动改动'))
  }
  for (const evidence of Object.values(targetEvidence || {})) {
    if (!evidence || evidence.complete === false) continue
    if (evidence.category_ok === false) findings.push(finding('category_error', '实际目标目录与确认的媒体类型不一致', 'review'))
    if (evidence.season_ok === false) findings.push(finding('hierarchy_error', '实际目标季目录与确认季不一致', 'review'))
    if (evidence.identity_ok === false) findings.push(finding('identity_error', '实际目标文件识别为另一部作品', 'review'))
    if (evidence.episode_ok === false) findings.push(finding('episode_error', '源文件与实际目标文件的集号不一致', 'review'))
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
