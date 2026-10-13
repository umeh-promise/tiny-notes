import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { twMerge } from "tailwind-merge";

type ButtonSize = "default" | "navigation";

function buttonClasses(size: ButtonSize, className?: string) {
  return twMerge(
    "inline-flex min-h-12.25 items-center justify-center gap-4.5 rounded-[7px] border border-transparent bg-aqua px-5.75 py-3.75 text-[13px] font-[550] text-white transition-[background,translate] duration-160 ease-[ease] not-disabled:hover:-translate-y-px not-disabled:hover:bg-aqua-hover disabled:cursor-not-allowed disabled:opacity-65 motion-reduce:transition-none",
    size === "navigation" &&
      "max-md:min-h-10.5 max-md:gap-2.5 max-md:px-3.5 max-md:py-2.75 max-md:text-[11px]",
    className,
  );
}

export function ButtonLink({
  className,
  size = "default",
  ...props
}: ComponentProps<typeof Link> & { size?: ButtonSize }) {
  return <Link className={buttonClasses(size, className)} {...props} />;
}

export function Button({
  className,
  size = "default",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: ButtonSize }) {
  return <button type={type} className={buttonClasses(size, className)} {...props} />;
}
