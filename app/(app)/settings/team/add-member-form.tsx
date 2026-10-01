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
        <span className="text-muted text-xs">Name</span>
        <input className="input" name="display_name" required defaultValue={state?.values?.displayName} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-xs">Email</span>
        <input className="input" name="email" type="email" required defaultValue={state?.values?.email} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-xs">Initial password (at least {MIN_PASSWORD_LENGTH} characters)</span>
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
        <span className="text-muted text-xs">Role</span>
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
          <p role="alert" className="text-danger text-[13px]">
            {state.error}
          </p>
        )}
        {state?.added && <p className="text-[13px]">{state.added}</p>}
      </div>
    </form>
  );
}
