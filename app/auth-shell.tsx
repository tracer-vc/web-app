import Image from "next/image";

// Sign-in and sign-up: the form on the left, a photo on the right (hidden on
// narrow screens). Photo: Scott Webb on Unsplash (Unsplash License).
//
// The page never scrolls: it is exactly the window's height. When space runs
// out, only the form's input fields scroll (see AuthForm); the title, the
// submit button and the footer link stay in place.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="grid h-dvh overflow-hidden bg-[var(--color-surface)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-0 flex-col px-6 pt-8 pb-6 sm:px-12">
        <div className="nav-brand shrink-0">
          <span className="nav-brand-dot" />
          Tracer
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center py-6">
          <div className="flex min-h-0 w-full max-w-[380px] flex-col self-center">
            <h1 className="mb-2 shrink-0 text-page">{title}</h1>
            <p className="text-muted mb-8 shrink-0 text-reading leading-relaxed">{subtitle}</p>
            {children}
            {footer && <div className="text-muted mt-8 shrink-0 text-body">{footer}</div>}
          </div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden lg:block">
        <Image src="/login-art.jpg" alt="" fill priority sizes="55vw" className="object-cover" />
        <div className="absolute bottom-10 left-10 max-w-md rounded-[4px] bg-[var(--color-ink)] p-6 text-white">
          <p className="font-display text-[22px] leading-snug font-semibold tracking-[-0.015em]">
            Every statement traces back to its evidence.
          </p>
          <p className="mt-2 text-reading text-[var(--color-cobalt-soft)]">
            From deal materials to a Proceed, Watch or Pass decision, with every claim linked to a tiered source.
          </p>
          <a
            href="https://unsplash.com/photos/white-and-black-striped-textile-mV9-1XjnM4Y"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-meta text-[var(--color-cobalt-soft)] no-underline hover:text-white"
          >
            Photo by Scott Webb on Unsplash
          </a>
        </div>
      </div>
    </main>
  );
}

// The form inside AuthShell: the fields scroll when space runs out, the
// actions (error and submit button) stay pinned below them.
export function AuthForm({
  action,
  fields,
  actions,
}: {
  action: (formData: FormData) => void;
  fields: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <form action={action} className="flex min-h-0 flex-col">
      {/* -mx/px keep the focus ring visible inside the scroll area */}
      <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1 py-1">{fields}</div>
      <div className="flex shrink-0 flex-col gap-3 pt-5">{actions}</div>
    </form>
  );
}
