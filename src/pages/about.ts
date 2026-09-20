import { iconSvg } from '../lib/icon'
import { buildHeadMeta } from '../lib/seo'
import { SITE_CSS, SITE_FOOTER, SITE_HEADER } from './style'

/** サイト概要+プライバシーポリシー(広告掲載の前提となる固定ページ) */
export function renderAboutPage(canonical: string): string {
  const head = buildHeadMeta({
    title: 'このサイトについて・プライバシーポリシー | サンドーム福井 コンサート・ライブ情報',
    description:
      'サンドーム福井 コンサート・ライブ情報の運営者情報、情報収集の仕組み、免責事項、プライバシーポリシー。',
    canonical,
  })
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<style>${SITE_CSS}</style>
</head>
<body>
${SITE_HEADER}
<main class="prose">
<h2>このサイトについて</h2>
<p>「サンドーム福井 コンサート・ライブ情報」は、<a href="https://sundome.sankan.jp/" rel="noopener" target="_blank">サンドーム福井</a>(福井県越前市)で開催されるライブ・コンサートの開催予定と、チケットの先行・抽選・一般発売の受付期間をまとめている非公式の個人運営サイトです。会場・アーティスト・チケット販売各社とは関係ありません。</p>
<p>掲載情報は公式に発表された公開情報をもとに毎日更新していますが、誤り・遅れが生じる場合があります。<strong>チケットの申込前に必ず公式サイトをご確認ください</strong>。本サイトの情報に起因する損害について運営者は責任を負いません。掲載に問題がある場合はご連絡ください。すみやかに対応します。</p>

<h2>プライバシーポリシー</h2>
<ul>
<li>本サイトは会員登録を必要とせず、個人情報を収集しません。Cookie も使用していません</li>
<li>配信インフラ(Cloudflare)がサービス提供・セキュリティのためにアクセスログを処理することがあります</li>
<li>表示用フォント(Roboto / Noto Sans JP)を Google Fonts から読み込んでいます。このとき、ブラウザから Google のサーバーへ IP アドレス等を含むリクエストが送られます。Google Fonts はこの配信で Cookie を使用しません</li>
<li>今後、アクセス解析や第三者配信の広告を導入する場合は、本ページで利用サービスと Cookie の取り扱いを告知します</li>
</ul>

<h2>掲載画像について</h2>
<ul>
<li>トップの会場写真は <a href="https://commons.wikimedia.org/wiki/File:Sundome_Fukui_2014-12-27_01.JPG" rel="noopener" target="_blank">Sundome Fukui 2014-12-27 01.JPG</a>(撮影: 賀正、Wikimedia Commons)を <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ja" rel="noopener" target="_blank">CC BY-SA 4.0</a> のもとでトリミングして使用しています</li>
<li>各公演の画像は、アーティスト公式サイトが SNS 共有用に公開している画像(og:image)を、複製せず直接参照して表示しています。掲載に問題がある場合は下記連絡先までお知らせください。すみやかに取り下げます</li>
</ul>

<h2>運営者・連絡先</h2>
<ul>
<li>運営者: take20m</li>
<li>連絡先: <a href="mailto:contact@take20m.dev">contact@take20m.dev</a></li>
</ul>

<div class="back" style="margin-top:32px"><a class="btn-text" href="/">${iconSvg('arrow_back')}公演一覧へ戻る</a></div>
</main>
${SITE_FOOTER}
</body>
</html>`
}
