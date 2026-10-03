/**
 * 外部 API(Resend・Turnstile)への通信の出口。テストではここの fetch を差し替えて、本物へは送らない
 */
export const outbound: { fetch: typeof fetch } = {
  fetch: (input, init) => fetch(input, init),
}
