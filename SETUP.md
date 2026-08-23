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
