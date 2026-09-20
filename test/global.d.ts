// cloudflare:test の env は Cloudflare.Env を参照するため、ここでマージする
declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    INGEST_TOKEN: string
  }
}

declare module '*.sql?raw' {
  const content: string
  export default content
}

declare module '*/og-image.mjs' {
  export function extractOgImage(html: string, baseUrl: string): string | null
}

declare module '*.md' {
  const content: string
  export default content
}
