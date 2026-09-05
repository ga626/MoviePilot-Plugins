import test from 'node:test'
import assert from 'node:assert/strict'
import { aiFallbackTargets, identityTargets } from './diagnostic-plan.js'

test('every linked video unit receives native identity verification, including apparent successes', () => {
  const units = [
    { id: 'apparently-successful-but-wrong', complete: true, history: [{ status: true }], summary: { video_count: 1 } },
    { id: 'without-history', complete: true, history: [], summary: { video_count: 1 } },
  ]
  assert.deepEqual(identityTargets(units).map(item => item.id), ['apparently-successful-but-wrong'])
})

test('AI is a fallback for native abstention, not a rule-controlled admission gate', () => {
  const units = [
    { id: 'native-ok', complete: true, history: [{}], summary: { video_count: 1 }, diagnosis: { confidence: 0.8, abstain: false } },
    { id: 'native-abstained', complete: true, history: [{}], summary: { video_count: 1 }, diagnosis: { confidence: 0, abstain: true } },
  ]
  assert.deepEqual(aiFallbackTargets(units).map(item => item.id), ['native-abstained'])
})
