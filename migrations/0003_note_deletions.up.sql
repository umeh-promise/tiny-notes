CREATE TABLE note_deletion (
  note_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  deleted_at TEXT NOT NULL
);
CREATE INDEX idx_note_deletion_user ON note_deletion(user_id);
