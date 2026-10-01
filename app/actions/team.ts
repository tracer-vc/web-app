"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { createAdminClient } from "@/lib/supabase/admin";
import { Constants, type Enums } from "@/lib/supabase/database.types";

export type AddMemberState =
  | {
      error?: string;
      added?: string;
      values?: { displayName: string; email: string; role: string };
    }
  | undefined;

// Admin adds an analyst or admin to their own fund with an initial password.
// Creating auth users needs the Auth admin API (secret key); the fund and the
// caller's role come from the verified session, never from the form.
export async function addMember(_prev: AddMemberState, formData: FormData): Promise<AddMemberState> {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Only fund admins can add members." };

  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  const values = { displayName, email, role };

  if (!displayName || !email) return { error: "Enter a name and an email.", values };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, values };
  }
  if (!(Constants.public.Enums.user_role as readonly string[]).includes(role)) {
    return { error: "Choose a role.", values };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (error || !data.user) {
    return {
      error:
        error?.code === "email_exists"
          ? "An account with this email already exists."
          : error?.code === "weak_password"
            ? "Choose a stronger password."
            : error?.code === "email_address_invalid" || error?.code === "validation_failed"
              ? "Enter a valid email address."
              : "Could not create the account. Try again.",
      values,
    };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    fund_id: user.fundId,
    display_name: displayName,
    role: role as Enums<"user_role">,
  });

  if (profileError) {
    // Don't leave a login without a fund behind.
    await admin.auth.admin.deleteUser(data.user.id);
    console.error("addMember: profile insert failed", profileError);
    return { error: "Could not create the account. Try again.", values };
  }

  revalidatePath("/settings/team");
  return { added: `${displayName} (${email}) was added as ${role}. Share the password with them.` };
}
