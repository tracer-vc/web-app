"use client";

import { useActionState } from "react";
import { resetPassword } from "@/app/actions/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { AuthForm } from "../auth-shell";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, undefined);

  return (
    <AuthForm
      action={action}
      fields={
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-body font-medium">New password (at least {MIN_PASSWORD_LENGTH} characters)</span>
            <input
              className="input h-10"
              name="new_password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-body font-medium">Repeat new password</span>
            <input
              className="input h-10"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </label>
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
            {pending ? "Saving…" : "Set password and sign in"}
          </button>
        </>
      }
    />
  );
}
