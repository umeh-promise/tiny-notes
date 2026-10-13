import type { ReactNode } from "react";
import { requireSession } from "@/src/lib/session";
import { Container } from "@/components/layout/container";

export default async function NotesLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireSession();
  return (
    <Container as="main" className="py-9 md:py-13">
      {children}
    </Container>
  );
}
