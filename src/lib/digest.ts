import { groupLotteryChanges, itemLink } from '../feeds/rss'
import type { ChangeRow } from './db'
import { listNewChangesSince } from './db'
import { escapeHtml } from './html'
import type { Mail } from './mail'
import { MAIL_REPLY_TO, sendBatch } from './mail'
import type { PushPayload, PushResult } from './push'
import { countPushSubscriptions, pushEnabled, sendPushToAll } from './push'
import { listActive, purgeStalePending } from './subscribers'

/**
 * 新着まとめメール(docs/email-digest.md)。毎日 12:00 JST に Cron Trigger から呼ぶ。
 * 前回送ったところより後の新着(新しい公演・一般で申し込める抽選の受付開始)を 1 通にまとめ、購読者に 1 人 1 通ずつ送る
 */

/** Resend の無料枠は 1 日 100 通。超えそうな日は送らずに記録する(有料プランにするかは人が決める) */
export const DAILY_SEND_LIMIT = 90

export type DigestItem = { kind: 'event' | 'lottery'; artist: string; text: string; url: string }

/** サマリ(ingest の書式)を、メールで読む 1 行に直す */
export function toItem(c: ChangeRow, siteUrl: string): DigestItem | null {
  const url = itemLink(c, siteUrl)
  const ev = c.summary.match(/^新規公演: (.*?)「(.*)」\((\d{4})-(\d{2})-(\d{2})\)$/)
  if (ev) {
    const [, artist, title, y, m, d] = ev
    return { kind: 'event', artist, text: `${artist}「${title}」${Number(y)}/${Number(m)}/${Number(d)}`, url }
  }
  const lot = c.summary.match(/^抽選情報: (.*?)「(.*)」(.*?)受付 (.*)$/)
  if (lot) {
    const [, artist, name, more, period] = lot
    return { kind: 'lottery', artist, text: `${artist}「${name}」${more}受付 ${period}`, url }
  }
  return null
}

/** 「新着: Vaundy の抽選受付の情報が出ました ほか1件」(メールの件名と通知の本文) */
export function digestHeadline(items: DigestItem[]): string {
  const first = items[0]
  const headline = `${first.artist} の${first.kind === 'event' ? '公演が決まりました' : '抽選受付の情報が出ました'}`
  return `新着: ${headline}${items.length > 1 ? ` ほか${items.length - 1}件` : ''}`
}

/** 通知を押したら、新着が 1 件ならその公演ページ、複数ならトップを開く */
export function digestPush(items: DigestItem[], siteUrl: string): PushPayload {
  return { title: 'サンドーム福井ライブ情報', body: digestHeadline(items), url: items.length === 1 ? items[0].url : siteUrl }
}

export function buildDigestMail(items: DigestItem[], to: string, unsubscribeUrl: string, siteUrl: string): Mail {
  const subject = digestHeadline(items)
  const events = items.filter((i) => i.kind === 'event')
  const lotteries = items.filter((i) => i.kind === 'lottery')
  const sections = [
    { title: '新しく分かった公演', list: events },
    { title: '抽選・先行の受付', list: lotteries },
  ].filter((s) => s.list.length > 0)
  const footerText = [
    'このメールは、サンドーム福井ライブ情報(' + siteUrl + ')でメール購読に登録した方に送っています。',
    `配信を停止する: ${unsubscribeUrl}`,
    `お問い合わせ: ${MAIL_REPLY_TO}`,
    '送信者: サンドーム福井ライブ情報(個人運営・take20m)',
  ]
  const text = [
    'サンドーム福井の新着情報です。',
    '',
    ...sections.flatMap((s) => [`■ ${s.title}`, ...s.list.flatMap((i) => [`・${i.text}`, `  ${i.url}`]), '']),
    'チケットの申込前に、必ず公式サイトの最新情報をご確認ください。',
    '',
    '--',
    ...footerText,
  ].join('\n')
  const html = `<div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#1B1B18;line-height:1.7;max-width:560px">
<p style="margin:0 0 16px">サンドーム福井の新着情報です。</p>
${sections
  .map(
    (s) => `<h2 style="font-size:15px;margin:20px 0 8px;color:#0B3D91">${escapeHtml(s.title)}</h2>
<ul style="margin:0;padding-left:20px">${s.list
      .map((i) => `<li style="margin:0 0 6px"><a href="${escapeHtml(i.url)}" style="color:#0B3D91">${escapeHtml(i.text)}</a></li>`)
      .join('')}</ul>`,
  )
  .join('\n')}
<p style="margin:20px 0 0;font-size:13px;color:#5C594F">チケットの申込前に、必ず公式サイトの最新情報をご確認ください。</p>
<hr style="border:0;border-top:1px solid #E6E3DC;margin:24px 0 12px">
<p style="margin:0;font-size:12px;color:#5C594F">このメールは、<a href="${escapeHtml(siteUrl)}" style="color:#5C594F">サンドーム福井ライブ情報</a>でメール購読に登録した方に送っています。<br>
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#5C594F">配信を停止する</a> ・ お問い合わせ: ${escapeHtml(MAIL_REPLY_TO)}<br>
送信者: サンドーム福井ライブ情報(個人運営・take20m)</p>
</div>`
  return {
    to,
    subject,
    html,
    text,
    // メールソフトの「配信停止」ボタン(RFC 8058 のワンクリック停止は同じ URL への POST)
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }
}

export type DigestResult =
  | { status: 'initialized'; lastChangeId: number }
  | { status: 'no-news' }
  | { status: 'no-subscribers' }
  | { status: 'over-limit'; subscribers: number }
  | { status: 'sent'; subscribers: number; items: number; lastChangeId: number; push: PushResult | null }

type DigestEnv = { DB: D1Database; RESEND_API_KEY?: string; VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }

/**
 * 前回より後の新着を 1 回だけ集め、メール(購読者ごとに 1 通)と通知(登録端末ごとに 1 通)の両方に送ってから位置を進める。
 * メールと通知はどちらか片方だけ動いていてもよい
 */
export async function runDigest(env: DigestEnv, siteUrl: string, now: Date): Promise<DigestResult | { status: 'disabled' }> {
  const mailOn = Boolean(env.RESEND_API_KEY)
  const pushOn = pushEnabled(env)
  if (!mailOn && !pushOn) return { status: 'disabled' }
  const db = env.DB
  if (mailOn) await purgeStalePending(db, now)
  const state = await db.prepare('SELECT last_change_id FROM digest_state WHERE id = 1').first<{ last_change_id: number }>()
  if (!state) {
    // 初回は今までの変更を全部送らないよう、今の最後の id から始める
    const max = await db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM changes').first<{ id: number }>()
    const lastChangeId = max?.id ?? 0
    await db
      .prepare('INSERT INTO digest_state (id, last_change_id, updated_at) VALUES (1, ?, ?)')
      .bind(lastChangeId, now.toISOString())
      .run()
    return { status: 'initialized', lastChangeId }
  }
  const { changes, maxId } = await listNewChangesSince(db, state.last_change_id)
  const items = groupLotteryChanges(changes)
    .map((c) => toItem(c, siteUrl))
    .filter((i): i is DigestItem => i !== null)
  // 新着が無い日は送らない。見送った変更(更新・会員限定)を次回また読まないよう、位置だけは進める
  const advance = () =>
    db.prepare('UPDATE digest_state SET last_change_id = ?, updated_at = ? WHERE id = 1').bind(maxId, now.toISOString()).run()
  if (items.length === 0) {
    await advance()
    return { status: 'no-news' }
  }
  const subscribers = mailOn ? await listActive(db) : []
  if (subscribers.length > DAILY_SEND_LIMIT) {
    console.error(`digest: ${subscribers.length} subscribers exceeds the daily limit ${DAILY_SEND_LIMIT}; not sent`)
    return { status: 'over-limit', subscribers: subscribers.length }
  }
  const devices = pushOn ? await countPushSubscriptions(db) : 0
  if (subscribers.length === 0 && devices === 0) {
    await advance()
    return { status: 'no-subscribers' }
  }
  if (subscribers.length > 0) {
    const day = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const mails = subscribers.map((s) =>
      buildDigestMail(items, s.email, new URL(`/subscribe/stop?t=${s.unsubscribe_token}`, siteUrl).toString(), siteUrl),
    )
    for (let i = 0; i < mails.length; i += 100) {
      await sendBatch(env.RESEND_API_KEY!, mails.slice(i, i + 100), `digest-${day}-${maxId}-${i / 100}`)
    }
  }
  const push = devices > 0 ? await sendPushToAll(env, digestPush(items, siteUrl)) : null
  await advance()
  return { status: 'sent', subscribers: subscribers.length, items: items.length, lastChangeId: maxId, push }
}
