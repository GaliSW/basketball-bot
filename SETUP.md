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

## 6. 把兩組 Secret 存進 GitHub

到這個 repo 的 **Settings** → **Secrets and variables** → **Actions** → **New repository secret**,依序建立:

| Name | Value |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | 步驟 2 拿到的 token |
| `LINE_GROUP_ID` | 步驟 5 拿到的 groupId(正式球隊群組,不是測試群組) |

keepalive workflow 用 GitHub 內建的 token 推送,不需要你提供任何東西。

## 7. 測試

在 2026/9/29 之前,排程與試跑都不會印出任何訊息,因為算出來的週六還不在賽季內 —— 你只會看到 `不在賽程表內,不發送。` 這一行,完全看不到訊息內容,token、groupId 這條路徑也完全不會被執行到。所以光靠 `dry_run` 沒辦法驗證設定是否正確,需要另外用一個測試群組來驗證。

1. 在 LINE 建立一個**只有你自己與這個 bot 的測試群組**(2 人),把 bot 加進去。這樣一次發送只消耗 2 則額度,不是 45 則。(設計文件本來就建議用測試群組來驗證。)
2. 用下面的 curl 指令直接呼叫 LINE API,驗證 token 與群組 ID 是否正常運作。**記得把 `你的_CHANNEL_ACCESS_TOKEN` 換成你自己的 token,`你的測試群組_GROUP_ID` 換成上面那個測試群組的 ID(不是正式球隊群組的 ID!)**:

```bash
curl -X POST https://api.line.me/v2/bot/message/push \
  -H "Authorization: Bearer 你的_CHANNEL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "你的測試群組_GROUP_ID",
    "messages": [{
      "type": "text",
      "text": "✅ 測試訊息，設定成功。"
    }]
  }'
```

   成功的話會回傳 `{}` 與 HTTP 200,而且測試群組裡會出現這則訊息,標記到所有人。

3. 驗證成功後,正式球隊群組(45 人)的 group ID 才是要存進 `LINE_GROUP_ID` Secret 的值。**千萬不要拿正式群組的 ID 去跑上面這個 curl**,一發就是 45 則。
4. 到 repo 的 **Actions** 分頁 → 左側選 **賽程通知** → **Run workflow**,**保持 `dry_run` 勾選**,按 **Run workflow**。這一步是用來**確認 workflow 本身跑得起來**(能 checkout、跑測試、順利結束),而不是確認訊息內容正確 —— 訊息內容已經在上面用 curl 驗證過了。

## 7b. 端到端實測(選用,會真的發訊息)

`dry_run` 只證明流程跑得起來,不證明 GitHub Secrets 裡的 token 和 group ID 是對的 —— 那條路要到第一次真實發送才會被走到。想提前驗證,用 `target_date` 指定一場比賽:

Actions → **賽程通知** → **Run workflow**:

- **取消** `dry_run` 勾選
- `target_date` 填 `2026-10-03`(或任何賽程表裡的日期)

這會用真實 secrets 把該場次的正式訊息發到 `LINE_GROUP_ID` 指定的群組。

**成本:一次 45 則。** 挑八月或九月上旬做,那時排程還沒開始發,額度全新。10 月之後每月只剩不到半則餘裕,別在那時候測。

`target_date` 留空時完全不影響行為,排程執行永遠不會設它。

## 8. 確認你真的收得到失敗通知信

整個錯誤處理策略都建立在「GitHub 會寄信通知你」這個假設上,也是刻意不做重試(retry)機制的原因。但 GitHub 只會寄信給**最後一次修改 cron 排程的人**,而且要在通知設定裡開啟才會寄。

1. 把這次的設定都推送上去之後,到 repo 確認你自己就是修改 `.github/workflows/notify.yml` 的最後一個 commit 作者。
2. 到 [github.com/settings/notifications](https://github.com/settings/notifications) → **Actions** → 確認「Send notifications for failed workflows only」是開啟的。

## ⚠️ 訊息額度

LINE 群組推播是按「則數 × 群組人數」計費。群組 45 人,每發一次消耗 **45 則**。免費(輕用量)方案每月 **200 則**,也就是每月最多發 4 次。

整季已規劃在額度內,唯一的例外是 2026 年 12 月有 5 個週二,已用 `schedule.json` 裡的 `alsoPreview` / `skipNotify` 兩個欄位處理掉(12/22 那則會順便預告 1/2 的比賽,12/29 就不發了)。

**所以測試時請務必用 `dry_run`,不要對正式群組亂發。** 每一次誤發都吃掉 45 則。

2026/10 到 2027/01 這四個月,每月都是剛好發送 4 次,用掉 180 則(200 則中的),不到半則的餘裕。這代表文件裡「發送失敗就手動重跑 workflow」這個復原方式,在這四個月**不能用**——手動重跑等於多發一次,會超過當月額度。如果這四個月裡有一次發送失敗,請改成手動在群組裡貼訊息,不要重跑 workflow。

## 賽程有異動怎麼辦

直接編輯 `schedule.json` 對應的那一筆,commit 推上去就好。格式驗證會在下次執行時自動檢查,格式錯誤會讓 workflow 失敗並寄信給你。
