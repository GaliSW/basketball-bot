import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMessage } from '../src/message.js'

test('比賽訊息', () => {
  const entry = { date: '2026-10-17', time: '18:50', opponent: '洗澡熊', vest: '淺' }
  assert.equal(
    buildMessage(entry, null),
    [
      '🏀 本週六比賽通知',
      '',
      '📅 10/17（六）',
      '⏰ 18:50',
      '🆚 洗澡熊',
      '👕 淺色背心',
      '📍 三重商工',
      '',
      '記得準時到場！',
    ].join('\n'),
  )
})

test('比賽訊息的深色背心', () => {
  const entry = { date: '2026-10-31', time: '12:05', opponent: 'H&D', vest: '深' }
  assert.match(buildMessage(entry, null), /👕 深色背心/)
})

test('比賽訊息忽略 nextEntry', () => {
  const entry = { date: '2026-10-17', time: '18:50', opponent: '洗澡熊', vest: '淺' }
  const next = { date: '2026-10-24', time: '13:15', opponent: '貳樓刺青', vest: '深' }
  assert.equal(buildMessage(entry, next), buildMessage(entry, null))
})

test('輪休訊息附下一場', () => {
  const entry = { date: '2026-11-14', bye: true }
  const next = { date: '2026-11-21', time: '14:20', opponent: '山王', vest: '深' }
  assert.equal(
    buildMessage(entry, next),
    [
      '😴 本週六（11/14）輪休',
      '',
      '這週沒有比賽，好好休息！',
      '下一場：11/21（六）14:20 vs 山王',
    ].join('\n'),
  )
})

test('輪休訊息帶預告區塊', () => {
  const entry = { date: '2026-12-26', bye: true, alsoPreview: '2027-01-02' }
  const next = { date: '2027-01-02', time: '17:45', opponent: '(A)Happy Brothers', vest: '淺' }
  assert.equal(
    buildMessage(entry, next),
    [
      '😴 本週六（12/26）輪休',
      '',
      '這週沒有比賽，好好休息！',
      '',
      '⚠️ 提早預告：1/2（六）有比賽',
      '⏰ 17:45　🆚 (A)Happy Brothers　👕 淺色背心',
    ].join('\n'),
  )
})

test('沒有下一場時省略該行', () => {
  const entry = { date: '2027-03-20', bye: true }
  assert.equal(
    buildMessage(entry, null),
    ['😴 本週六（3/20）輪休', '', '這週沒有比賽，好好休息！'].join('\n'),
  )
})

test('日期不補前導零', () => {
  const entry = { date: '2027-01-02', time: '17:45', opponent: 'X', vest: '淺' }
  assert.match(buildMessage(entry, null), /📅 1\/2（六）/)
})
