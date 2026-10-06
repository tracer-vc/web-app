// A study run as a renderer-independent document (headings, cited
// paragraphs, lists, tables), rendered to HTML, Markdown or PDF for the
// Study 2 export (decision 44). No runtime imports.

export type Cited = { text: string; refs?: string[]; label?: string; detail?: string };

export type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "meta"; text: string }
  | { kind: "p"; item: Cited }
  | { kind: "list"; ordered: boolean; items: Cited[] }
  | { kind: "table"; head: string[]; rows: string[][]; widths: number[] };

export type RunDoc = { title: string; blocks: Block[] };

const refsText = (refs?: string[]) => (refs?.length ? " " + refs.map((r) => `[${r}]`).join(" ") : "");
export const citedText = (c: Cited) =>
  `${c.label ? `${c.label}: ` : ""}${c.text}${c.detail ? ` (${c.detail})` : ""}${refsText(c.refs)}`;

// ---------------------------------------------------------------------------
// HTML (self-contained, print-friendly)
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function citedHtml(c: Cited): string {
  return (
    (c.label ? `<strong>${esc(c.label)}:</strong> ` : "") +
    esc(c.text) +
    (c.detail ? ` <span class="muted">(${esc(c.detail)})</span>` : "") +
    (c.refs?.length ? ` <span class="refs">${c.refs.map((r) => `[${esc(r)}]`).join(" ")}</span>` : "")
  );
}

export function toHtml(doc: RunDoc): string {
  const body = doc.blocks
    .map((b) => {
      switch (b.kind) {
        case "h1":
        case "h2":
        case "h3":
          return `<${b.kind}>${esc(b.text)}</${b.kind}>`;
        case "meta":
          return `<p class="muted">${esc(b.text)}</p>`;
        case "p":
          return `<p>${citedHtml(b.item)}</p>`;
        case "list": {
          const tag = b.ordered ? "ol" : "ul";
          return `<${tag}>${b.items.map((i) => `<li>${citedHtml(i)}</li>`).join("")}</${tag}>`;
        }
        case "table":
          return (
            `<table><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>` +
            b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") +
            `</tbody></table>`
          );
      }
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<style>
  body { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d1d24; max-width: 920px; margin: 32px auto; padding: 0 20px; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 28px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 13px; font-weight: 600; color: #0d6b5b; margin: 18px 0 4px; }
  p { margin: 4px 0; } .muted { color: #666; } .refs { font: 11px ui-monospace, monospace; color: #0d6b5b; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 6px 0 12px; }
  th, td { border-top: 1px solid #e3e3e8; padding: 4px 6px; text-align: left; vertical-align: top; } th { color: #666; font-weight: 500; }
  ol, ul { margin: 4px 0; padding-left: 22px; }
  @media print { body { margin: 0; max-width: none; } h2 { break-after: avoid; } tr, li { break-inside: avoid; } }
</style></head>
<body>
${body}
</body></html>
`;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");

export function toMarkdown(doc: RunDoc): string {
  return (
    doc.blocks
      .map((b) => {
        switch (b.kind) {
          case "h1":
            return `# ${b.text}`;
          case "h2":
            return `## ${b.text}`;
          case "h3":
            return `### ${b.text}`;
          case "meta":
            return `_${b.text}_`;
          case "p":
            return citedText(b.item);
          case "list":
            return b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : "-"} ${citedText(i)}`).join("\n");
          case "table":
            return [
              `| ${b.head.map(mdCell).join(" | ")} |`,
              `| ${b.head.map(() => "---").join(" | ")} |`,
              ...b.rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`),
            ].join("\n");
        }
      })
      .join("\n\n") + "\n"
  );
}
