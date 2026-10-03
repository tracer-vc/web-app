// Text from Office XML (DrawingML / WordprocessingML) and native chart data.
// No runtime imports, so `node --test` can load it directly.

const NAMED_ENTITIES: Record<string, string> = {
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  copy: "©",
  euro: "€",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(ldquo|rdquo|lsquo|rsquo|ndash|mdash|hellip|copy|euro);/g, (_, n: string) => NAMED_ENTITIES[n])
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export const textOf = (xml: string) =>
  xml
    .split(/<\/a:p>|<\/w:p>/)
    .map((p) => [...p.matchAll(/<(?:a|w):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:a|w):t>/g)].map((m) => decodeEntities(m[1])).join(""))
    .filter((p) => p.trim())
    .join("\n");

// Native chart data from chartN.xml (cached values), as plain sentences.
export function chartToText(xml: string): string | null {
  const title = textOf(/<c:title>([\s\S]*?)<\/c:title>/.exec(xml)?.[1] ?? "").replace(/\n/g, " ").trim();
  const values = (block: string | undefined) =>
    [...(block ?? "").matchAll(/<c:pt idx="(\d+)"[^>]*>\s*<c:v>([\s\S]*?)<\/c:v>/g)].map((m) => ({ idx: Number(m[1]), v: decodeEntities(m[2]) }));
  const series = [...xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map((m) => {
    const ser = m[1];
    const name = decodeEntities(/<c:tx>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>/.exec(ser)?.[1] ?? "").trim();
    const cats = values(/<c:(?:cat|xVal)>([\s\S]*?)<\/c:(?:cat|xVal)>/.exec(ser)?.[1]);
    const vals = values(/<c:(?:val|yVal)>([\s\S]*?)<\/c:(?:val|yVal)>/.exec(ser)?.[1]);
    const pairs = vals.map((v) => `${cats.find((c) => c.idx === v.idx)?.v ?? `#${v.idx + 1}`}: ${v.v}`);
    return pairs.length ? `${name ? `Series "${name}"` : "Series"}: ${pairs.join("; ")}.` : null;
  });
  const lines = series.filter((s): s is string => !!s);
  if (!lines.length) return null;
  return [`Chart${title ? ` "${title}"` : ""} (data read from the file).`, ...lines].join(" ");
}
