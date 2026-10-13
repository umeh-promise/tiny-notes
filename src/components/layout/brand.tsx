import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function Brand() {
  return (
    <Link
      href="/"
      className="inline-flex items-center text-[21px] font-[650] tracking-[-1px] md:text-[23px]"
      aria-label="TinyNotes home"
    >
      <span className="mr-2 grid h-8.25 w-7.5 -rotate-5 place-items-center rounded-[10px_10px_3px_10px] bg-aqua text-[#f4f8ef] md:mr-2.5 md:h-9.5 md:w-8.75">
        <Icon name="note" />
      </span>
      TinyNotes<span className="text-aqua">.</span>
    </Link>
  );
}
