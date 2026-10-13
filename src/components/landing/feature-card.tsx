import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

type FeatureCardProps = Readonly<{
  icon: IconName;
  title: string;
  label: string;
  children: ReactNode;
}>;

export function FeatureCard({ icon, title, label, children }: FeatureCardProps) {
  return (
    <article className="border-b border-[#d6e1d4] pb-6.25 last:border-b-0 last:pb-0 md:border-b-0 md:pb-0 md:not-first:border-l md:not-first:pl-6.25 lg:not-first:pl-10">
      <span className="grid size-9.25 place-items-center rounded-[10px] border border-[#d2dfd0] bg-[#f6f9f0] text-aqua">
        <Icon name={icon} />
      </span>
      <h3 className="mt-4.75 font-display text-[23px]/[1.3] font-normal tracking-[-0.4px]">
        {title}
      </h3>
      <p className="mt-2.75 max-w-105 text-xs/[1.9] text-muted md:max-w-67.5">{children}</p>
      <span className="mt-3.75 block text-[8px] tracking-[1.4px] text-[#718773] md:mt-6">
        {label}
      </span>
    </article>
  );
}
