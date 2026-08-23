import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSchedule, loadSchedule } from '../src/schedule.js'

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
