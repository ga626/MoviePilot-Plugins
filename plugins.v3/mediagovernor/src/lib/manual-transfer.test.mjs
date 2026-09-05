import assert from 'node:assert/strict'
import test from 'node:test'
import { manualPreviewRequest, manualRebuildRequests } from './manual-transfer.js'

const pkg = { root: { storage: 'local' }, entries: [{ name: 'Show.S01E01.mkv', type: 'file', storage: 'local', path: '/hidden/source.mkv' }] }
const identity = { media_source: 'tmdb', media_id: '42', media_type: 'tv', season: 1 }

test('官方预览使用 fileitems 与已确认身份，不发送不存在的 src_fileitem', () => {
  const request = manualPreviewRequest(pkg, identity, { target_storage: 'local', target_path: '/hidden/library' })
  assert.equal(request.fileitems.length, 1)
  assert.equal(request.src_fileitem, undefined)
  assert.equal(request.media_source, 'tmdb')
  assert.equal(request.preview, true)
})

test('重建请求逐条绑定成功历史，避免按名称或目录猜测删除目标', () => {
  const requests = manualRebuildRequests([7, '7', 9], identity)
  assert.deepEqual(requests.map(item => item.logid), [7, 9])
  assert.equal(requests.every(item => item.reorganize === false && item.transfer_type === 'link'), true)
})
