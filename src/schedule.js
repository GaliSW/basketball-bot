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
