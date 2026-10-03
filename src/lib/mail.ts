import { outbound } from './outbound'

/** 送信元と返信先(docs/email-digest.md)。sundome.take20m.dev を Resend の送信ドメインに登録しておく */
export const MAIL_FROM = 'サンドーム福井ライブ情報 <news@sundome.take20m.dev>'
export const MAIL_REPLY_TO = 'contact@take20m.dev'

export type Mail = {
  to: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

const toResend = (m: Mail) => ({
  from: MAIL_FROM,
  reply_to: MAIL_REPLY_TO,
  to: [m.to],
  subject: m.subject,
  html: m.html,
  text: m.text,
  ...(m.headers ? { headers: m.headers } : {}),
})

/** 1 通送る(確認メール)。失敗したら例外 */
export async function sendMail(apiKey: string, mail: Mail): Promise<void> {
  const res = await outbound.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(toResend(mail)),
  })
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

/**
 * まとめて送る(1 回 100 通まで)。idempotencyKey が同じ再送は Resend 側で 24 時間弾かれ、二重に届かない
 */
export async function sendBatch(apiKey: string, mails: Mail[], idempotencyKey: string): Promise<void> {
  if (mails.length === 0) return
  if (mails.length > 100) throw new Error('resend batch is limited to 100 emails')
  const res = await outbound.fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(mails.map(toResend)),
  })
  if (!res.ok) throw new Error(`resend batch ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

/** Turnstile(ボット対策)の応答をサーバー側で確かめる */
export async function verifyTurnstile(secret: string, token: string, ip: string | null): Promise<boolean> {
  if (!token) return false
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  const res = await outbound.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })
  if (!res.ok) return false
  const data = (await res.json()) as { success?: boolean }
  return data.success === true
}
