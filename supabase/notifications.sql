-- ============================================================
--  Skyward Masters Bug Tracker — Notifications
--  Run this once in the Supabase SQL editor (after rls-policies.sql).
--
--  A notification row is created when someone posts a comment on a
--  report they did not submit. Recipients are the report's author
--  (bugreports.user_id) and its assignee (bugreports.assigned_to),
--  never the person who wrote the comment.
-- ============================================================


CREATE TABLE IF NOT EXISTS notifications (
  id         bigserial PRIMARY KEY,
  user_id    uuid   NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE, -- recipient
  bug_id     bigint NOT NULL REFERENCES bugreports(id)   ON DELETE CASCADE,
  comment_id bigint          REFERENCES comments(id)     ON DELETE CASCADE,
  actor_name text,          -- who triggered it, snapshotted like comments.display_name
  body       text,          -- short preview of the comment
  read_at    bigint,        -- null = unread. Unix ms.
  created_at bigint NOT NULL
);

-- The dashboard only ever asks for one user's unread rows, newest first.
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (user_id, read_at, created_at DESC);


-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- You can only ever see your own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
ON notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Any staff member can create a notification *for someone else* — this is what
-- posting a comment does. Deliberately permissive: the recipient is another
-- user, so it cannot be narrowed to auth.uid() = user_id. It is scoped so a
-- row must point at a real report and name the sender honestly.
DROP POLICY IF EXISTS "Staff can notify others" ON notifications;
CREATE POLICY "Staff can notify others"
ON notifications FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() <> user_id
  AND EXISTS (SELECT 1 FROM bugreports WHERE id = bug_id)
);

-- Marking your own notifications as read
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Clearing your own notifications
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications"
ON notifications FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
