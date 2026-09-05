/** 所有完整读取到的视频作品单元都要识别；历史不得决定诊断范围。 */
export function identityTargets (units = []) {
  return units.filter(unit => unit?.complete && unit?.summary?.video_count)
}

/** AI 读取所有作品单元的整组证据，用来交叉核对原生识别而不是只接失败项。 */
export function aiFallbackTargets (units = []) {
  return identityTargets(units)
}
