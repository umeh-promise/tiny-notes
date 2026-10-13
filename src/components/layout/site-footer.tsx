import { Container } from "@/components/layout/container";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <Container className="flex min-h-25 flex-wrap items-center justify-center gap-x-5.5 gap-y-3 py-6 md:min-h-20 md:flex-nowrap md:justify-between md:gap-5 md:py-0">
        <span className="text-sm/normal font-semibold tracking-[-0.4px]">
          TinyNotes<span className="text-aqua">.</span>
        </span>
        <p className="text-[10px] text-muted">A little space for what’s on your mind.</p>
        <span className="hidden text-[10px] text-muted md:block">Less noise. More notes.</span>
      </Container>
    </footer>
  );
}
