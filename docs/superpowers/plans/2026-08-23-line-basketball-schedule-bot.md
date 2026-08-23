# LINE 球隊賽程通知 Bot 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每週二 18:00(台北)自動推播本週六的比賽資訊或輪休通知到 IM籃子漢的 LINE 球隊群組。

**Architecture:** 單一 Node.js 腳本,由 GitHub Actions cron 觸發,跑完即結束。賽程存成 repo 內的 JSON。三個純函式模組(查表 / 組訊息 / 呼叫 API)加一個進入點,無伺服器、無資料庫、無 webhook。

**Tech Stack:** Node.js 22(ESM)、內建 `node:test` 測試、內建 `fetch`、GitHub Actions、LINE Messaging API。

## Global Constraints

- **零外部相依套件**。不得 `npm install` 任何東西,測試用 `node:test`,HTTP 用內建 `fetch`。
- **ESM**。`package.json` 設 `"type": "module"`,一律用 `import`/`export`。
- **Node 22**。CI 用 `actions/setup-node@v4` 搭配 `node-version: '22'`。
- **時區一律 Asia/Taipei**。GitHub Actions 執行環境是 UTC,任何「今天是幾號」的判斷都必須經過時區轉換。
- **`schedule.json` 內容不得修改**。該檔已由使用者逐列核對確認(24 週 / 19 場比賽 / 5 次輪休),本計畫只讀取它。
- **測試絕不真實呼叫 LINE API**。群組 45 人,每發一則消耗 45 則免費額度。`line.js` 必須留下可注入的 fetch 參數。
- **訊息文案使用繁體中文與全形標點**(`（`、`）`、`！`、`：`、`，`)。文案字串在各 Task 中逐字給出,不得自行改寫。
- **每個 commit 訊息結尾加上:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GVbwsCaXpRrzAgxVxT46sZ
  ```
  為求簡潔,以下各 Task 的 commit 指令省略這兩行,實際執行時請補上。

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `schedule.json` | 整季 24 週賽程資料(已存在,唯讀) |
| `package.json` | ESM 宣告與 npm scripts |
| `src/schedule.js` | 載入與驗證賽程、計算目標比賽日、查表、查詢下一場 |
| `src/message.js` | 賽程資料 → 訊息字串。純函式,不知道 LINE 存在 |
| `src/line.js` | 訊息字串 → LINE API HTTP 請求。不知道籃球存在 |
| `src/notify.js` | 進入點。唯一做 I/O 與讀環境變數的地方 |
| `test/schedule.test.js` | `src/schedule.js` 的測試 |
| `test/message.test.js` | `src/message.js` 的測試 |
| `test/line.test.js` | `src/line.js` 的測試(注入假 fetch) |
| `.github/workflows/notify.yml` | 每週二 18:00 觸發通知 |
| `.github/workflows/keepalive.yml` | 每月 commit 一次,避免排程被 GitHub 停用 |
| `SETUP.md` | LINE 官方帳號與 GitHub Secrets 的一次性設定步驟 |

---

### Task 1: 專案骨架與賽程驗證器

**Files:**
- Create: `package.json`
- Create: `src/schedule.js`
- Create: `.gitignore`
- Test: `test/schedule.test.js`

**Interfaces:**
- Consumes: `schedule.json`(已存在於 repo 根目錄)
- Produces:
  - `validateSchedule(entries: object[]) => object[]` — 通過則原樣回傳,失敗則 `throw new Error(訊息)`
  - `loadSchedule(path: string) => object[]` — 讀檔、`JSON.parse`、`validateSchedule`

- [ ] **Step 1: 建立 `package.json`**

```json
{
  "name": "line-basketball-bot",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "notify": "node src/notify.js",
    "dry-run": "DRY_RUN=true node src/notify.js"
  }
}
```

- [ ] **Step 2: 建立 `.gitignore`**

```
node_modules/
.DS_Store
```

- [ ] **Step 3: 寫失敗的測試 `test/schedule.test.js`**

```js
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
```

- [ ] **Step 4: 執行測試,確認失敗**

Run: `npm test`
Expected: FAIL，錯誤為 `Cannot find module '../src/schedule.js'`

- [ ] **Step 5: 實作 `src/schedule.js`**

```js
import { readFileSync } from 'node:fs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const VESTS = new Set(['淺', '深'])

export function validateSchedule(entries) {
  if (!Array.isArray(entries)) throw new Error('賽程資料必須是陣列')

  const dates = new Set()
  let prev = ''

  for (const [i, e] of entries.entries()) {
    const at = `第 ${i + 1} 筆 (${e.date ?? '無日期'})`

    if (!DATE_RE.test(e.date ?? '')) throw new Error(`${at}:date 格式必須是 YYYY-MM-DD`)
    if (new Date(`${e.date}T00:00:00Z`).getUTCDay() !== 6) throw new Error(`${at}:date 必須是週六`)
    if (dates.has(e.date)) throw new Error(`${at}:日期重複`)
    if (e.date <= prev) throw new Error(`${at}:日期未依序排列`)
    dates.add(e.date)
    prev = e.date

    if (e.bye) {
      if (e.alsoPreview != null && !DATE_RE.test(e.alsoPreview)) {
        throw new Error(`${at}:alsoPreview 格式必須是 YYYY-MM-DD`)
      }
    } else {
      if (!TIME_RE.test(e.time ?? '')) throw new Error(`${at}:time 格式必須是 HH:MM`)
      if (!e.opponent) throw new Error(`${at}:缺少 opponent`)
      if (!VESTS.has(e.vest)) throw new Error(`${at}:vest 必須是「淺」或「深」`)
    }
  }

  for (const e of entries) {
    if (e.alsoPreview != null && !dates.has(e.alsoPreview)) {
      throw new Error(`${e.date}:alsoPreview 指向不存在的日期 ${e.alsoPreview}`)
    }
  }

  return entries
}

export function loadSchedule(path) {
  return validateSchedule(JSON.parse(readFileSync(path, 'utf8')))
}
```

- [ ] **Step 6: 執行測試,確認通過**

Run: `cd /Users/apple/line-basketball-bot && npm test`
Expected: PASS，14 個測試全綠

- [ ] **Step 7: Commit**

```bash
cd /Users/apple/line-basketball-bot
git add package.json .gitignore src/schedule.js test/schedule.test.js
git commit -m "feat: 賽程資料驗證器與專案骨架"
```

---

### Task 2: 目標比賽日計算與查表

**Files:**
- Modify: `src/schedule.js`(在檔案末端追加三個匯出函式)
- Modify: `test/schedule.test.js`(在檔案末端追加測試)

**Interfaces:**
- Consumes: Task 1 的 `validateSchedule`、`loadSchedule`
- Produces:
  - `getTargetSaturday(now: Date) => string` — 回傳台北時區當下起算最近的週六(當天是週六則為當天),格式 `YYYY-MM-DD`
  - `findEntry(entries: object[], date: string) => object | null`
  - `findNextGame(entries: object[], afterDate: string) => object | null` — 回傳 `date > afterDate` 且非 `bye` 的第一筆

- [ ] **Step 1: 擴充 `test/schedule.test.js`**

先把檔案頂端既有的 import 改成:

```js
import {
  validateSchedule,
  loadSchedule,
  getTargetSaturday,
  findEntry,
  findNextGame,
} from '../src/schedule.js'
```

再在檔案末端追加測試:

```js
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
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `cd /Users/apple/line-basketball-bot && npm test`
Expected: FAIL，錯誤為 `The requested module '../src/schedule.js' does not provide an export named 'getTargetSaturday'`

- [ ] **Step 3: 在 `src/schedule.js` 末端追加實作**

```js
export function getTargetSaturday(now) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7))
  return d.toISOString().slice(0, 10)
}

export function findEntry(entries, date) {
  return entries.find((e) => e.date === date) ?? null
}

export function findNextGame(entries, afterDate) {
  return entries.find((e) => e.date > afterDate && !e.bye) ?? null
}
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `cd /Users/apple/line-basketball-bot && npm test`
Expected: PASS，24 個測試全綠

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/line-basketball-bot
git add src/schedule.js test/schedule.test.js
git commit -m "feat: 目標比賽日計算與賽程查表"
```

---

### Task 3: 訊息組裝

**Files:**
- Create: `src/message.js`
- Test: `test/message.test.js`

**Interfaces:**
- Consumes: Task 2 的 `findNextGame` 回傳值(由 `notify.js` 傳入,本模組不自行查表)
- Produces:
  - `buildMessage(entry: object, nextEntry: object | null) => string` — 回傳不含 `@all` 的訊息本文。mention 由 `line.js` 負責。

三種輸出形態:比賽週、輪休週、輪休週帶預告。判斷規則:

1. `entry.bye` 為假 → 比賽訊息(忽略 `nextEntry`)
2. `entry.bye` 且 `entry.alsoPreview` 存在且 `nextEntry` 非 null → 輪休訊息 + 預告區塊
3. `entry.bye` 且 `nextEntry` 非 null → 輪休訊息 + 單行「下一場」
4. `entry.bye` 且 `nextEntry` 為 null → 只有輪休訊息

- [ ] **Step 1: 寫失敗的測試 `test/message.test.js`**

```js
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
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `cd /Users/apple/line-basketball-bot && npm test`
Expected: FAIL，錯誤為 `Cannot find module '../src/message.js'`

- [ ] **Step 3: 實作 `src/message.js`**

```js
const VEST_LABEL = { 淺: '淺色背心', 深: '深色背心' }

function monthDay(date) {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function buildMessage(entry, nextEntry) {
  if (!entry.bye) {
    return [
      '🏀 本週六比賽通知',
      '',
      `📅 ${monthDay(entry.date)}（六）`,
      `⏰ ${entry.time}`,
      `🆚 ${entry.opponent}`,
      `👕 ${VEST_LABEL[entry.vest]}`,
      '📍 三重商工',
      '',
      '記得準時到場！',
    ].join('\n')
  }

  const lines = [`😴 本週六（${monthDay(entry.date)}）輪休`, '', '這週沒有比賽，好好休息！']

  if (!nextEntry) return lines.join('\n')

  if (entry.alsoPreview) {
    lines.push(
      '',
      `⚠️ 提早預告：${monthDay(nextEntry.date)}（六）有比賽`,
      `⏰ ${nextEntry.time}　🆚 ${nextEntry.opponent}　👕 ${VEST_LABEL[nextEntry.vest]}`,
    )
  } else {
    lines.push(`下一場：${monthDay(nextEntry.date)}（六）${nextEntry.time} vs ${nextEntry.opponent}`)
  }

  return lines.join('\n')
}
```

注意:預告區塊那行用的是**全形空格** `　`(U+3000)分隔三個欄位,不是半形空格。

- [ ] **Step 4: 執行測試,確認通過**

Run: `cd /Users/apple/line-basketball-bot && npm test`
Expected: PASS，31 個測試全綠

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/line-basketball-bot
git add src/message.js test/message.test.js
git commit -m "feat: 比賽與輪休訊息組裝"
```

---

### Task 4: LINE API 客戶端

**Files:**
- Create: `src/line.js`
- Test: `test/line.test.js`

**Interfaces:**
- Consumes: Task 3 `buildMessage` 的回傳字串
- Produces:
  - `pushMessage({ token, groupId, text }, fetchImpl = fetch) => Promise<void>` — 成功則 resolve,非 2xx 則 `throw new Error`。第二個參數是測試用的注入點,正式呼叫時省略。

訊息本文前面會加上 `@all\n`,並在 `mention.mentionees` 放 `{ index: 0, length: 4, type: 'all' }` 以 mention 全體成員。此功能僅在群組與多人聊天室有效。

- [ ] **Step 1: 寫失敗的測試 `test/line.test.js`**

```js
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

test('訊息本文前面加上 @all', async () => {
  const fetchImpl = fakeFetch(ok)
  await pushMessage({ token: 'T', groupId: 'C', text: '測試訊息' }, fetchImpl)

  const body = JSON.parse(fetchImpl.calls[0].options.body)
  assert.equal(body.messages[0].text, '@all\n測試訊息')
})

test('mentionees 指向 @all 的位置', async () => {
  const fetchImpl = fakeFetch(ok)
  await pushMessage({ token: 'T', groupId: 'C', text: '測試訊息' }, fetchImpl)

  const body = JSON.parse(fetchImpl.calls[0].options.body)
  assert.deepEqual(body.messages[0].mention, {
    mentionees: [{ index: 0, length: 4, type: 'all' }],
  })
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
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `cd /Users/apple/line-basketball-bot && npm test`
Expected: FAIL，錯誤為 `Cannot find module '../src/line.js'`

- [ ] **Step 3: 實作 `src/line.js`**

```js
const ENDPOINT = 'https://api.line.me/v2/bot/message/push'
const MENTION = '@all'

export async function pushMessage({ token, groupId, text }, fetchImpl = fetch) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: groupId,
      messages: [
        {
          type: 'text',
          text: `${MENTION}\n${text}`,
          mention: { mentionees: [{ index: 0, length: MENTION.length, type: 'all' }] },
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`LINE API 回應 ${res.status}: ${await res.text()}`)
  }
}
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `cd /Users/apple/line-basketball-bot && npm test`
Expected: PASS，35 個測試全綠

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/line-basketball-bot
git add src/line.js test/line.test.js
git commit -m "feat: LINE Messaging API 推播客戶端"
```

---

### Task 5: 進入點

**Files:**
- Create: `src/notify.js`

**Interfaces:**
- Consumes: `loadSchedule`、`getTargetSaturday`、`findEntry`、`findNextGame`(Task 1–2)、`buildMessage`(Task 3)、`pushMessage`(Task 4)
- Produces: 可執行腳本。環境變數 `LINE_CHANNEL_ACCESS_TOKEN`、`LINE_GROUP_ID`、`DRY_RUN`。

退出行為:

| 情況 | 輸出 | 退出碼 |
|---|---|---|
| 目標日不在賽程表內 | `2027-02-06 不在賽程表內，不發送。` | 0 |
| `skipNotify: true` | `2027-01-02 標記為 skipNotify（已於前一週預告），不發送。` | 0 |
| `DRY_RUN=true` | 印出訊息全文,不發送 | 0 |
| `schedule.json` 驗證失敗 | `schedule.json 驗證失敗：<原因>` | 1 |
| 缺少環境變數 | `錯誤：缺少環境變數 LINE_GROUP_ID` | 1 |
| LINE API 失敗 | `LINE API 回應 429: ...` | 1 |
| 成功 | `已發送 2026-10-17 的通知。` | 0 |

- [ ] **Step 1: 實作 `src/notify.js`**

```js
import { loadSchedule, getTargetSaturday, findEntry, findNextGame } from './schedule.js'
import { buildMessage } from './message.js'
import { pushMessage } from './line.js'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`錯誤：缺少環境變數 ${name}`)
    process.exit(1)
  }
  return value
}

let entries
try {
  entries = loadSchedule(new URL('../schedule.json', import.meta.url))
} catch (err) {
  console.error(`schedule.json 驗證失敗：${err.message}`)
  process.exit(1)
}

const target = getTargetSaturday(new Date())
const entry = findEntry(entries, target)

if (!entry) {
  console.log(`${target} 不在賽程表內，不發送。`)
  process.exit(0)
}

if (entry.skipNotify) {
  console.log(`${target} 標記為 skipNotify（已於前一週預告），不發送。`)
  process.exit(0)
}

const text = buildMessage(entry, findNextGame(entries, target))

if (process.env.DRY_RUN === 'true') {
  console.log(`--- DRY RUN：以下訊息不會發送（目標日 ${target}）---`)
  console.log(text)
  process.exit(0)
}

const token = requireEnv('LINE_CHANNEL_ACCESS_TOKEN')
const groupId = requireEnv('LINE_GROUP_ID')

try {
  await pushMessage({ token, groupId, text })
  console.log(`已發送 ${target} 的通知。`)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
```

- [ ] **Step 2: 手動驗證 dry run 可執行**

Run: `cd /Users/apple/line-basketball-bot && npm run dry-run`
Expected: 依當下日期而定。今天是 2026-08-23,目標日會是 2026-08-29,不在賽程表內,所以應輸出:
```
2026-08-29 不在賽程表內，不發送。
```
退出碼 0(用 `echo $?` 確認)。

- [ ] **Step 3: 手動驗證比賽訊息的實際輸出**

用 Node 直接跑一次組裝,確認 2026-10-17 那週的訊息長相正確:

Run:
```bash
cd /Users/apple/line-basketball-bot && node --input-type=module -e "
import { loadSchedule, findEntry, findNextGame } from './src/schedule.js'
import { buildMessage } from './src/message.js'
const entries = loadSchedule('./schedule.json')
for (const d of ['2026-10-17', '2026-11-14', '2026-12-26']) {
  console.log('=== ' + d + ' ===')
  console.log(buildMessage(findEntry(entries, d), findNextGame(entries, d)))
  console.log()
}
"
```

Expected: 依序印出三則訊息 —— 10/17 的比賽訊息(18:50 vs 洗澡熊,淺色背心)、11/14 的輪休訊息(下一場 11/21 14:20 vs 山王)、12/26 的輪休訊息(帶 1/2 的預告區塊)。逐字比對與 Task 3 測試中的期望值一致。

- [ ] **Step 4: 確認全部測試仍通過**

Run: `cd /Users/apple/line-basketball-bot && npm test`
Expected: PASS，35 個測試全綠

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/line-basketball-bot
git add src/notify.js
git commit -m "feat: 通知腳本進入點"
```

---

### Task 6: GitHub Actions 工作流程

**Files:**
- Create: `.github/workflows/notify.yml`
- Create: `.github/workflows/keepalive.yml`

**Interfaces:**
- Consumes: `src/notify.js`(Task 5)、`npm test`(Task 1 定義的 script)
- Produces: 無程式介面。需要的 GitHub Secrets:`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_GROUP_ID`、`KEEPALIVE_TOKEN`。

- [ ] **Step 1: 建立 `.github/workflows/notify.yml`**

```yaml
name: 賽程通知

on:
  schedule:
    # UTC 週二 10:00 = 台北週二 18:00。台灣無日光節約時間，偏移固定。
    - cron: '0 10 * * 2'
  workflow_dispatch:
    inputs:
      dry_run:
        description: '只印出訊息，不實際發送'
        type: boolean
        default: true

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: 執行測試
        run: npm test

      - name: 發送通知
        run: node src/notify.js
        env:
          LINE_CHANNEL_ACCESS_TOKEN: ${{ secrets.LINE_CHANNEL_ACCESS_TOKEN }}
          LINE_GROUP_ID: ${{ secrets.LINE_GROUP_ID }}
          DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run || 'false' }}
```

`DRY_RUN` 那行的邏輯:排程觸發時 `github.event_name` 不是 `workflow_dispatch`,整個 `&&` 為 false,落到 `|| 'false'`,所以會真的發送。手動觸發且勾選 dry run 時為 `true`。手動觸發但不勾選時 `&&` 為 false,同樣落到 `'false'`。

- [ ] **Step 2: 建立 `.github/workflows/keepalive.yml`**

```yaml
name: keepalive

# GitHub 會停用「repo 連續 60 天無 commit」的排程 workflow，且不發通知。
# 賽季橫跨 5 個半月，必然觸發，故每月自動 commit 一次時間戳。
# 需使用 PAT：內建 GITHUB_TOKEN 產生的 commit 不保證被計為 repo 活躍。

on:
  schedule:
    - cron: '0 3 1 * *'
  workflow_dispatch:

jobs:
  keepalive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.KEEPALIVE_TOKEN }}

      - name: 更新時間戳並推送
        run: |
          date -u +"%Y-%m-%dT%H:%M:%SZ" > .keepalive
          git config user.name "keepalive-bot"
          git config user.email "keepalive@users.noreply.github.com"
          git add .keepalive
          git commit -m "chore: keepalive $(date -u +%Y-%m-%d)"
          git push
```

- [ ] **Step 3: 驗證兩份 YAML 語法正確**

專案本身不得有相依套件,但這是一次性的開發期檢查,用完即丟的 venv 不算專案相依。(macOS 系統的 python3 沒有內建 PyYAML,所以不能直接 `python3 -c "import yaml"`。)

Run:
```bash
cd /Users/apple/line-basketball-bot \
  && python3 -m venv /tmp/yamlcheck \
  && /tmp/yamlcheck/bin/pip -q install PyYAML \
  && /tmp/yamlcheck/bin/python -c "
import yaml
for f in ['.github/workflows/notify.yml', '.github/workflows/keepalive.yml']:
    d = yaml.safe_load(open(f))
    print(f, '->', sorted(str(k) for k in d))
" \
  && rm -rf /tmp/yamlcheck
```

Expected:
```
.github/workflows/notify.yml -> ['True', 'jobs', 'name']
.github/workflows/keepalive.yml -> ['True', 'jobs']
```

`on` 被解析成 `True` 是 YAML 1.1 的已知行為(`on`/`off`/`yes`/`no` 會變成布林),GitHub Actions 自己的解析器不受影響,看到 `True` 是正常的。

**權威驗證仍在 GitHub 上**:推送之後到 repo 的 **Actions** 分頁,左側清單應該同時出現「賽程通知」與「keepalive」兩項。YAML 語法錯誤的 workflow **根本不會出現在清單裡**,所以清單是否完整就是最可靠的檢查。

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/line-basketball-bot
git add .github/workflows/notify.yml .github/workflows/keepalive.yml
git commit -m "ci: 每週二排程通知與 keepalive 工作流程"
```

---

### Task 7: 設定文件

**Files:**
- Create: `SETUP.md`
- Create: `README.md`

**Interfaces:**
- Consumes: Task 6 定義的三個 Secret 名稱
- Produces: 無程式介面。

- [ ] **Step 1: 建立 `SETUP.md`**

```markdown
# 一次性設定

這份文件的步驟只需要做一次。做完之後 bot 會自己每週二 18:00 發通知,不需要再管它。

## 1. 建立 LINE 官方帳號與 Messaging API Channel

1. 到 [LINE Developers Console](https://developers.line.biz/console/) 用你的 LINE 帳號登入
2. 建立一個 **Provider**(名稱隨意,例如「IM籃子漢」)
3. 在該 Provider 底下建立 **Messaging API Channel**
4. 建立完成後會同時產生一個 LINE 官方帳號

## 2. 取得 Channel Access Token

1. 進入剛建立的 Channel → **Messaging API** 分頁
2. 捲到最下方 **Channel access token (long-lived)**
3. 按 **Issue**,複製產生的字串

這串就是 `LINE_CHANNEL_ACCESS_TOKEN`。**它等同密碼,不要貼到任何公開的地方。**

## 3. 調整 Channel 設定

在同一個 **Messaging API** 分頁:

- **Auto-reply messages**:關閉(否則群組每次有人講話 bot 都會亂回)
- **Greeting messages**:關閉
- **Allow bot to join group chats**:**開啟**(不開的話 bot 無法加入群組)

## 4. 把 bot 加進球隊群組

1. 在 **Messaging API** 分頁找到 QR code
2. 用手機掃描加入好友
3. 在 LINE 中把這個官方帳號**邀請進球隊群組**

## 5. 取得群組 ID

群組 ID 沒辦法從介面上直接看到,要臨時架一個 webhook 來接。

1. 打開 [webhook.site](https://webhook.site/),它會給你一個專屬網址(形如 `https://webhook.site/xxxxxxxx-xxxx-...`),複製它
2. 回到 LINE Developers Console → **Messaging API** 分頁 → **Webhook settings**
3. 把網址貼進 **Webhook URL**,按 **Update**,並把 **Use webhook** 打開
4. 在球隊群組隨便發一則訊息
5. 回到 webhook.site,會看到一筆新進來的請求。展開它的 JSON,找到:
   ```json
   { "events": [ { "source": { "type": "group", "groupId": "Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" } } ] }
   ```
6. 複製 `groupId` 的值(以大寫 `C` 開頭),這就是 `LINE_GROUP_ID`
7. **把 Use webhook 關掉**。之後都不需要 webhook 了。

## 6. 產生 keepalive 用的 Personal Access Token

GitHub 會把「連續 60 天沒有 commit」的 repo 的排程 workflow 自動停用,而且不會通知你。賽季有五個半月,一定會踩到,所以需要一個每月自動 commit 的 workflow,而它需要一組 PAT。

1. 到 GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
2. **Generate new token**
3. **Repository access** 選 **Only select repositories**,勾選這個 repo
4. **Repository permissions** → **Contents** 設為 **Read and write**
5. **Expiration** 設定到 2027 年 4 月之後(要涵蓋整個賽季)
6. 產生後複製,這就是 `KEEPALIVE_TOKEN`

## 7. 把三組 Secret 存進 GitHub

到這個 repo 的 **Settings** → **Secrets and variables** → **Actions** → **New repository secret**,依序建立:

| Name | Value |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | 步驟 2 拿到的 token |
| `LINE_GROUP_ID` | 步驟 5 拿到的 groupId |
| `KEEPALIVE_TOKEN` | 步驟 6 拿到的 PAT |

## 8. 測試

1. repo 的 **Actions** 分頁 → 左側選 **賽程通知** → **Run workflow**
2. **保持 `dry_run` 勾選**,按 **Run workflow**
3. 執行完成後點進去看 log,確認訊息內容正確,而且**沒有真的發出去**

確認無誤後,如果你想試一次真實發送,可以把 `dry_run` 取消勾選再跑一次。但請注意額度(見下)。

## ⚠️ 訊息額度

LINE 群組推播是按「則數 × 群組人數」計費。群組 45 人,每發一次消耗 **45 則**。免費(輕用量)方案每月 **200 則**,也就是每月最多發 4 次。

整季已規劃在額度內,唯一的例外是 2026 年 12 月有 5 個週二,已用 `schedule.json` 裡的 `alsoPreview` / `skipNotify` 兩個欄位處理掉(12/22 那則會順便預告 1/2 的比賽,12/29 就不發了)。

**所以測試時請務必用 `dry_run`,不要對正式群組亂發。** 每一次誤發都吃掉 45 則。

## 賽程有異動怎麼辦

直接編輯 `schedule.json` 對應的那一筆,commit 推上去就好。格式驗證會在下次執行時自動檢查,格式錯誤會讓 workflow 失敗並寄信給你。
```

- [ ] **Step 2: 建立 `README.md`**

```markdown
# IM籃子漢 LINE 賽程通知 Bot

每週二 18:00(台北)自動推播本週六的比賽資訊到球隊 LINE 群組。

- 賽季:2026/10/03 – 2027/03/20,共 24 週(19 場比賽、5 次輪休,2/6 春節停賽)
- 資料來源:`schedule.json`(已逐列人工核對)
- 執行環境:GitHub Actions,無伺服器

## 設定

第一次使用請看 [SETUP.md](SETUP.md)。

## 本機開發

```bash
npm test        # 跑測試（不會呼叫 LINE API）
npm run dry-run # 印出「本週」該發的訊息，不實際發送
```

無任何外部相依套件,需要 Node 22 以上。

## 修改賽程

編輯 `schedule.json` 後 commit 推送即可。欄位說明見 [設計文件](docs/superpowers/specs/2026-08-23-line-basketball-schedule-bot-design.md)。
```

- [ ] **Step 3: 確認全部測試仍通過**

Run: `cd /Users/apple/line-basketball-bot && npm test`
Expected: PASS，35 個測試全綠

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/line-basketball-bot
git add SETUP.md README.md
git commit -m "docs: 一次性設定步驟與專案說明"
```

---

## 完成後使用者需要做的事

程式碼完成後,以下步驟必須由使用者本人操作,無法代勞:

1. 在 GitHub 建立 repo 並推送
2. 照 `SETUP.md` 走完 LINE Developers Console 的設定
3. 取得 groupId 並存入 Secrets
4. 產生 keepalive PAT 並存入 Secrets
5. 用 `dry_run` 跑一次驗證

第一次真實通知會在 **2026-09-29(週二)** 發出,內容是 10/03 的第一場比賽(13:15 vs 月見山沙威瑪,淺色背心)。
