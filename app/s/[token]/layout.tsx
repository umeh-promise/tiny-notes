import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPublicNote } from "@/src/lib/notes/public-note";

export default async function PublicAccessLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;
  // Access is resolved above the segment's loading boundary, before any response streams.
  if (!(await getPublicNote(token))) notFound();
  return children;
}
