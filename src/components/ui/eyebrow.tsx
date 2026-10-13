import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

export function Eyebrow({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={twMerge("text-[9px] font-semibold tracking-[2px] text-aqua", className)}
      {...props}
    />
  );
}
