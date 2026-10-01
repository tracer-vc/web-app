import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Deals · Tracer",
};

// Placeholder until M5 (deals list, Quick Screen).
export default async function DealsPage() {
  await requireUser();

  return (
    <>
      <h1 className="mb-1.5 text-3xl">Deals</h1>
      <p className="text-muted text-[13px]">No deals yet.</p>
    </>
  );
}
