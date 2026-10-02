import "server-only";

// Tavily web search for step 2b (decision 5; settings in decision 36). One
// basic search returns the result pages' cleaned text (include_raw_content),
// which replaces a separate fetch + readability step.

// Decision 6: no social-media scraping.
const EXCLUDED_DOMAINS = ["linkedin.com", "x.com", "twitter.com", "facebook.com", "instagram.com"];

export type WebHit = { url: string; title: string; text: string; publishedAt: string | null };

export class WebSearchError extends Error {
  constructor(
    readonly kind: "missing_key" | "auth" | "quota" | "rate_limit" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "WebSearchError";
  }
}

export async function searchWeb(query: string, maxResults: number): Promise<WebHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new WebSearchError("missing_key", "TAVILY_API_KEY is not set");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_raw_content: "text",
      include_published_date: true,
      exclude_domains: EXCLUDED_DOMAINS,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401) throw new WebSearchError("auth", `Tavily rejected the API key (401) ${detail}`);
    if (res.status === 432 || res.status === 433) throw new WebSearchError("quota", `Tavily credit limit reached (${res.status}) ${detail}`);
    if (res.status === 429) throw new WebSearchError("rate_limit", `Tavily rate limit (429) ${detail}`);
    throw new WebSearchError("unavailable", `Tavily error ${res.status} ${detail}`);
  }

  const data = (await res.json()) as {
    results?: { url: string; title?: string; raw_content?: string | null; published_date?: string | null }[];
  };
  return (data.results ?? []).map((r) => ({
    url: r.url,
    title: (r.title ?? "").trim() || r.url,
    text: (r.raw_content ?? "").trim(),
    publishedAt: r.published_date ?? null,
  }));
}

// Normalise for de-duplication: no fragment, no trailing slash, no "www.".
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return `${u.protocol}//${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url;
  }
}
