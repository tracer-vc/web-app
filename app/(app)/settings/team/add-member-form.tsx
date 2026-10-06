"use client";

import { useActionState } from "react";
import { addMember } from "@/app/actions/team";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMember, undefined);
  // After a successful add, reset the form by remounting it.
  const formKey = state?.added ?? "form";

  return (
    <form key={formKey} action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-meta">Name</span>
        <input className="input" name="display_name" required defaultValue={state?.values?.displayName} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-meta">Email</span>
        <input className="input" name="email" type="email" required defaultValue={state?.values?.email} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-meta">Initial password (at least {MIN_PASSWORD_LENGTH} characters)</span>
        <input
          className="input"
          name="password"
          type="text"
          autoComplete="off"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-meta">Role</span>
        <select className="input" name="role" defaultValue={state?.values?.role ?? "analyst"}>
          <option value="analyst">Analyst: runs evaluations</option>
          <option value="admin">Admin: also edits fund settings and team</option>
        </select>
      </label>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add member"}
        </button>
        {state?.error && (
          <p role="alert" className="text-danger text-body">
            {state.error}
          </p>
        )}
        {state?.added && <p className="text-body">{state.added}</p>}
      </div>
    </form>
  );
}
