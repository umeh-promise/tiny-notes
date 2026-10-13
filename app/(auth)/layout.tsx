import type { ReactNode } from "react";
import Link from "next/link";
import { NotePreview } from "@/components/note-preview";
import { Icon } from "@/components/ui/icon";
import { Container } from "@/components/layout/container";
import { Eyebrow } from "@/components/ui/eyebrow";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Container
      as="main"
      className="my-6 grid overflow-hidden rounded-[14px] border border-border bg-paper md:my-10 md:min-h-175 md:grid-cols-2"
    >
      <div className="md:order-2 flex items-center justify-center px-6 py-9 md:p-8.75 lg:p-12">
        {children}
      </div>
      <aside
        aria-labelledby="auth-aside-title"
        className="border-b border-border bg-[#e9f1e7] p-6 md:border-r md:border-b-0 md:p-7 lg:px-10.5 lg:py-8"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2.25 text-[10px] text-[#657f6e] hover:text-aqua"
        >
          <span aria-hidden="true">←</span> Back to a little clarity
        </Link>
        <div className="mt-6.25 md:mt-9.75">
          <Eyebrow>THOUGHTS, MEET HOME.</Eyebrow>
          <h2
            id="auth-aside-title"
            className="mt-3.5 font-display text-4xl/[1.12] font-normal tracking-[-1.8px] md:text-[45px]"
          >
            A little space.
            <br />
            <em className="font-normal text-aqua">A lighter mind.</em>
          </h2>
          <p className="mt-4.25 hidden text-xs/[1.9] text-muted md:block">
            For the things you’re figuring out,
            <br />
            and the things you don’t want to forget.
          </p>
        </div>
        <NotePreview compact className="hidden md:block" />
        <p className="mt-6.75 hidden items-center justify-center gap-2 text-[9px] text-[#6d8872] md:flex">
          <Icon name="spark" className="size-3.5" /> Nothing to organize. Just a place to begin.
        </p>
      </aside>
    </Container>
  );
}
