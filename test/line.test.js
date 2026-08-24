import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pushMessage } from '../src/line.js'

function fakeFetch(response) {
  const calls = []
  const fn = async (url, options) => {
    calls.push({ url, options })
    return response
  }
  fn.calls = calls
  return fn
}

const ok = { ok: true, status: 200, text: async () => '{}' }

test('送出正確的 endpoint、標頭與 body', async () => {
  const fetchImpl = fakeFetch(ok)
  await pushMessage({ token: 'TOKEN', groupId: 'Cabc123', text: '測試訊息' }, fetchImpl)

  assert.equal(fetchImpl.calls.length, 1)
  const { url, options } = fetchImpl.calls[0]
  assert.equal(url, 'https://api.line.me/v2/bot/message/push')
  assert.equal(options.method, 'POST')
  assert.equal(options.headers.Authorization, 'Bearer TOKEN')
  assert.equal(options.headers['Content-Type'], 'application/json')

  const body = JSON.parse(options.body)
  assert.equal(body.to, 'Cabc123')
  assert.equal(body.messages.length, 1)
  assert.equal(body.messages[0].type, 'text')
})

test('訊息原樣送出，不加任何前綴', async () => {
  const fetchImpl = fakeFetch(ok)
  await pushMessage({ token: 'T', groupId: 'C', text: '測試訊息' }, fetchImpl)

  const body = JSON.parse(fetchImpl.calls[0].options.body)
  assert.equal(body.messages[0].text, '測試訊息')
})

test('不帶 mention 欄位', async () => {
  // LINE 的 mention 全體僅限已驗證／付費官方帳號，未驗證帳號送出後
  // mentionees 會被忽略，@all 只會變成一串普通文字。
  const fetchImpl = fakeFetch(ok)
  await pushMessage({ token: 'T', groupId: 'C', text: '測試訊息' }, fetchImpl)

  const body = JSON.parse(fetchImpl.calls[0].options.body)
  assert.equal(body.messages[0].mention, undefined)
  assert.deepEqual(Object.keys(body.messages[0]).sort(), ['text', 'type'])
})

test('非 2xx 時拋出含狀態碼與回應內容的錯誤', async () => {
  const fetchImpl = fakeFetch({
    ok: false,
    status: 429,
    text: async () => '{"message":"You have reached your monthly limit."}',
  })

  await assert.rejects(
    () => pushMessage({ token: 'T', groupId: 'C', text: 'x' }, fetchImpl),
    /LINE API 回應 429.*monthly limit/s,
  )
})
