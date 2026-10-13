import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SectionHeading } from "@/components/ui/section-heading";
import { Container } from "@/components/layout/container";
import { FeatureCard } from "@/components/landing/feature-card";
import { NotePreview } from "@/components/note-preview";
import { redirectIfAuthenticated } from "@/src/lib/session";

export default async function Home() {
  await redirectIfAuthenticated();
  return (
    <main>
      <Container
        as="section"
        className="grid items-center gap-5.5 pt-13 pb-11.25 md:grid-cols-2 md:gap-6.25 md:py-17.5 lg:gap-16.25 lg:pt-23.5 lg:pb-25 2xl:py-30"
        aria-labelledby="hero-title"
      >
        <div className="mx-auto w-full max-w-122.5 md:max-w-none">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#d5e5d9] bg-[#f0f6ee] px-3 py-2 text-[10px] font-medium md:text-[11px]">
            <span className="size-1.25 rounded-full bg-aqua" /> A little less noise. A little more
            clarity.
          </span>
          <h1
            id="hero-title"
            className="mt-7 font-display text-[clamp(51px,10vw,68px)]/[1.06] font-normal tracking-[-3px] md:text-[60px] lg:text-[clamp(54px,5.7vw,78px)]"
          >
            Small notes.
            <br />
            <em className="font-normal text-aqua">Clearer mind.</em>
          </h1>
          <p className="mt-6.25 max-w-97.5 text-sm/[1.9] text-muted md:max-w-101.25 md:text-[15px]">
            A home for your thoughts, ideas, and everything in between. Write freely. Keep it
            simple. Share a little when you’re ready.
          </p>
          <div className="mt-8 flex items-center gap-4.25 lg:gap-6.5">
            <ButtonLink href="/register">
              Find your little space <Icon name="arrow" />
            </ButtonLink>
            <a
              className="inline-flex items-center gap-3 text-xs/normal font-[550] hover:text-aqua"
              href="#a-simpler-space"
            >
              Take a look <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="mt-8.5 flex items-center gap-3 text-[10px] text-muted">
            <span className="h-px w-6.5 bg-[#a3b9a9]" /> Just you, your words, and a fresh page.
          </div>
        </div>
        <div className="relative isolate mx-auto w-[calc(100%-1.25rem)] max-w-110 pt-8.75 pb-7.5 before:absolute before:-inset-x-[4%] before:top-[5%] before:bottom-0 before:-z-10 before:rounded-full before:bg-note-glow before:content-[''] md:mx-0 md:w-auto md:max-w-none md:before:-inset-x-[6%] lg:px-3">
          <div className="mb-4.75 flex items-center justify-center gap-2.25 text-[10px] text-aqua">
            <Icon name="spark" /> Every thought starts somewhere
          </div>
          <NotePreview />
          <span className="mt-6.75 block -rotate-3 text-center font-display text-[17px]/[normal] text-[#6c927c] italic">
            a little thought, a little lighter.
          </span>
        </div>
      </Container>
      <section
        id="a-simpler-space"
        className="scroll-mt-6 border-y border-[#e1e9df] bg-[#edf3ed] py-10.75 md:py-15"
        aria-labelledby="features-title"
      >
        <Container>
          <div className="text-center">
            <Eyebrow>LESS, BUT JUST ENOUGH</Eyebrow>
            <SectionHeading id="features-title">A simpler space to think.</SectionHeading>
            <p className="mt-3.5 text-xs/[1.8] text-muted">
              Everything your notes need. Room for everything else.
            </p>
          </div>
          <div className="mt-7.5 grid gap-6.5 md:mt-11 md:grid-cols-3 md:gap-6.25 lg:gap-10">
            <FeatureCard icon="note" title="Let your thoughts flow." label="01 / WRITE">
              From a quick thought to a longer story, give your words a little room to breathe.
            </FeatureCard>
            <FeatureCard icon="lock" title="Yours, first and always." label="02 / KEEP">
              A personal corner for unfinished ideas, everyday lists, and things just for you.
            </FeatureCard>
            <FeatureCard icon="link" title="Good thoughts travel." label="03 / SHARE">
              When a note is ready for company, share it with a link. You decide what goes out.
            </FeatureCard>
          </div>
        </Container>
      </section>
      <Container as="section" aria-labelledby="next-idea-title" className="pt-16 pb-18 text-center">
        <span className="inline-flex text-aqua">
          <Icon name="spark" />
        </span>
        <SectionHeading id="next-idea-title">Your next idea needs a home.</SectionHeading>
        <p className="mt-3.5 text-xs/[1.8] text-muted">
          Start with a thought. See where it takes you.
        </p>
        <ButtonLink href="/register" className="mt-6.25">
          Make a little room <Icon name="arrow" />
        </ButtonLink>
      </Container>
    </main>
  );
}
