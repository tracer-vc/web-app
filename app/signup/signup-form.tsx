"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "@/app/actions/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, undefined);

  if (state?.sentTo) {
    return (
      <div className="flex flex-col gap-3 text-[13px]">
        <p>
          We sent a confirmation link to <strong>{state.sentTo}</strong>. Open it to finish
          setting up your fund.
        </p>
        <p className="text-muted">
          No email after a few minutes? Check your spam folder, or{" "}
          <Link href="/login">sign in</Link> if you already have an account.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Fund name" name="fund_name" autoComplete="organization" defaultValue={state?.values?.fundName} />
      <Field label="Your name" name="display_name" autoComplete="name" defaultValue={state?.values?.displayName} />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state?.values?.email} />
      <Field
        label={`Password (at least ${MIN_PASSWORD_LENGTH} characters)`}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      />
      {state?.error && (
        <p role="alert" className="text-danger text-[13px]">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary mt-1" disabled={pending}>
        {pending ? "Creating account…" : "Create fund account"}
      </button>
      <p className="text-muted text-[13px]">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}

function Field({
  label,
  ...input
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted text-xs">{label}</span>
      <input className="input" required {...input} />
    </label>
  );
}
