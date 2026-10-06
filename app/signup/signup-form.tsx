"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "@/app/actions/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { AuthForm } from "../auth-shell";

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, undefined);

  if (state?.sentTo) {
    return (
      <div className="flex flex-col gap-3 text-body">
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
    <AuthForm
      action={action}
      fields={
        <>
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
        </>
      }
      actions={
        <>
          {state?.error && (
            <p role="alert" className="text-danger text-body">
              {state.error}
            </p>
          )}
          <button type="submit" className="btn btn-primary h-10 w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create fund account"}
          </button>
        </>
      }
    />
  );
}

function Field({
  label,
  ...input
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-body font-medium">{label}</span>
      <input className="input h-10" required {...input} />
    </label>
  );
}
