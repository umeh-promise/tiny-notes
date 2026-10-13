import { describe, expect, test, vi } from "vitest";
import { NoteSaveController } from "./save-controller";
import { emptyDocument, type NoteResult, type UpdateNoteInput } from "./types";

const id = "00000000-0000-4000-8000-000000000001";
const revision = "2026-10-01T00:00:00.000Z";
const draft = {
  title: "First",
  contentJson: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "A thought" }] }],
  },
};
const saved = (updatedAt = revision): NoteResult => ({ data: { id, updatedAt } });

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("editor save queue", () => {
  test("invalid edits never write and correcting them clears validation for autosave", async () => {
    const update = vi.fn(async () => saved());
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: revision,
      create: vi.fn(),
      update,
    });
    controller.change({ ...draft, title: "" });
    expect(await controller.save()).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      dirty: true,
      saving: false,
      error: { code: "VALIDATION_ERROR" },
    });
    controller.change({ ...draft, title: "Completed" });
    expect(controller.getSnapshot().error).toBeNull();
    await controller.save();
    expect(update).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().dirty).toBe(false);
  });

  test("a lost acknowledgement reconciles before rejecting a newer empty title", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce(saved());
    const update = vi.fn();
    const controller = new NoteSaveController({ id, draft, updatedAt: null, create, update });
    await controller.save();
    controller.change({ ...draft, title: "" });
    expect(await controller.save()).toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(update).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      updatedAt: revision,
      dirty: true,
      draft: { title: "" },
    });
  });
  test("a title alone can be saved", async () => {
    const create = vi.fn(async () => saved());
    const controller = new NoteSaveController({
      id,
      draft: { ...draft, contentJson: emptyDocument() },
      updatedAt: null,
      create,
      update: vi.fn(),
    });
    expect(await controller.save()).toEqual({ id, updatedAt: revision });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("only completely empty drafts can leave without saving", () => {
    const controller = new NoteSaveController({
      id,
      draft: { title: " ", contentJson: emptyDocument() },
      updatedAt: null,
      create: vi.fn(),
      update: vi.fn(),
    });
    expect(controller.canLeaveEmpty()).toBe(true);
    controller.change({ ...draft, title: "" });
    expect(controller.canLeaveEmpty()).toBe(false);
    controller.change({ ...draft, contentJson: emptyDocument() });
    expect(controller.canLeaveEmpty()).toBe(false);
    controller.change({ title: "", contentJson: emptyDocument() });
    expect(controller.canLeaveEmpty()).toBe(true);
  });

  test("emptying a draft cannot bypass an outstanding or uncertain write", async () => {
    const pending = deferred<NoteResult>();
    const create = vi.fn(() => pending.promise).mockRejectedValueOnce(new Error("lost response"));
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: null,
      create,
      update: vi.fn(),
    });
    const saving = controller.save();
    controller.change({ title: "", contentJson: emptyDocument() });
    expect(controller.canLeaveEmpty()).toBe(false);
    // Send a valid snapshot, then lose its acknowledgement before clearing it.
    controller.change(draft);
    await saving;
    controller.change({ title: "", contentJson: emptyDocument() });
    expect(controller.canLeaveEmpty()).toBe(false);
  });
  test("pausing for deletion settles the sent write without flushing newer local changes", async () => {
    const pending = deferred<NoteResult>();
    const update = vi.fn(() => pending.promise);
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: revision,
      create: async () => saved(),
      update,
    });
    controller.change({ ...draft, title: "Already sent" });
    const saving = controller.save();
    await Promise.resolve();
    controller.change({ ...draft, title: "Keep locally on deletion failure" });
    const paused = controller.pause();
    pending.resolve(saved());
    await Promise.all([saving, paused]);
    await controller.save();
    expect(update).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      dirty: true,
      draft: { title: "Keep locally on deletion failure" },
    });
    controller.resume();
    await controller.save();
    expect(update).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().dirty).toBe(false);
  });
  test.each(["create", "update"] as const)(
    "a lost %s response is acknowledged before sending newer edits",
    async (operation) => {
      const acknowledged = "2026-10-01T00:00:00.001Z";
      const latest = "2026-10-01T00:00:00.002Z";
      const lost = vi
        .fn()
        .mockRejectedValueOnce(new Error("response lost"))
        .mockResolvedValueOnce(saved(acknowledged));
      const create = operation === "create" ? lost : vi.fn();
      const update =
        operation === "update"
          ? lost.mockResolvedValueOnce(saved(latest))
          : vi.fn(async () => saved(latest));
      const controller = new NoteSaveController({
        id,
        draft,
        updatedAt: operation === "create" ? null : revision,
        create,
        update,
      });
      controller.change({ ...draft, title: "First sent version" });
      expect(await controller.save()).toBeNull();
      controller.change({ ...draft, title: "Newer local version" });
      await controller.save();
      expect(lost.mock.calls[1][0]).toEqual(lost.mock.calls[0][0]);
      expect(update).toHaveBeenLastCalledWith({
        id,
        expectedUpdatedAt: acknowledged,
        title: "Newer local version",
        contentJson: draft.contentJson,
      });
      expect(controller.getSnapshot()).toMatchObject({
        dirty: false,
        error: null,
        updatedAt: latest,
        draft: { title: "Newer local version" },
      });
    },
  );

  test("returning to the saved snapshot clears dirty state without writing", async () => {
    const update = vi.fn(async () => saved());
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: revision,
      create: async () => saved(),
      update,
    });
    controller.change({ ...draft, title: "Temporary" });
    expect(controller.getSnapshot().dirty).toBe(true);
    controller.change(draft);
    expect(controller.getSnapshot().dirty).toBe(false);
    await controller.save();
    expect(update).not.toHaveBeenCalled();
  });

  test("reverting local text after a lost update still reconciles the database", async () => {
    const acknowledged = "2026-10-01T00:00:00.001Z";
    const update = vi
      .fn()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce(saved(acknowledged))
      .mockResolvedValueOnce(saved("2026-10-01T00:00:00.002Z"));
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: revision,
      create: async () => saved(),
      update,
    });
    controller.change({ ...draft, title: "Possibly committed" });
    await controller.save();
    controller.change(draft);
    expect(controller.getSnapshot().dirty).toBe(true);
    await controller.save();
    expect(update).toHaveBeenLastCalledWith({ id, expectedUpdatedAt: acknowledged, ...draft });
    expect(controller.getSnapshot()).toMatchObject({ dirty: false, error: null, draft });
  });

  test("a definitively rejected new draft can be corrected before retrying", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "VALIDATION_ERROR", message: "Invalid input" } })
      .mockResolvedValueOnce(saved());
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: null,
      create,
      update: vi.fn(),
    });
    controller.change({ ...draft, title: "x".repeat(201) });
    await controller.save();
    controller.change({ ...draft, title: "Corrected title" });
    expect(await controller.save()).toEqual({ id, updatedAt: revision });
    expect(create).toHaveBeenLastCalledWith({ id, ...draft, title: "Corrected title" });
    expect(controller.getSnapshot().dirty).toBe(false);
  });

  test.each(["UNAUTHORIZED", "VALIDATION_ERROR", "INTERNAL_ERROR"] as const)(
    "%s preserves newer edits and retries the latest document",
    async (code) => {
      const response = deferred<NoteResult>();
      const update = vi.fn().mockReturnValueOnce(response.promise).mockResolvedValueOnce(saved());
      const controller = new NoteSaveController({
        id,
        draft,
        updatedAt: revision,
        create: async () => saved(),
        update,
      });
      controller.change({ ...draft, title: "Sent" });
      const sending = controller.save();
      await Promise.resolve();
      expect(controller.getSnapshot()).toMatchObject({ dirty: true, saving: true, error: null });
      controller.change({ ...draft, title: "Latest" });
      response.resolve({ error: { code, message: "Could not save" } });
      expect(await sending).toBeNull();
      expect(controller.getSnapshot()).toMatchObject({
        dirty: true,
        saving: false,
        draft: { title: "Latest" },
        error: { code },
      });
      await controller.save();
      expect(update.mock.calls[1][0]).toMatchObject({
        title: "Latest",
        expectedUpdatedAt: revision,
      });
      expect(controller.getSnapshot()).toMatchObject({ dirty: false, saving: false, error: null });
    },
  );

  test("subscribers see completion and can unsubscribe without affecting saving", async () => {
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: null,
      create: async () => saved(),
      update: async () => saved(),
    });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    await controller.save();
    expect(listener).toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ dirty: false, updatedAt: revision });
    unsubscribe();
    listener.mockClear();
    controller.change({ ...draft, title: "More" });
    expect(listener).not.toHaveBeenCalled();
  });

  test("editor attributes become plain snapshots that Server Actions can transport", async () => {
    const attrs = Object.assign(Object.create(null), { level: 2 });
    let submitted: UpdateNoteInput | undefined;
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: revision,
      create: async () => saved(),
      update: async (request) => {
        submitted = request;
        return saved();
      },
    });
    controller.change({
      ...draft,
      contentJson: {
        type: "doc",
        content: [{ type: "heading", attrs, content: [{ type: "text", text: "Heading" }] }],
      },
    });
    attrs.level = 3;
    await controller.save();
    const sentAttrs = submitted?.contentJson?.content?.[0].attrs;
    expect(sentAttrs).toEqual({ level: 2 });
    expect(Object.getPrototypeOf(sentAttrs)).toBe(Object.prototype);
  });
  test("does not rewrite unchanged existing content or surrounding title whitespace", async () => {
    let calls = 0;
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: revision,
      create: async () => saved(),
      update: async () => {
        calls++;
        return saved();
      },
    });
    controller.change({ ...draft, title: " First " });
    await controller.save();
    expect(calls).toBe(0);
    expect(controller.getSnapshot().dirty).toBe(false);
  });

  test("coalesces concurrent saves and sends newer edits only after the first acknowledgement", async () => {
    const first = deferred<NoteResult>();
    const calls: UpdateNoteInput[] = [];
    const nextRevision = "2026-10-01T00:00:00.001Z";
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: revision,
      create: async () => saved(),
      update: async (request) => {
        calls.push(request);
        return calls.length === 1 ? first.promise : saved("2026-10-01T00:00:00.002Z");
      },
    });
    controller.change({ ...draft, title: "Second" });
    const saving = controller.save();
    expect(controller.save()).toBe(saving);
    await Promise.resolve();
    controller.change({ ...draft, title: "Third" });
    expect(calls).toHaveLength(1);
    first.resolve(saved(nextRevision));
    await saving;
    expect(calls.map((call) => call.title)).toEqual(["Second", "Third"]);
    expect(calls[1].expectedUpdatedAt).toBe(nextRevision);
    expect(controller.getSnapshot()).toMatchObject({
      dirty: false,
      saving: false,
      draft: { title: "Third" },
    });
  });

  test("lost creation responses retry with the same draft ID and preserve local content", async () => {
    const ids: string[] = [];
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: null,
      create: async (input) => {
        ids.push(input.id);
        if (ids.length === 1) throw new Error("offline");
        return saved();
      },
      update: async () => saved(),
    });
    expect(await controller.save()).toBeNull();
    expect(controller.getSnapshot()).toMatchObject({
      dirty: true,
      draft,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(await controller.save()).toEqual({ id, updatedAt: revision });
    expect(ids).toEqual([id, id]);
  });

  test("conflicts retain edits and stop additional saves until reload", async () => {
    let calls = 0;
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: revision,
      create: async () => saved(),
      update: async () => {
        calls++;
        return { error: { code: "CONFLICT", message: "Changed elsewhere" } };
      },
    });
    controller.change({ ...draft, title: "Local draft" });
    await controller.save();
    await controller.save();
    expect(calls).toBe(1);
    expect(controller.getSnapshot()).toMatchObject({
      dirty: true,
      draft: { title: "Local draft" },
      error: { code: "CONFLICT" },
    });
  });

  test("unmount stops queued writes while allowing an already sent write to finish", async () => {
    const first = deferred<NoteResult>();
    let calls = 0;
    const controller = new NoteSaveController({
      id,
      draft,
      updatedAt: revision,
      create: async () => saved(),
      update: async () => {
        calls++;
        return first.promise;
      },
    });
    controller.change({ ...draft, title: "Sent" });
    const saving = controller.save();
    await Promise.resolve();
    controller.change({ ...draft, title: "Queued" });
    controller.setActive(false);
    first.resolve(saved());
    await saving;
    expect(calls).toBe(1);
    expect(controller.getSnapshot().dirty).toBe(true);
  });
});
