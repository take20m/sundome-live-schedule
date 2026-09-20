/**
 * サイトに載せる文章(Markdown)の一覧。
 * wrangler の module rules(*.md を Text として取り込む)に頼るため、import.meta.glob は使わず明示的に列挙する。
 * 新しい記事を足すときは Markdown を置いてここに 1 行追加する。
 */
import aimyon from './artists/あいみょん.md'
import guideAccess from './guide/access.md'
import guideTickets from './guide/tickets.md'

export const ARTIST_DOCS: readonly string[] = [aimyon]

export const GUIDE_DOCS: Readonly<Record<string, string>> = {
  access: guideAccess,
  tickets: guideTickets,
}
