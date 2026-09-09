export function unwrapMoviePilotResponse (response) {
  const body = response?.data ?? response
  if (body?.success === false) throw new Error(body.message || 'MoviePilot 返回失败')
  return body?.data ?? body ?? {}
}
