import Link from "next/link";
import { LuArrowRight, LuCheck } from "react-icons/lu";

// The pipeline's guide: pinned to the bottom of the window on every step. It
// says where the user is, the state of the step in one line, and holds the one
// action that moves the deal forward (start the step, or continue to the next).
export function StepBar({
  step,
  title,
  status,
  done = false,
  progress,
  error,
  children,
}: {
  step: number;
  title: string;
  status: React.ReactNode;
  done?: boolean;
  // 0-100 while the step runs in the background.
  progress?: number;
  // A failed start or continue action.
  error?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="sticky bottom-0 z-[4] -mb-6 bg-gradient-to-t from-[var(--color-bg)] from-60% to-transparent pt-5 pb-3 print:hidden"
      data-testid="next-step"
    >
      <div className="panel flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5 pr-[11px] pl-4 shadow-[0_8px_28px_rgb(23_32_42/0.12),0_1px_2px_rgb(23_32_42/0.06)]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-meta font-semibold tabular-nums ${
              done
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-accent-tint)] text-[var(--color-accent-text)] shadow-[inset_0_0_0_1px_var(--color-accent-chip)]"
            }`}
          >
            {done ? <LuCheck aria-hidden className="h-3.5 w-3.5" strokeWidth={3} /> : step}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-meta leading-tight font-medium text-[var(--color-neutral-400)]">
              Step {step} of 5 · {title}
            </div>
            <div className={`${progress !== undefined ? "text-body" : "text-body"} leading-snug font-medium`}>{status}</div>
            {error && (
              <p role="alert" className="text-danger mt-0.5 text-body">
                {error}
              </p>
            )}
            {progress !== undefined && (
              <div className="mt-2 mb-0.5 h-1 max-w-sm overflow-hidden rounded bg-[var(--color-neutral-900)]" data-testid="run-progress">
                <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${Math.max(progress, 3)}%` }} />
              </div>
            )}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

// "Continue to <next step>" once the next step has already been started.
export function ContinueLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="btn btn-primary no-underline">
      {label}
      <LuArrowRight aria-hidden className="h-4 w-4" />
    </Link>
  );
}

export function NextIcon() {
  return <LuArrowRight aria-hidden className="h-4 w-4" />;
}
