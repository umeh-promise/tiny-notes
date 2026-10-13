import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";

export const metadata: Metadata = {
  title: "Shared note · TinyNotes",
  robots: { index: false, follow: false },
};

export default function SharedNoteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Container as="main" className="py-10 md:py-14">
      {children}
    </Container>
  );
}
