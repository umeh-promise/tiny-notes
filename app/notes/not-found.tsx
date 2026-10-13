import { ButtonLink } from "@/components/ui/button";
import { NotesMessage } from "@/components/notes/notes-message";

export default function NoteNotFound() {
  return (
    <NotesMessage title="This note isn't here.">
      <p>It may have been removed, or it isn't available to your account.</p>
      <ButtonLink href="/notes" className="mt-6 focus-visible:outline-aqua">
        Back to your notes
      </ButtonLink>
    </NotesMessage>
  );
}
