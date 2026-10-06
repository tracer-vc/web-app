"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { AuthForm } from "../auth-shell";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  if (state?.sentTo) {
    return (
      <div className="flex flex-col gap-3 text-body" data-testid="reset-sent">
        <p>
          If <strong>{state.sentTo}</strong> has an account, we sent it a link. Open it to choose a new password.
        </p>
        <p className="text-muted">
          No email after a few minutes? Check your spam folder, or <Link href="/forgot-password">try again</Link>.
        </p>
      </div>
    );
  }

  return (
    <AuthForm
      action={action}
      fields={
        <label className="flex flex-col gap-1.5">
          <span className="text-body font-medium">Email</span>
          <input
            className="input h-10"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state?.email}
            required
          />
        </label>
      }
      actions={
        <>
          {state?.error && (
            <p role="alert" className="text-danger text-body">
              {state.error}
            </p>
          )}
          <button type="submit" className="btn btn-primary h-10 w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </>
      }
    />
  );
}
