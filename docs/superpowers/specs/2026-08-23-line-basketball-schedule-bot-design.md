# LINE 球隊賽程通知 Bot — 設計文件

日期:2026-08-23
狀態:已核准

## 目標

每週二 18:00 自動推播訊息到 IM籃子漢的 LINE 球隊群組,告知本週六的比賽資訊(時間、對手、背心顏色)或輪休狀態,涵蓋 2026/10/03 – 2027/03/20 整季 24 週。

## 範圍

**做:**
- 排程推播比賽通知與輪休通知
- 訊息中 mention 全體群組成員
- 輪休週附下一場比賽預告
- 處理 LINE 免費方案每月 200 則的額度限制

**不做:**
- 出席投票與統計(使用者用 LINE 內建投票功能自行處理)
- webhook 伺服器、資料庫、LIFF 網頁
- 其他 19 支隊伍的賽程
- 賽程異動的自動同步(改期時手動改 JSON)

## 架構

單一 Node.js 腳本,由 GitHub Actions cron 觸發,執行完即結束。無伺服器、無資料庫、無 webhook。

```
line-basketball-bot/
├── schedule.json                 整季 24 週賽程(僅 IM籃子漢 相關)
├── src/
│   ├── schedule.js               載入與驗證 schedule.json、查詢指定日期
│   ├── message.js                組裝訊息文字(純函式,無副作用)
│   ├── line.js                   呼叫 LINE Messaging API push
│   └── notify.js                 進入點:串接上述三者
├── test/
│   ├── schedule.test.js
│   └── message.test.js
├── .github/workflows/
│   ├── notify.yml
│   └── keepalive.yml
└── SETUP.md                      LINE 官方帳號一次性設定步驟
```

模組邊界:`message.js` 只負責「賽程物件 → 字串」,不知道 LINE 存在;`line.js` 只負責「字串 → HTTP 請求」,不知道籃球存在。兩者都可獨立測試,`notify.js` 是唯一需要 I/O 的地方。

### 執行流程

```
GitHub Actions 觸發(週二 10:00 UTC = 台北 18:00)
  → 計算本週六日期(今天 + 4 天)
  → schedule.json 查表
      ├─ 查無此日期(賽季外 / 春節)     → 不發送,正常結束
      ├─ skipNotify: true              → 不發送,正常結束
      ├─ bye: true                     → 組輪休訊息(有 alsoPreview 則附預告)
      └─ 一般比賽                       → 組比賽訊息
  → LINE push message 至群組
  → 非 2xx 則 exit 1(GitHub 寄信通知)
```

## 資料模型

`schedule.json` 為陣列,依日期排序,共 24 筆。

```json
{ "date": "2026-10-03", "time": "13:15", "opponent": "月見山沙威瑪", "vest": "淺" }
{ "date": "2026-11-14", "bye": true }
{ "date": "2026-12-26", "bye": true, "alsoPreview": "2027-01-02" }
{ "date": "2027-01-02", "time": "17:45", "opponent": "(A)Happy Brothers", "vest": "淺", "skipNotify": true }
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `date` | string | 比賽日 `YYYY-MM-DD`,必為週六 |
| `time` | string | 開賽時間 `HH:MM`,`bye` 時不存在 |
| `opponent` | string | 對手隊名,`bye` 時不存在 |
| `vest` | `"淺"` \| `"深"` | 我方背心顏色,`bye` 時不存在 |
| `bye` | boolean | 該週輪休 |
| `alsoPreview` | string | 在本則訊息附帶預告的另一個比賽日期 |
| `skipNotify` | boolean | 該週不發送通知(已由前一週預告) |

啟動時驗證:日期格式正確且為週六、無重複、已排序、非 `bye` 者必有 `time`/`opponent`/`vest`、`alsoPreview` 指向存在的日期。任一項不符即 exit 1。

賽程資料來源為一張低解析度賽程表圖片,已以裁切放大方式逐格辨識,並經使用者逐列核對確認(24 週 / 19 場比賽 / 5 次輪休)。

## 訊息格式

採純文字而非 Flex Message:LINE 推播通知列會完整顯示純文字內容,Flex Message 只顯示 altText。通知的目的是讓人不點開就知道資訊。

訊息開頭 mention 全體成員,確保靜音群組的成員也會收到提醒。

**比賽週:**
```
🏀 本週六比賽通知

📅 10/17（六）
⏰ 18:50
🆚 洗澡熊
👕 淺色背心
📍 三重商工

記得準時到場！
```

**輪休週:**
```
😴 本週六（11/14）輪休

這週沒有比賽，好好休息！
下一場：11/21（六）14:20 vs 山王
```

**輪休週且帶預告(僅 12/26 一次):**
```
😴 本週六（12/26）輪休

這週沒有比賽，好好休息！

⚠️ 提早預告：1/2（六）有比賽
⏰ 17:45　🆚 (A)Happy Brothers　👕 淺色背心
```

## 排程與時區

```yaml
on:
  schedule:
    - cron: '0 10 * * 2'
  workflow_dispatch:
    inputs:
      dry_run:
        type: boolean
        default: true
```

台灣無日光節約時間,固定 UTC+8,偏移量可寫死。GitHub Actions 的 cron 有排隊延遲,實際送達約落在 18:00–18:20,對此用途可接受。

`workflow_dispatch` 預設 `dry_run: true`,只印出訊息不實際發送,供手動測試。

## LINE API 額度管理

群組推播依「則數 × 群組人數」計費。群組 45 人,每次通知消耗 45 則;免費(輕用量)方案每月 200 則。

| 月份 | 通知次數 | 消耗 | 額度 |
|---|---|---|---|
| 2026/09 | 1 | 45 | ✅ |
| 2026/10 | 4 | 180 | ✅ |
| 2026/11 | 4 | 180 | ✅ |
| 2026/12 | 5 → 4 | 225 → 180 | ✅(經調整) |
| 2027/01 | 4 | 180 | ✅ |
| 2027/02 | 3 | 135 | ✅ |
| 2027/03 | 3 | 135 | ✅ |

2026 年 12 月有 5 個週二會超標 25 則。解法為資料驅動而非程式邏輯:12/26 那筆加 `alsoPreview: "2027-01-02"`,1/2 那筆加 `skipNotify: true`,使 12/29 不發送,該資訊併入 12/22 的訊息。

開發測試時不得對正式群組發送。使用 `dry_run`,或另建僅含開發者與 bot 的測試群組。

## 錯誤處理

| 情況 | 行為 |
|---|---|
| 本週六不在賽程表內 | 不發送,exit 0 |
| `skipNotify: true` | 不發送,exit 0 |
| 缺少環境變數 | exit 1,錯誤訊息指出缺少哪一個 |
| `schedule.json` 驗證失敗 | exit 1,指出是哪一筆哪一項 |
| LINE API 非 2xx | exit 1,輸出狀態碼與回應內容 |

不實作自動重試。每週僅一次通知,失敗時 GitHub 會寄信,手動觸發 `workflow_dispatch` 重發即可。

## 測試策略

使用 Node 內建 `node:test`,不引入測試框架。

- `schedule.js`:日期計算(週二 → 本週六)、查表命中與未命中、`skipNotify` 略過、驗證器對各種壞資料的偵測
- `message.js`:比賽訊息、輪休訊息、帶預告的輪休訊息、最後一場輪休時無下場可預告的情況
- `line.js`:以 mock 取代 fetch,驗證請求 body 結構與 mention 欄位;測試絕不真實發送

## 一次性設定(使用者手動)

詳細步驟寫入 `SETUP.md`:

1. LINE Developers Console 建立 Provider 與 Messaging API Channel
2. 取得 long-lived Channel Access Token
3. 關閉「自動回應訊息」、開啟「允許加入群組」
4. 將 bot 加入球隊群組
5. 取得 `groupId`:webhook URL 暫時指向 webhook.site,在群組發一則訊息,從收到的 JSON 讀 `source.groupId`,取得後即可移除 webhook 設定
6. 將 token 與 groupId 存入 GitHub repo Secrets:`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_GROUP_ID`

## 維運風險

**GitHub Actions 60 天停用**:repo 連續 60 天無 commit,排程 workflow 會被自動停用且不發通知。賽季橫跨 5 個半月,必然觸發。以 `keepalive.yml` 每 3 週自動 commit 一個時間戳檔案因應;因內建 `GITHUB_TOKEN` 產生的 commit 不保證被計為活躍,此 workflow 需使用 Personal Access Token。

**賽季結束**:2027/03/20 之後查表皆為未命中,腳本每週執行但不發送任何訊息,無害。不另做停用機制。

**賽程異動**:補賽或改期時直接修改 `schedule.json` 並推送,驗證器會在下次執行時檢查格式。
