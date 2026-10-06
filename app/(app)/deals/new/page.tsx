import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { NewDealForm } from "./new-deal-form";

export const metadata: Metadata = {
  title: "New deal · Tracer",
};

export default async function NewDealPage() {
  await requireUser();

  return (
    <>
      <p className="mb-2 text-body">
        <Link href="/deals">← All deals</Link>
      </p>
      <h1 className="mb-1.5 text-page">New deal</h1>
      <p className="text-muted mb-8 text-body">
        Add the company you&apos;re looking at. Next, you&apos;ll upload its materials and run the Quick Screen.
      </p>
      <NewDealForm />
    </>
  );
}
