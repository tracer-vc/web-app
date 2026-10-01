"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-xs">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state?.email}
          required
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-xs">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-danger text-[13px]">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary mt-1" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
