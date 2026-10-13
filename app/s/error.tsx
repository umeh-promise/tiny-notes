"use client";

import { RouteError } from "@/components/layout/route-error";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <RouteError title="This shared note couldn't load." reset={reset} />;
}
