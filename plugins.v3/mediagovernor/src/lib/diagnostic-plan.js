/** 诊断范围先由“有当前整理关系”决定，不能由旧规则是否已报错决定。 */
export function identityTargets (units = []) {
  return units.filter(unit => unit?.complete && unit?.history?.length && unit?.summary?.video_count)
}

/** AI 只接住原生识别明确弃权的项目，避免为所有正常项目重复花费 token。 */
export function aiFallbackTargets (units = []) {
  return identityTargets(units).filter(unit => !unit.diagnosis || unit.diagnosis.abstain || unit.diagnosis.confidence < 0.5)
}
