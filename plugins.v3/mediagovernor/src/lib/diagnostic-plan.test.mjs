import test from 'node:test'
import assert from 'node:assert/strict'
import { aiFallbackTargets, identityTargets } from './diagnostic-plan.js'

test('every video unit receives native identity verification, even without history', () => {
  const units = [
    { id: 'apparently-successful-but-wrong', complete: true, history: [{ status: true }], summary: { video_count: 1 } },
    { id: 'without-history', complete: true, history: [], summary: { video_count: 1 } },
  ]
  assert.deepEqual(identityTargets(units).map(item => item.id), ['apparently-successful-but-wrong', 'without-history'])
})

test('AI cross-checks all video units instead of only native failures', () => {
  const units = [
    { id: 'native-ok', complete: true, history: [{}], summary: { video_count: 1 }, diagnosis: { confidence: 0.8, abstain: false } },
    { id: 'native-abstained', complete: true, history: [{}], summary: { video_count: 1 }, diagnosis: { confidence: 0, abstain: true } },
  ]
  assert.deepEqual(aiFallbackTargets(units).map(item => item.id), ['native-ok', 'native-abstained'])
})
