import type { HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

type ContainerProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "main" | "section";
};

export function Container({ as: Tag = "div", className, ...props }: ContainerProps) {
  return (
    <Tag
      className={twMerge(
        "mx-auto w-[calc(100%-2.5rem)] max-w-290 md:w-[calc(100%-4rem)] lg:w-[calc(100%-6rem)]",
        className,
      )}
      {...props}
    />
  );
}
