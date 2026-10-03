import type { Context } from 'hono'
import { escapeHtml } from '../lib/html'
import { MAIL_REPLY_TO, sendMail, verifyTurnstile } from '../lib/mail'
import type { Mail } from '../lib/mail'
import { confirmToken, findByUnsubscribeToken, normalizeEmail, registerPending, unsubscribe } from '../lib/subscribers'
import { renderMailNotice } from '../pages/subscribe'
import type { Bindings } from '../types'

/**
 * メール購読の登録・確認・停止(docs/email-digest.md)。
 * キー(Resend・Turnstile)がそろっていないときはメールの欄を出さず、ここも 404 にする
 */
type C = Context<{ Bindings: Bindings }>

export const mailEnabled = (env: Bindings) => Boolean(env.RESEND_API_KEY && env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY)

function confirmMail(to: string, confirmUrl: string, siteUrl: string): Mail {
  const text = [
    'サンドーム福井ライブ情報のメール購読の確認です。',
    '',
    '次のリンクを開くと登録が完了し、新しい公演や抽選の受付情報が届くようになります(48時間有効)。',
    confirmUrl,
    '',
    '心当たりがない場合は、このメールを破棄してください。登録は完了しません。',
    '',
    '--',
    `サンドーム福井ライブ情報(個人運営・take20m) ${siteUrl}`,
    `お問い合わせ: ${MAIL_REPLY_TO}`,
  ].join('\n')
  const html = `<div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#1B1B18;line-height:1.7;max-width:560px">
<p>サンドーム福井ライブ情報のメール購読の確認です。</p>
<p>次のボタンを押すと登録が完了し、新しい公演や抽選の受付情報が届くようになります(48時間有効)。</p>
<p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:10px 20px;border-radius:20px;background:#0B3D91;color:#FFFFFF;text-decoration:none;font-weight:700">登録を完了する</a></p>
<p style="font-size:13px;color:#5C594F">ボタンが押せないときは、次の URL を開いてください。<br>${escapeHtml(confirmUrl)}</p>
<p style="font-size:13px;color:#5C594F">心当たりがない場合は、このメールを破棄してください。登録は完了しません。</p>
<hr style="border:0;border-top:1px solid #E6E3DC;margin:24px 0 12px">
<p style="margin:0;font-size:12px;color:#5C594F">サンドーム福井ライブ情報(個人運営・take20m) ・ お問い合わせ: ${escapeHtml(MAIL_REPLY_TO)}</p>
</div>`
  return { to, subject: '【サンドーム福井ライブ情報】メール購読の確認', html, text }
}

/** フォームの送信。結果はどれも同じ「確認メールを送りました」に寄せる(誰が登録しているかを探られないように) */
export async function handleSubscribe(c: C): Promise<Response> {
  if (!mailEnabled(c.env)) return c.notFound()
  const body = await c.req.parseBody()
  const back = (e: string) => c.redirect(`/subscribe?e=${e}#mail`, 303)
  const ok = await verifyTurnstile(
    c.env.TURNSTILE_SECRET!,
    typeof body['cf-turnstile-response'] === 'string' ? body['cf-turnstile-response'] : '',
    c.req.header('CF-Connecting-IP') ?? null,
  )
  if (!ok) return back('bot')
  const email = normalizeEmail(body.email)
  if (!email) return back('email')
  const result = await registerPending(c.env.DB, email, new Date())
  if (result.kind === 'send-confirm') {
    const confirmUrl = new URL(`/subscribe/confirm?t=${result.token}`, c.req.url).toString()
    try {
      await sendMail(c.env.RESEND_API_KEY!, confirmMail(email, confirmUrl, new URL('/', c.req.url).toString()))
    } catch (err) {
      console.error('subscribe: confirm mail failed', err)
      return back('send')
    }
  }
  return c.redirect('/subscribe/sent', 303)
}

export function handleSent(c: C): Response | Promise<Response> {
  if (!mailEnabled(c.env)) return c.notFound()
  return c.html(
    renderMailNotice(new URL('/subscribe/sent', c.req.url).toString(), {
      title: '確認メールを送りました',
      lead: '届いたメールのボタンを押すと、登録が完了します。リンクの有効期限は48時間です。',
      body: '<p>数分たっても届かないときは、迷惑メールのフォルダも確認してください。すでに登録済みのアドレスには、確認メールを送り直しません。</p>',
    }),
  )
}

export async function handleConfirm(c: C): Promise<Response> {
  if (!mailEnabled(c.env)) return c.notFound()
  const r = await confirmToken(c.env.DB, c.req.query('t') ?? '', new Date())
  const canonical = new URL('/subscribe/confirm', c.req.url).toString()
  return c.html(
    r === 'confirmed'
      ? renderMailNotice(canonical, {
          title: '登録が完了しました',
          lead: '新しい公演や抽選の受付情報があった日の昼12時ごろに、まとめてメールでお知らせします。',
          body: '<p>メールの末尾のリンクから、いつでも配信を停止できます。</p><p><a class="btn-text" href="/">公演一覧へ</a></p>',
        })
      : renderMailNotice(canonical, {
          title: 'このリンクは使えません',
          lead: '有効期限(48時間)が過ぎたか、すでに登録が完了しています。',
          body: '<p>登録がまだの場合は、<a href="/subscribe#mail">新着情報を受け取る</a>からもう一度申し込んでください。</p>',
        }),
    r === 'confirmed' ? 200 : 400,
  )
}

/** 停止リンクを開いたとき。ここでは止めず、ボタンで POST してもらう(リンクの自動確認で止まらないように) */
export async function handleStopPage(c: C): Promise<Response> {
  const token = c.req.query('t') ?? ''
  const canonical = new URL('/subscribe/stop', c.req.url).toString()
  if (!(await findByUnsubscribeToken(c.env.DB, token))) {
    return c.html(
      renderMailNotice(canonical, {
        title: '配信は停止されています',
        lead: 'このリンクの配信はすでに停止されているか、リンクが正しくありません。',
        body: '',
      }),
      404,
    )
  }
  return c.html(
    renderMailNotice(canonical, {
      title: 'メールの配信を停止しますか?',
      lead: '停止すると、登録したメールアドレスはこのサイトから削除されます。',
      body: `<form method="post" action="/subscribe/stop?t=${escapeHtml(token)}"><button class="sub-btn" type="submit">配信を停止する</button></form>`,
    }),
  )
}

/** 停止(ページのボタンと、メールソフトのワンクリック停止の両方がここに来る) */
export async function handleStop(c: C): Promise<Response> {
  const token = c.req.query('t') ?? ''
  await unsubscribe(c.env.DB, token)
  return c.html(
    renderMailNotice(new URL('/subscribe/stop', c.req.url).toString(), {
      title: '配信を停止しました',
      lead: 'メールアドレスを削除しました。これ以上メールは届きません。',
      body: '<p>また受け取りたくなったら、<a href="/subscribe#mail">新着情報を受け取る</a>から登録できます。</p>',
    }),
  )
}
