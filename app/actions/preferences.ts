"use server";

import { revalidatePath } from "next/cache";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { createClient } from "@/lib/supabase/server";

// Personal preferences, available to every member (admins and analysts).
export async function setDevMode(
  enabled: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_dev_mode", { p_enabled: enabled });
  if (error) return { error: "Could not save the setting. Try again." };
  revalidatePath("/", "layout");
  return {};
}

export type ChangePasswordState = { error?: string; changedAt?: number } | undefined;

// Changes the signed-in member's password. The current password is checked
// first, so an unattended open session can't be used to take over the account.
export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { error: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (next !== confirm) return { error: "The new passwords don't match." };
  if (next === current) return { error: "Choose a password different from the current one." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Your session has expired. Sign in again." };

  const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (checkError) {
    return {
      error: checkError.code === "invalid_credentials" ? "The current password is wrong." : "Couldn't check your password. Try again.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    return {
      error:
        error.code === "weak_password"
          ? "Choose a stronger password."
          : error.code === "same_password"
            ? "Choose a password different from the current one."
            : "Couldn't change the password. Try again.",
    };
  }
  return { changedAt: Date.now() };
}
