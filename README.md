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
