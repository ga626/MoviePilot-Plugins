import test from 'node:test'
import assert from 'node:assert/strict'
import { historySucceeded, normaliseHistoryRows, unwrapMoviePilotResponse } from './moviepilot-response.js'

test('unwraps the federation and plugin response envelopes without hiding failures', () => {
  assert.deepEqual(unwrapMoviePilotResponse({ data: { success: true, data: { download_units: 216 } } }), { download_units: 216 })
  assert.throws(() => unwrapMoviePilotResponse({ data: { success: false, message: 'denied' } }), /denied/)
})

test('normalises MoviePilot history statuses before audit rules inspect them', () => {
  assert.equal(historySucceeded({ status: 'failed' }), false)
  assert.equal(historySucceeded({ status: 'success' }), true)
  assert.deepEqual(normaliseHistoryRows([{ status: 'failed' }, { status: true }]), [{ status: false }, { status: true }])
})
