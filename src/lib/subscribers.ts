/**
 * メール購読者の表(subscribers)の読み書き。docs/email-digest.md
 */

/** 推測できない URL 用のトークン(32 バイトを base64url) */
export function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** 形式が明らかにおかしいものだけ弾く(届くかどうかは確認メールで確かめる) */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const e = raw.trim().toLowerCase()
  if (e.length > 254 || !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(e)) return null
  return e
}

export const CONFIRM_TTL_MS = 48 * 60 * 60 * 1000
/** 確認待ちのまま同じアドレスに確認メールを送り直すまでの間隔(連打で確認メールを乱発させない) */
export const RESEND_CONFIRM_AFTER_MS = 10 * 60 * 1000
const PENDING_KEEP_MS = 7 * 24 * 60 * 60 * 1000

type Row = {
  id: number
  email: string
  status: 'pending' | 'active'
  confirm_expires_at: string | null
  unsubscribe_token: string
  created_at: string
}

export type RegisterResult =
  | { kind: 'send-confirm'; email: string; token: string }
  | { kind: 'already-active' }
  | { kind: 'recently-sent' }

/**
 * 登録を受け付ける。新規か、確認待ちで前回から時間がたっていれば確認トークンを作り直して返す。
 * 購読中なら何もしない(確認メールも送らない)
 */
export async function registerPending(db: D1Database, email: string, now: Date): Promise<RegisterResult> {
  const row = await db.prepare('SELECT * FROM subscribers WHERE email = ?').bind(email).first<Row>()
  if (row?.status === 'active') return { kind: 'already-active' }
  const token = newToken()
  const hash = await sha256Hex(token)
  const expires = new Date(now.getTime() + CONFIRM_TTL_MS).toISOString()
  if (row) {
    const sentAt = Date.parse(row.confirm_expires_at ?? '') - CONFIRM_TTL_MS
    if (now.getTime() - sentAt < RESEND_CONFIRM_AFTER_MS) return { kind: 'recently-sent' }
    await db
      .prepare('UPDATE subscribers SET confirm_token_hash = ?, confirm_expires_at = ? WHERE id = ?')
      .bind(hash, expires, row.id)
      .run()
  } else {
    await db
      .prepare(
        `INSERT INTO subscribers (email, status, confirm_token_hash, confirm_expires_at, unsubscribe_token, created_at)
         VALUES (?, 'pending', ?, ?, ?, ?)`,
      )
      .bind(email, hash, expires, newToken(), now.toISOString())
      .run()
  }
  return { kind: 'send-confirm', email, token }
}

/** 確認リンク。期限内で確認待ちなら購読中にする */
export async function confirmToken(db: D1Database, token: string, now: Date): Promise<'confirmed' | 'invalid'> {
  if (!token) return 'invalid'
  const hash = await sha256Hex(token)
  const row = await db
    .prepare("SELECT * FROM subscribers WHERE confirm_token_hash = ? AND status = 'pending'")
    .bind(hash)
    .first<Row>()
  if (!row || !row.confirm_expires_at || Date.parse(row.confirm_expires_at) < now.getTime()) return 'invalid'
  await db
    .prepare(
      "UPDATE subscribers SET status = 'active', confirmed_at = ?, confirm_token_hash = NULL, confirm_expires_at = NULL WHERE id = ?",
    )
    .bind(now.toISOString(), row.id)
    .run()
  return 'confirmed'
}

/** 停止用トークンが有効か(停止ページを出す前の確認) */
export async function findByUnsubscribeToken(db: D1Database, token: string): Promise<boolean> {
  if (!token) return false
  const row = await db.prepare('SELECT id FROM subscribers WHERE unsubscribe_token = ?').bind(token).first()
  return row !== null
}

/** 配信停止。行ごと消す(停止したアドレスは持ち続けない) */
export async function unsubscribe(db: D1Database, token: string): Promise<boolean> {
  if (!token) return false
  const r = await db.prepare('DELETE FROM subscribers WHERE unsubscribe_token = ?').bind(token).run()
  return (r.meta.changes ?? 0) > 0
}

export async function listActive(db: D1Database): Promise<{ email: string; unsubscribe_token: string }[]> {
  const { results } = await db
    .prepare("SELECT email, unsubscribe_token FROM subscribers WHERE status = 'active' ORDER BY id")
    .all<{ email: string; unsubscribe_token: string }>()
  return results
}

/** 確認されないまま 7 日たった登録を消す(送り直した確認リンクがまだ有効なものは残す) */
export async function purgeStalePending(db: D1Database, now: Date): Promise<void> {
  await db
    .prepare(
      "DELETE FROM subscribers WHERE status = 'pending' AND created_at < ? AND (confirm_expires_at IS NULL OR confirm_expires_at < ?)",
    )
    .bind(new Date(now.getTime() - PENDING_KEEP_MS).toISOString(), now.toISOString())
    .run()
}
