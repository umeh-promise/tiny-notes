import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { NavigationGuardProvider } from "@/components/layout/navigation-guard";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TinyNotes",
  description: "Create and share notes with TinyNotes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth motion-reduce:scroll-auto">
      <body
        className={`${inter.variable} flex min-h-dvh flex-col bg-background font-sans text-sm/normal text-foreground antialiased selection:bg-selection selection:text-selection-foreground`}
      >
        <a
          className="fixed -top-20 left-4 z-10 rounded-lg bg-foreground px-5 py-3 text-white focus:top-3"
          href="#main-content"
        >
          Skip to content
        </a>
        <NavigationGuardProvider>
          <SiteHeader />
          <div id="main-content" className="flex-1 focus:outline-none" tabIndex={-1}>
            {children}
          </div>
          <SiteFooter />
        </NavigationGuardProvider>
      </body>
    </html>
  );
}
