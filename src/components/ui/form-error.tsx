import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

export function FormError({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      role="alert"
      className={twMerge("text-xs/[1.7] text-error focus:outline-none", className)}
      {...props}
    />
  );
}
