"use server";

import { revalidatePath } from "next/cache";
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
