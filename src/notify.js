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
