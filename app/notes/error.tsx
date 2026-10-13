"use client";

import { RouteError } from "@/components/layout/route-error";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <RouteError title="Your notes couldn't load." reset={reset} />;
}
