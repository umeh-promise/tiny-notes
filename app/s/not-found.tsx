import { UnavailablePage } from "@/components/layout/unavailable-page";

// The public access layout throws before streaming; its parent owns this boundary.
export default function SharedNoteNotFound() {
  return <UnavailablePage shared />;
}
