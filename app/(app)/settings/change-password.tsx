"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/preferences";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";

// Change your own password (every member). The current password is required.
export function ChangePassword() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  // After a successful change, clear the fields by remounting the form.
  const formKey = state?.changedAt ?? "form";

  return (
    <section className="card p-5" data-testid="change-password">
      <h2 className="text-panel font-semibold">Password</h2>
      <p className="text-muted mb-4 text-body">Change the password you sign in with.</p>
      <form key={formKey} action={action} className="grid max-w-md gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-muted text-meta">Current password</span>
          <input className="input" name="current_password" type="password" autoComplete="current-password" required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-muted text-meta">New password (at least {MIN_PASSWORD_LENGTH} characters)</span>
          <input
            className="input"
            name="new_password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-muted text-meta">Repeat new password</span>
          <input
            className="input"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </label>
        <div className="flex items-center gap-4">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Change password"}
          </button>
          {state?.error && (
            <p role="alert" className="text-danger text-body">
              {state.error}
            </p>
          )}
          {state?.changedAt && <p className="text-body">Password changed.</p>}
        </div>
      </form>
    </section>
  );
}
