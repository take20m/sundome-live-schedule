import { buildHeadMeta } from '../lib/seo'
import { renderArticle } from './article'

/** サイト概要+プライバシーポリシー(広告掲載の前提となる固定ページ) */
export function renderAboutPage(canonical: string): string {
  const body = `<h2>このサイトについて</h2>
<p>「サンドーム福井ライブ情報」は、<a href="https://sundome.sankan.jp/" rel="noopener" target="_blank">サンドーム福井</a>(福井県越前市)で開催されるライブ・コンサートの開催予定と、チケットの先行・抽選・一般発売の受付期間をまとめている非公式の個人運営サイトです。会場・アーティスト・チケット販売各社とは関係ありません。</p>
<p>サンドーム福井ではよくライブが開かれますが、今日は誰のライブなのか分からなかったり、抽選の受付期間に気づけていたら行きたかったのにと思ったりしたことが何度かありました。それがこのサイトを作ったきっかけです。会場公式・アーティスト公式・ファンクラブ・プレイガイドに散らばる情報を毎日集めて1ページにまとめ、そこに運営者が調べたガイドを足しています。</p>
<p>掲載情報は公式に発表された公開情報をもとに毎日更新していますが、誤りや更新の遅れが出る場合があります。<strong>チケットの申込前に必ず公式サイトをご確認ください</strong>。本サイトの情報に起因する損害について運営者は責任を負いません。掲載に問題がある場合はご連絡ください。すみやかに対応します。</p>

<h2>プライバシーポリシー</h2>
<ul>
<li>本サイトは会員登録を必要とせず、個人情報を収集しません。Cookieも使用していません</li>
<li>配信インフラ(Cloudflare)がサービス提供・セキュリティのためにアクセスログを処理することがあります</li>
<li>会場ガイドの地図は、OpenStreetMapの地図タイルを読み込んで表示しています。地図ライブラリのLeafletはcdnjsから読み込んでいます。Cookieは使用しません</li>
<li>表示用フォント(Roboto、Noto Sans JP、Noto Serif JP)はGoogle Fontsから読み込んでいます。このとき、ブラウザからGoogleのサーバーへ、IPアドレスなどを含むリクエストが送られます。Google Fontsはこの配信でCookieを使用しません</li>
<li>今後、アクセス解析や第三者配信の広告を導入する場合は、本ページで利用サービスとCookieの取り扱いを告知します</li>
</ul>

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
