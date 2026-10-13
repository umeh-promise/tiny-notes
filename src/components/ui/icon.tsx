import { twMerge } from "tailwind-merge";

export type IconName = "note" | "arrow" | "lock" | "link" | "spark" | "check";

const paths: Record<IconName, string> = {
  note: "M6 3h9l4 4v14H5V3h1m9 0v5h4M9 12h6m-6 4h4",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10m7 5v2",
  link: "m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  check: "m5 12 4 4L19 6",
};

export function Icon({ name, className }: Readonly<{ name: IconName; className?: string }>) {
  return (
    <svg
      aria-hidden="true"
      className={twMerge("size-5 shrink-0", className)}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
