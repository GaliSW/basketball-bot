const ENDPOINT = 'https://api.line.me/v2/bot/message/push'

export async function pushMessage({ token, groupId, text }, fetchImpl = fetch) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: 'text', text }],
    }),
  })

  if (!res.ok) {
    throw new Error(`LINE API 回應 ${res.status}: ${await res.text()}`)
  }
}
