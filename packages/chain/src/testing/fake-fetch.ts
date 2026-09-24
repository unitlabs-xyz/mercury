/**
 * The only network an adapter test gets.
 *
 * Matching is by substring of the request URL, so a test registers "/price/v3"
 * and does not have to reproduce query-string ordering. An unmatched request
 * throws and names the URL — a silent empty response would make a wrong URL
 * look like an upstream with no data, which is the bug this is here to catch.
 */
export class HttpFailure {
  constructor(readonly status: number) {}
}

export const fails = (status: number): HttpFailure => new HttpFailure(status);

type FetchInput = Parameters<typeof fetch>[0];

/** `RequestInfo` is not a global under lib ES2023, so take fetch's own first parameter. */
const urlOf = (input: FetchInput): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

export const fakeFetch = (routes: Record<string, unknown>): typeof fetch =>
  (async (input: FetchInput) => {
    const url = urlOf(input);
    const hit = Object.entries(routes).find(([pattern]) => url.includes(pattern));
    if (hit === undefined) throw new Error(`fakeFetch: nothing registered for ${url}`);
    const body = hit[1];
    if (body instanceof HttpFailure) return new Response(null, { status: body.status });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
