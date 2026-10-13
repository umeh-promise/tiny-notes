import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

export function SectionHeading({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={twMerge(
        "mt-3.5 font-display text-[32px]/[1.2] font-normal tracking-[-1px] md:text-[37px]",
        className,
      )}
      {...props}
    />
  );
}
