import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { Container } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getSession } from "@/src/lib/session";

export async function SiteHeader() {
  const session = await getSession();
  return (
    <header className="border-b border-border">
      <Container className="flex min-h-19.5 items-center justify-between gap-5 md:min-h-23">
        <Brand />
        <nav aria-label="Main navigation" className="flex items-center gap-4.5 md:gap-8">
          {session ? (
            <>
              <Link
                className="text-xs/normal font-[550] hover:text-aqua md:text-sm/normal"
                href="/notes"
              >
                My notes
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                className="text-xs/normal font-[550] hover:text-aqua md:text-sm/normal"
                href="/login"
              >
                Sign in
              </Link>
              <ButtonLink href="/register" size="navigation">
                Get started <Icon name="arrow" className="hidden md:block" />
              </ButtonLink>
            </>
          )}
        </nav>
      </Container>
    </header>
  );
}
