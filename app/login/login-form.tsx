"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { AuthForm } from "../auth-shell";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <AuthForm
      action={action}
      fields={
        <>
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
          <div className="flex flex-col gap-1.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-body font-medium">Password</span>
              <input className="input h-10" name="password" type="password" autoComplete="current-password" required />
            </label>
            <Link href="/forgot-password" className="self-end text-body no-underline hover:underline">
              Forgot password?
            </Link>
          </div>
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
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </>
      }
    />
  );
}
