/** 所有完整读取到的视频作品单元都要识别；历史不得决定诊断范围。 */
export function identityTargets (units = []) {
  return units.filter(unit => unit?.complete && (unit?.summary?.video_count || (unit?.attachment_only && unit?.summary?.subtitle_count)))
}

/** AI 只兜底 MoviePilot 无法给出唯一身份的单元，避免全库重复消耗。 */
export function aiFallbackTargets (units = []) {
  return identityTargets(units).filter(unit => {
    if (!unit?.nativeIdentity || unit?.attachment_only) return true
    const years = [...new Set((unit?.summary?.names || []).flatMap(name => String(name).match(/\b(?:19|20)\d{2}\b/g) || []))]
    return years.length === 1 && unit.nativeIdentity.year && String(unit.nativeIdentity.year) !== years[0]
  })
}
