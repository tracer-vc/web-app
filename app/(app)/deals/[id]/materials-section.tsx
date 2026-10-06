"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MAX_DOCUMENTS, MAX_DOCUMENT_BYTES, type DocumentView } from "@/lib/evaluation-shared";
import { createClient } from "@/lib/supabase/client";

// Same list as lib/extract.ts DOCUMENT_TYPES and the bucket's allowed types.
const TYPES: Record<string, { label: string; ext: string }> = {
  "application/pdf": { label: "PDF", ext: "pdf" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { label: "PPTX", ext: "pptx" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { label: "DOCX", ext: "docx" },
  "text/html": { label: "HTML", ext: "html" },
  "text/plain": { label: "TXT", ext: "txt" },
  "text/markdown": { label: "Markdown", ext: "md" },
  "image/png": { label: "PNG", ext: "png" },
  "image/jpeg": { label: "JPEG", ext: "jpg" },
  "image/webp": { label: "WebP", ext: "webp" },
};
const BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html",
  htm: "text/html",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const ACCEPT = Object.keys(BY_EXTENSION).map((e) => `.${e}`).join(",");

const STATUS_LABELS: Record<DocumentView["status"], string> = {
  pending: "extracting…",
  extracted: "done",
  no_text: "no text extracted",
  failed: "extraction failed",
};

type Upload = { key: string; filename: string; state: "uploading" | "extracting" | "error"; message?: string };

function mimeOf(file: File): string | null {
  if (file.type in TYPES) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? null;
}

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MaterialsSection({
  evaluationId,
  fundId,
  documents,
  editable,
}: {
  evaluationId: string;
  fundId: string;
  documents: DocumentView[];
  editable: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = uploads.some((u) => u.state !== "error");
  const reading = documents.some((d) => d.visualStatus === "pending" || d.visualStatus === "running");

  // Images are read in the background (decision 45); refresh until done.
  useEffect(() => {
    if (!reading) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [reading, router]);

  const update = (key: string, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  async function uploadOne(file: File, mime: string) {
    const key = crypto.randomUUID();
    setUploads((list) => [...list, { key, filename: file.name, state: "uploading" }]);
    const id = crypto.randomUUID();
    const path = `${fundId}/${evaluationId}/${id}.${TYPES[mime].ext}`;

    const { error: uploadError } = await createClient()
      .storage.from("deal-documents")
      .upload(path, file, { contentType: mime, upsert: false });
    if (uploadError) {
      update(key, { state: "error", message: `Upload failed: ${uploadError.message}` });
      return;
    }

    update(key, { state: "extracting" });
    const res = await fetch(`/api/evaluations/${evaluationId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, filename: file.name, mime_type: mime, bytes: file.size }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      update(key, { state: "error", message: data?.error ?? "Couldn't register the file." });
      return;
    }
    setUploads((list) => list.filter((u) => u.key !== key));
    router.refresh();
  }

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const list = [...files];
    const room = MAX_DOCUMENTS - documents.length - uploads.filter((u) => u.state !== "error").length;
    if (list.length > room) {
      setError(`A deal can have at most ${MAX_DOCUMENTS} documents (${Math.max(room, 0)} more allowed).`);
      return;
    }
    const rejected: string[] = [];
    const accepted: [File, string][] = [];
    for (const f of list) {
      const mime = mimeOf(f);
      if (!mime) rejected.push(`${f.name}: unsupported type (PDF, PPTX, DOCX, HTML, TXT, MD, PNG, JPEG, WebP)`);
      else if (f.size > MAX_DOCUMENT_BYTES) rejected.push(`${f.name}: larger than 20 MB`);
      else if (f.size === 0) rejected.push(`${f.name}: empty file`);
      else accepted.push([f, mime]);
    }
    if (rejected.length) setError(rejected.join(" · "));
    await Promise.all(accepted.map(([f, mime]) => uploadOne(f, mime)));
  }

  async function remove(doc: DocumentView) {
    if (!confirm(`Remove ${doc.filename}? Answers citing it lose those citations.`)) return;
    const res = await fetch(`/api/evaluations/${evaluationId}/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't remove the document.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="card gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-panel font-semibold">Materials</h2>
        <span className="text-muted text-body">
          {documents.length} of {MAX_DOCUMENTS} documents
        </span>
      </div>

      {editable && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-2 rounded-lg border border-dashed p-5 text-center text-body ${
            dragging ? "border-[var(--color-accent)]" : "border-[var(--color-neutral-700)]"
          }`}
        >
          <span>Drop pitch deck, founder profiles, press, technical docs</span>
          <span className="text-muted text-meta">
            PDF, PPTX, DOCX, HTML, TXT, PNG, JPEG, WebP · up to 20 MB each
          </span>
          <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy}>
            Choose files
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-danger text-body">
          {error}
        </p>
      )}

      {(documents.length > 0 || uploads.length > 0) && (
        <ul className="flex flex-col divide-y divide-[var(--color-divider)] text-body">
          {documents.map((d) => (
            <DocumentRow
              key={d.id}
              evaluationId={evaluationId}
              doc={d}
              onRemove={editable ? () => remove(d) : undefined}
            />
          ))}
          {uploads.map((u) => (
            <li key={u.key} className="flex items-center gap-3 py-2">
              <span className="flex-1 truncate">{u.filename}</span>
              <span className={`text-meta ${u.state === "error" ? "text-danger" : "text-muted"}`} data-testid="upload-state">
                {u.state === "uploading" ? "uploading…" : u.state === "extracting" ? "extracting…" : u.message}
              </span>
              {u.state === "error" && (
                <button className="btn px-2 py-1 text-meta" onClick={() => setUploads((l) => l.filter((x) => x.key !== u.key))}>
                  Dismiss
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DocumentRow({
  evaluationId,
  doc,
  onRemove,
}: {
  evaluationId: string;
  doc: DocumentView;
  onRemove?: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const readingImages = doc.visualStatus === "pending" || doc.visualStatus === "running";

  async function toggle() {
    if (!open && text === null) {
      const res = await fetch(`/api/evaluations/${evaluationId}/documents/${doc.id}`);
      const data = await res.json().catch(() => null);
      setText(res.ok ? data.text || "(no text)" : (data?.error ?? "Couldn't load the text."));
    }
    setOpen(!open);
  }

  return (
    <li className="py-2" data-testid="document-row">
      <div className="flex items-center gap-3">
        <span className="flex-1 truncate">{doc.filename}</span>
        <span className="text-muted text-meta">
          {TYPES[doc.mimeType]?.label ?? doc.mimeType} · {size(doc.bytes)}
        </span>
        <span
          className={`tag ${doc.status === "extracted" ? "tag-neutral" : ""} ${(doc.status === "no_text" && !readingImages) || doc.status === "failed" ? "text-danger" : ""}`}
          data-testid="document-status"
        >
          {doc.status === "no_text" && readingImages ? "text from images…" : STATUS_LABELS[doc.status]}
        </span>
        {doc.visualStatus !== "none" && (
          <span
            className={`tag ${doc.visualStatus === "failed" ? "text-danger" : "tag-outline"}`}
            title={doc.visualError ?? doc.visualSummary ?? undefined}
            data-testid="visual-status"
            data-status={doc.visualStatus}
          >
            {readingImages ? "reading images…" : doc.visualStatus === "failed" ? "images not read" : "images read"}
          </span>
        )}
        {doc.status === "extracted" && (
          <button className="btn px-2 py-1 text-meta" onClick={toggle} aria-expanded={open}>
            {open ? "Hide text" : "View text"}
          </button>
        )}
        {onRemove && (
          <button className="btn px-2 py-1 text-meta" aria-label={`Remove ${doc.filename}`} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      {(doc.visualSummary || doc.visualError) && !readingImages && (
        <p className={`mt-1 text-meta ${doc.visualStatus === "failed" ? "text-danger" : "text-muted"}`} data-testid="visual-summary">
          {doc.visualStatus === "failed" ? doc.visualError : doc.visualSummary}
        </p>
      )}
      {open && (
        <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-[var(--color-bg)] p-3 text-meta whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </li>
  );
}
