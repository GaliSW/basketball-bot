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
