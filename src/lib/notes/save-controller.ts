import type { CreateNoteInput, NoteDraft, NoteResult, SavedNote, UpdateNoteInput } from "./types";
import { copyDocument } from "./document";
import { hasNoteText, requiredNoteFields } from "./required-fields";

type SaveState = {
  draft: NoteDraft;
  updatedAt: string | null;
  dirty: boolean;
  saving: boolean;
  error: Extract<NoteResult, { error: unknown }>["error"] | null;
};

function fingerprint(draft: NoteDraft): string {
  return JSON.stringify({ title: draft.title.trim(), contentJson: draft.contentJson });
}

/** Serializes writes while keeping the latest local draft independent of acknowledgements. */
export class NoteSaveController {
  private state: SaveState;
  private saved: string | null;
  private listeners = new Set<() => void>();
  private inFlight: Promise<SavedNote | null> | null = null;
  private unacknowledged: { draft: NoteDraft; updatedAt: string | null } | null = null;
  private active = true;
  private paused = false;

  constructor(
    private readonly options: {
      id: string;
      draft: NoteDraft;
      updatedAt: string | null;
      create: (input: CreateNoteInput) => Promise<NoteResult>;
      update: (input: UpdateNoteInput) => Promise<NoteResult>;
    },
  ) {
    this.saved = options.updatedAt ? fingerprint(options.draft) : null;
    this.state = {
      draft: options.draft,
      updatedAt: options.updatedAt,
      dirty: !options.updatedAt,
      saving: false,
      error: null,
    };
  }

  getSnapshot = (): SaveState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setActive(active: boolean): void {
    this.active = active;
  }

  /** Empty local drafts may be discarded only when no write still needs acknowledgement. */
  canLeaveEmpty(): boolean {
    return (
      !this.inFlight &&
      !this.unacknowledged &&
      !this.state.draft.title.trim() &&
      !hasNoteText(this.state.draft.contentJson)
    );
  }

  /** Stop queued writes without discarding local text or an uncertain acknowledgement. */
  async pause(): Promise<void> {
    this.paused = true;
    await this.inFlight;
  }

  resume(): void {
    this.paused = false;
  }

  change(draft: NoteDraft): void {
    this.publish({
      draft: { title: draft.title, contentJson: copyDocument(draft.contentJson) },
      ...(this.state.error?.code === "VALIDATION_ERROR" ? { error: null } : {}),
    });
  }

  private publish(patch: Partial<SaveState>): void {
    this.state = { ...this.state, ...patch };
    this.state.dirty = this.unacknowledged !== null || fingerprint(this.state.draft) !== this.saved;
    for (const listener of this.listeners) listener();
  }

  save = (): Promise<SavedNote | null> => {
    if (this.inFlight) return this.inFlight;
    if (!this.active || this.paused || this.state.error?.code === "CONFLICT")
      return Promise.resolve(null);
    // Defer execution one microtask so even a synchronous error cannot race this assignment.
    this.inFlight = Promise.resolve()
      .then(() => this.drain())
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  };

  private async drain(): Promise<SavedNote | null> {
    this.publish({ saving: true, error: null });
    try {
      while (this.active && !this.paused && this.state.dirty) {
        // Reconcile a possibly committed write first; never send newer incomplete edits.
        if (!this.unacknowledged) {
          const errors = requiredNoteFields(this.state.draft);
          const message = errors.title;
          if (message) {
            this.publish({ error: { code: "VALIDATION_ERROR", message } });
            return null;
          }
        }
        // A failed connection may have lost a successful response. Replay that
        // exact write first, then use its revision to save any newer local edits.
        const retrying = this.unacknowledged !== null;
        const { draft, updatedAt } = (this.unacknowledged ??= {
          draft: this.state.draft,
          updatedAt: this.state.updatedAt,
        });
        const sent = fingerprint(draft);
        const result = updatedAt
          ? await this.options.update({
              id: this.options.id,
              ...draft,
              expectedUpdatedAt: updatedAt,
            })
          : await this.options.create({ id: this.options.id, ...draft });
        if (result.error) {
          // A definitive rejection of a fresh attempt permits correcting its input.
          // An auth/server failure during replay doesn't resolve the earlier write.
          if (!retrying || result.error.code === "VALIDATION_ERROR") this.unacknowledged = null;
          this.publish({ error: result.error });
          return null;
        }
        this.unacknowledged = null;
        this.saved = sent;
        this.publish({ updatedAt: result.data.updatedAt });
      }
      return this.state.updatedAt ? { id: this.options.id, updatedAt: this.state.updatedAt } : null;
    } catch {
      this.publish({
        error: {
          code: "INTERNAL_ERROR",
          message: "Could not connect. Your changes are still here. Try saving again.",
        },
      });
      return null;
    } finally {
      this.publish({ saving: false });
    }
  }
}
