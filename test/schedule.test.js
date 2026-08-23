import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateSchedule,
  loadSchedule,
  getTargetSaturday,
  findEntry,
  findNextGame,
} from '../src/schedule.js'

const game = { date: '2026-10-03', time: '13:15', opponent: '月見山沙威瑪', vest: '淺' }
const bye = { date: '2026-11-14', bye: true }

test('合法資料通過驗證並原樣回傳', () => {
  const input = [game, bye]
  assert.equal(validateSchedule(input), input)
})

test('拒絕非陣列', () => {
  assert.throws(() => validateSchedule({}), /必須是陣列/)
})

test('拒絕錯誤的日期格式', () => {
  assert.throws(() => validateSchedule([{ ...game, date: '2026/10/03' }]), /YYYY-MM-DD/)
})

test('拒絕非週六的日期', () => {
  assert.throws(() => validateSchedule([{ ...game, date: '2026-10-04' }]), /必須是週六/)
})

test('拒絕重複的日期', () => {
  assert.throws(() => validateSchedule([game, game]), /日期重複/)
})

test('拒絕未排序的日期', () => {
  assert.throws(() => validateSchedule([{ ...game, date: '2026-10-10' }, game]), /未依序排列/)
})

test('比賽場次缺少 time 時拒絕', () => {
  const { time, ...rest } = game
  assert.throws(() => validateSchedule([rest]), /time 格式/)
})

test('比賽場次缺少 opponent 時拒絕', () => {
  const { opponent, ...rest } = game
  assert.throws(() => validateSchedule([rest]), /缺少 opponent/)
})

test('vest 只接受「淺」或「深」', () => {
  assert.throws(() => validateSchedule([{ ...game, vest: '白' }]), /淺.*深/)
})

test('輪休場次不需要 time、opponent、vest', () => {
  assert.doesNotThrow(() => validateSchedule([bye]))
})

test('alsoPreview 指向不存在的日期時拒絕', () => {
  assert.throws(
    () => validateSchedule([{ ...bye, alsoPreview: '2027-01-02' }]),
    /alsoPreview 指向不存在的日期/,
  )
})

test('alsoPreview 指向表內日期時通過', () => {
  assert.doesNotThrow(() =>
    validateSchedule([
      { date: '2026-12-26', bye: true, alsoPreview: '2027-01-02' },
      { date: '2027-01-02', time: '17:45', opponent: '(A)Happy Brothers', vest: '淺', skipNotify: true },
    ]),
  )
})

test('錯誤訊息指出是第幾筆與哪個日期', () => {
  assert.throws(() => validateSchedule([game, { ...game, date: '2026-10-11' }]), /第 2 筆 \(2026-10-11\)/)
})

test('實際的 schedule.json 通過驗證,且為 24 筆、19 場比賽、5 次輪休', () => {
  const entries = loadSchedule(new URL('../schedule.json', import.meta.url))
  assert.equal(entries.length, 24)
  assert.equal(entries.filter((e) => !e.bye).length, 19)
  assert.equal(entries.filter((e) => e.bye).length, 5)
})

test('週二執行時目標是 4 天後的週六', () => {
  // 2026-10-13 是週二。台北 18:00 = UTC 10:00
  assert.equal(getTargetSaturday(new Date('2026-10-13T10:00:00Z')), '2026-10-17')
})

test('週六當天執行時目標是當天', () => {
  assert.equal(getTargetSaturday(new Date('2026-10-17T02:00:00Z')), '2026-10-17')
})

test('週日執行時目標是 6 天後的週六', () => {
  assert.equal(getTargetSaturday(new Date('2026-10-18T02:00:00Z')), '2026-10-24')
})

test('UTC 與台北跨日時以台北日期為準', () => {
  // UTC 2026-10-16T17:00 = 台北 2026-10-17T01:00(週六)，目標應為當天
  assert.equal(getTargetSaturday(new Date('2026-10-16T17:00:00Z')), '2026-10-17')
})

test('UTC 週六傍晚但台北已是週日時，目標是下一個週六', () => {
  // UTC 2026-10-17T17:00（週六）= 台北 2026-10-18T01:00（週日），目標應為 10/24。
  // 忽略時區的實作會回傳 2026-10-17，差七天。
  assert.equal(getTargetSaturday(new Date('2026-10-17T17:00:00Z')), '2026-10-24')
})

test('findEntry 命中時回傳該筆', () => {
  const entries = [game, bye]
  assert.equal(findEntry(entries, '2026-11-14'), bye)
})

test('findEntry 未命中時回傳 null', () => {
  assert.equal(findEntry([game], '2027-02-06'), null)
})

test('findNextGame 跳過輪休場次', () => {
  const next = { date: '2026-11-21', time: '14:20', opponent: '山王', vest: '深' }
  assert.equal(findNextGame([game, bye, next], '2026-11-14'), next)
})

test('findNextGame 不回傳當天自己', () => {
  assert.equal(findNextGame([game], '2026-10-03'), null)
})

test('findNextGame 沒有下一場時回傳 null', () => {
  assert.equal(findNextGame([game, bye], '2026-11-14'), null)
})

test('12/26 輪休的下一場是 1/2', () => {
  const entries = loadSchedule(new URL('../schedule.json', import.meta.url))
  const next = findNextGame(entries, '2026-12-26')
  assert.equal(next.date, '2027-01-02')
  assert.equal(next.opponent, '(A)Happy Brothers')
})

test('12/26 帶有指向 1/2 的 alsoPreview', () => {
  const entries = loadSchedule(new URL('../schedule.json', import.meta.url))
  assert.equal(findEntry(entries, '2026-12-26').alsoPreview, '2027-01-02')
})

test('1/2 標記 skipNotify，使 12 月維持 4 次發送', () => {
  const entries = loadSchedule(new URL('../schedule.json', import.meta.url))
  assert.equal(findEntry(entries, '2027-01-02').skipNotify, true)
})

test('每個 alsoPreview 都指向該筆之後的下一場比賽', () => {
  const entries = loadSchedule(new URL('../schedule.json', import.meta.url))
  const withPreview = entries.filter((e) => e.alsoPreview)
  assert.ok(withPreview.length > 0)
  for (const e of withPreview) {
    assert.equal(findNextGame(entries, e.date).date, e.alsoPreview)
  }
})
