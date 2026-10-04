import { buildHeadMeta } from '../lib/seo'
import { renderArticle } from './article'

/** サイト概要+プライバシーポリシー(広告掲載の前提となる固定ページ) */
/**
 * メール購読(docs/email-digest.md)を受け付けているときだけ出す、メールアドレスの扱い。
 * 外国(米国)の事業者に個人データを預けるので、国名とその国の制度、各社のポリシーを示す(個人情報保護法 28 条)
 */
const MAIL_PRIVACY = `<h3>メール購読で預かる情報</h3>
<ul>
<li>預かるもの: メール購読に登録したメールアドレスだけです</li>
<li>使う目的: 新しい公演や抽選の受付情報のお知らせメールと、登録の確認メールを送るためだけに使います。ほかの目的には使わず、第三者に売ったり提供したりしません(下の送信・保存の委託を除く)</li>
<li>保管と削除: 確認されないまま7日たった登録と、配信を停止したメールアドレスは削除します。メールアドレスをサイト上に表示することはありません</li>
<li>外国の事業者の利用: メールの送信に <a href="https://resend.com/legal/privacy-policy" rel="noopener" target="_blank">Resend</a>(Resend, Inc.、米国)を、データの保存と、フォームのボット対策(Turnstile)に <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener" target="_blank">Cloudflare</a>(Cloudflare, Inc.、米国)を使います。米国には、日本の個人情報保護法に当たる連邦レベルの包括的な法律はなく、分野ごと・州ごとの法律があります。フォームを送るとき、ボットかどうかを判定するためにブラウザの情報が Cloudflare に送られます</li>
<li>新着情報のお知らせを閉じたことと、メール購読の登録が済んだことを、ブラウザの中(localStorage)に記録します。お知らせを出し直さないためだけに使い、サーバーには送りません</li>
<li>開示・訂正・削除のご依頼は、下の連絡先までお知らせください</li>
</ul>`

/** プッシュ通知(docs/web-push.md)を受け付けているときだけ出す、端末の宛先の扱い */
const PUSH_PRIVACY = `<h3>プッシュ通知で預かる情報</h3>
<ul>
<li>預かるもの: 通知を受け取ると決めた端末の宛先(ブラウザのプッシュサービスが発行する URL と暗号鍵)だけです。名前やメールアドレスは含みません</li>
<li>使う目的: 新しい公演や抽選の受付情報の通知を送るためだけに使います</li>
<li>送る経路: 通知は、端末のブラウザを提供する事業者のプッシュサービス(Apple、Google、Mozilla など。米国の事業者を含みます)を経由して届きます。通知の中身は暗号化して送るため、プッシュサービスは中身を読めません</li>
<li>保管と削除: 「通知を止める」を押したとき、または端末側で通知を止めて届かなくなったときに削除します</li>
</ul>`

export function renderAboutPage(canonical: string, opts: { mail?: boolean; push?: boolean } = {}): string {
  const body = `<h2>このサイトについて</h2>
<p>「サンドーム福井ライブ情報」は、<a href="https://sundome.sankan.jp/" rel="noopener" target="_blank">サンドーム福井</a>(福井県越前市)で開催されるライブ・コンサートの開催予定と、チケットの先行・抽選・一般発売の受付期間をまとめている非公式の個人運営サイトです。会場・アーティスト・チケット販売各社とは関係ありません。</p>
<p>サンドーム福井ではよくライブが開かれますが、今日は誰のライブなのか分からなかったり、抽選の受付期間に気づけていたら行きたかったのにと思ったりしたことが何度かありました。それがこのサイトを作ったきっかけです。会場公式・アーティスト公式・ファンクラブ・プレイガイドに散らばる情報を毎日集めて1ページにまとめ、そこに運営者が調べたガイドを足しています。</p>
<p>掲載情報は公式に発表された公開情報をもとに毎日更新していますが、誤りや更新の遅れが出る場合があります。<strong>チケットの申込前に必ず公式サイトをご確認ください</strong>。本サイトの情報に起因する損害について運営者は責任を負いません。掲載に問題がある場合はご連絡ください。すみやかに対応します。</p>

<h2 id="privacy">プライバシーポリシー</h2>
<ul>
<li>${
  opts.mail || opts.push
    ? `本サイトの閲覧に会員登録は要りません。Cookieも使用していません。お預かりするのは、${[opts.mail ? 'メール購読に登録したときのメールアドレス' : '', opts.push ? 'プッシュ通知を受け取ると決めた端末の宛先' : ''].filter(Boolean).join('と、')}だけです(下記)`
    : '本サイトは会員登録を必要とせず、個人情報を収集しません。Cookieも使用していません'
}</li>
<li>配信インフラ(Cloudflare)がサービス提供・セキュリティのためにアクセスログを処理することがあります</li>
<li>会場ガイドの地図は、OpenStreetMapの地図タイルを読み込んで表示しています。地図ライブラリのLeafletはcdnjsから読み込んでいます。Cookieは使用しません</li>
<li>表示用フォント(Roboto、Noto Sans JP、Noto Serif JP)はGoogle Fontsから読み込んでいます。このとき、ブラウザからGoogleのサーバーへ、IPアドレスなどを含むリクエストが送られます。Google Fontsはこの配信でCookieを使用しません</li>
<li>今後、アクセス解析や第三者配信の広告を導入する場合は、本ページで利用サービスとCookieの取り扱いを告知します</li>
</ul>
${opts.mail ? MAIL_PRIVACY : ''}
${opts.push ? PUSH_PRIVACY : ''}

<h2>掲載画像について</h2>
<ul>
<li>トップと会場ガイドの写真は、<a href="https://commons.wikimedia.org/wiki/File:Sundome_Fukui_2014-12-27_01.JPG" rel="noopener" target="_blank">Sundome Fukui 2014-12-27 01.JPG</a>(撮影: 賀正、Wikimedia Commons)を<a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ja" rel="noopener" target="_blank">CC BY-SA 4.0</a>のもとでトリミングして使用しています</li>
<li>各公演の画像は、アーティスト公式サイトがSNS共有用に公開している画像(og:image)を、複製せずに直接参照して表示しています。掲載に問題がある場合は下記連絡先までお知らせください。すみやかに取り下げます</li>
</ul>

<h2>運営者・連絡先</h2>
<ul>
<li>運営者: take20m(福井在住のエンジニア)</li>
<li>連絡先: <a href="mailto:contact@take20m.dev">contact@take20m.dev</a></li>
</ul>`
  return renderArticle({
    head: buildHeadMeta({
      title: 'このサイトについて・プライバシーポリシー | サンドーム福井ライブ情報',
      description: 'サンドーム福井ライブ情報の運営者情報、情報収集の仕組み、免責事項、プライバシーポリシー。',
      canonical,
    }),
    crumbs: [{ label: '公演一覧', href: '/' }, { label: 'このサイトについて' }],
    title: 'このサイトについて',
    lead: '毎日更新の公演一覧と、運営者が調べて書いたガイドで、サンドーム福井の公演情報をひとつにまとめています。',
    body,
  })
}
