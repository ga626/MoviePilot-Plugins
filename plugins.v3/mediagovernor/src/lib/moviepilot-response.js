/**
 * MoviePilot 的联邦页面在不同宿主版本会多包一层或两层 data。
 * 业务代码只接受最终负载；失败响应始终原样抛出，不能被误当成空数据。
 */
export function unwrapMoviePilotResponse (value) {
  let current = value
  const seen = new Set()
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    if (seen.has(current)) break
    seen.add(current)
    if (current.success === false) throw new Error(current.message || 'MoviePilot 请求失败')
    if (!Object.prototype.hasOwnProperty.call(current, 'data') || current.data === undefined) break
    current = current.data
  }
  return current
}

export function historySucceeded (row = {}, fallback = null) {
  const value = row.status
  if (typeof value === 'boolean') return value
  if (value == null || value === '') return fallback
  return ['true', 'success', 'succeeded', 'ok', '完成', '成功'].includes(String(value).trim().toLowerCase())
}

export function normaliseHistoryRows (rows = [], fallback = null) {
  return (Array.isArray(rows) ? rows : []).map(row => ({ ...row, status: historySucceeded(row, fallback) }))
}

export function shortTitle (value) {
  return String(value || '').replace(/[\\/]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
}
