import { twMerge } from "tailwind-merge";
import { Icon } from "@/components/ui/icon";

const checklist = [
  { label: "Find a little inspiration", checked: true },
  { label: "Write something, anything", checked: false },
  { label: "Leave room for a new idea", checked: false },
];

export function NotePreview({
  compact = false,
  className,
}: Readonly<{ compact?: boolean; className?: string }>) {
  const Heading = compact ? "h3" : "h2";
  const paragraphClassName = twMerge(
    "mt-3 text-[11px]/[1.9] text-[#748073]",
    compact && "text-[10px]/[1.9]",
  );

  return (
    <figure
      className={twMerge(
        "relative -rotate-3 rounded-[11px] border border-[#d9e2d6] bg-paper shadow-note",
        compact && "mx-2.5 mt-6.75",
        className,
      )}
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-[#ebeee6] px-5 py-3.75 text-[8px] tracking-[0.7px] text-[#687c6b]">
        <span className="flex items-center gap-1.75">
          <Icon name="note" className="size-3.5" /> EXAMPLE NOTE
        </span>
        {!compact && (
          <span className="flex items-center gap-1.75 tracking-normal md:hidden lg:flex">
            <span className="size-1 rounded-full bg-[#81a88a]" /> Just a little inspiration
          </span>
        )}
      </figcaption>
      <div className={compact ? "px-5.75 py-5" : "px-6 pt-7.25 pb-6.75 lg:px-7.5"}>
        {!compact && (
          <span className="text-[8px] tracking-[1.6px] text-[#879581]">A MOMENT TO YOURSELF</span>
        )}
        <Heading
          className={twMerge(
            "mt-3.25 max-w-70 font-display font-normal tracking-[-0.6px]",
            compact ? "mt-3.5 mb-3 text-2xl/[1.12] tracking-[-1.8px]" : "mb-4.5 text-[27px]/[1.25]",
          )}
        >
          Make room for the little things.
        </Heading>
        <p className={paragraphClassName}>
          The ideas that arrive on a walk. A sentence you want to remember. Plans for a slower
          Sunday.
        </p>
        <p className={paragraphClassName}>
          They don’t need to be perfect.
          <br />
          They just need a place to land.
        </p>
        {!compact && (
          <>
            <hr className="mt-5.5 mb-4.25 border-[#e7ebdf]" />
            <p className="mt-3 text-[10px]/[1.9] font-semibold text-[#3e5646]">
              A few things for today
            </p>
            <ul className="mt-3 flex flex-col gap-2.75 text-[10px] text-[#76816f]">
              {checklist.map(({ label, checked }) => (
                <li key={label} className="flex items-center gap-2.5">
                  <span
                    className={twMerge(
                      "size-3 shrink-0 rounded-[3px] border border-[#c3cdbd]",
                      checked && "border-[#c5dfc7] bg-[#dfeee0] text-aqua",
                    )}
                  >
                    {checked && <Icon name="check" className="size-2.5" />}
                  </span>
                  <span className={checked ? "text-[#99a18f] line-through" : undefined}>
                    {checked && <span className="sr-only">Completed: </span>}
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[#ebeee6] px-5 py-3.25 text-[8px] text-[#8c9888]">
        <span className="flex items-center gap-1.75">
          <Icon name="lock" className="size-2.5" /> Your own little corner
        </span>
        <span>One thought at a time</span>
      </div>
    </figure>
  );
}
