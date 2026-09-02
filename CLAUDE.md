# Skyward Masters — Bug Tracker

## Project overview
A web-based bug reporting tool for **Skyward Masters**, an indie arena shooter developed by Trinor Entertainment (small indie studio, ~5 people). A static site (`index.html` + `styles.css` + `app.js`) hosted on GitHub Pages, with Supabase as the backend database.

The tool has two sides:
- **Public submission form** — anyone (testers, players) can submit a bug report without logging in
- **Staff dashboard** — password-protected view for the team to manage, sort, and action reports

---

## Tech stack
- **Frontend**: Three files — `index.html` (markup), `styles.css` (all styles), `app.js` (all logic). Vanilla HTML, CSS, JavaScript. No build tools, no frameworks.
- **Hosting**: GitHub Pages (auto-deploys on every push to `main`)
- **Database**: Supabase (Postgres)
- **File storage**: Supabase Storage bucket `bug-attachments` — files uploaded on submit, public URLs stored in the `files` column

---

## Supabase credentials
- **Project URL**: `https://jzrkmegsnxknfubhdoqf.supabase.co`
- **Anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cmttZWdzbnhrbmZ1Ymhkb3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjM1MDgsImV4cCI6MjA4OTMzOTUwOH0.ZavnKQy2mIi9U9pKYVJItF_-j7nxs0kPAvH5wCKupDg`
- **Supabase JS SDK**: loaded via CDN (`cdn.jsdelivr.net/npm/@supabase/supabase-js@2`)
- The anon key is intentionally in `index.html` — it is safe to expose in a frontend app. Security is enforced by RLS policies, not by hiding the key.

---

## Database tables

### `bugreports`

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial | Primary key, auto-increment |
| `title` | text | Bug title |
| `name` | text | Reporter name |
| `category` | text | Gameplay, Audio, UI / HUD, Networking / multiplayer, Performance / crashes, Visuals / rendering, Other |
| `severity` | text | low / medium / high / critical |
| `status` | text | open / in-progress / resolved / merged |
| `repro` | text | Step-by-step reproduction steps |
| `expected` | text | Expected vs actual behavior |
| `files` | text | Comma-separated public storage URLs |
| `merged_into` | bigint | ID of the primary report this was merged into, nullable |
| `assigned_to` | uuid | FK to `profiles.id`, nullable |
| `user_id` | uuid | Submitter's auth user, nullable — only set when the reporter was logged in. Anonymous public submissions are `null`. Testers' dashboards filter on this. |
| `date` | bigint | Unix timestamp in milliseconds |

### `profiles`

Stores staff user info, linked to Supabase Auth.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key, matches `auth.users.id` |
| `email` | text | |
| `display_name` | text | Nullable |
| `role` | text | admin / developer / tester |
| `must_reset_password` | boolean | True for new users created by an admin — forces password change on first login |

### `comments`

Activity log and comments per bug report.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial | Primary key |
| `bug_id` | bigint | FK to `bugreports.id` — cascades on delete |
| `user_id` | uuid | FK to `auth.users.id` |
| `display_name` | text | Snapshot of the user's name at time of posting |
| `body` | text | Comment text or activity message |
| `is_activity` | boolean | True = auto-generated activity entry, False = manual comment |
| `created_at` | bigint | Unix timestamp in milliseconds |

### `notifications`

Unread markers driving the dashboard highlight. A row is created when someone comments on a report they did not submit.

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial | Primary key |
| `user_id` | uuid | Recipient — FK to `auth.users.id`, cascades on delete |
| `bug_id` | bigint | FK to `bugreports.id` — cascades on delete |
| `comment_id` | bigint | FK to `comments.id`, nullable |
| `actor_name` | text | Who triggered it, snapshotted like `comments.display_name` |
| `body` | text | Comment preview, truncated to 140 chars |
| `read_at` | bigint | Null = unread. Unix timestamp in milliseconds |
| `created_at` | bigint | Unix timestamp in milliseconds |

Schema and policies live in `supabase/notifications.sql` — run once in the SQL editor. Until it is run, `loadNotifications()` fails quietly and the app behaves as if there are no notifications.

### Supabase functions (run in SQL editor)

Two custom Postgres functions exist:
- `get_my_role()` — returns the current authenticated user's role from `profiles`. Used by RLS policies.
- `delete_auth_user(user_id uuid)` — deletes a user from `auth.users`. Called from the frontend when an admin removes a user. Uses `SECURITY DEFINER` so no service role key is needed client-side.

### RLS policies

RLS is **enabled** on `bugreports`, `comments`, and `profiles`. The full policy SQL is saved in `supabase/rls-policies.sql`. Summary:
- `bugreports`: public INSERT (submit form), authenticated SELECT, admin/developer UPDATE, admin DELETE
- `comments`: authenticated SELECT and INSERT (staff only, insert only as themselves)
- `profiles`: authenticated SELECT, admin INSERT/UPDATE/DELETE, users can UPDATE their own row
- `notifications`: users SELECT/UPDATE/DELETE only their own rows; any authenticated user can INSERT a row *for someone else* (deliberately permissive — the recipient is by definition another user), constrained to real `bug_id`s and to `auth.uid() <> user_id`

---

## Current features
- Public bug submission form (title, name, category, severity, repro steps, expected vs actual, file attachments)
- File attachments: PNG, JPG, and TXT/log files only — validated client-side. Files uploaded to Supabase Storage, URLs stored in DB. Drag-and-drop supported on the file drop zone. Image thumbnails shown after adding files.
- Staff login via Supabase Auth (email + password)
- First-login flow: new users created by an admin are forced to set their own password before accessing the dashboard (`must_reset_password` flag on `profiles`)
- Role-based access:
  - **Tester**: submit reports only
  - **Developer**: view dashboard, update status and assignee, post comments
  - **Admin**: full access — create/remove users, delete reports, merge, change any field
- Admin user management modal: create users (sets `must_reset_password: true`), change roles, send password reset emails, remove users (deletes from both `profiles` and `auth.users`)
- Staff dashboard with stats (open, in-progress, resolved, critical)
- Search, filter by severity/status/category, sort by date or severity
- Click a report to open a detail side panel
- Assignee field — assign reports to a developer from the detail panel
- Change status from the detail panel (open → in-progress → resolved → merged)
- Select multiple reports and merge as duplicates
- Remove individual reports (admin only, also removes attachments from storage)
- Activity log + comments in the detail panel — comments posted manually by staff, activity entries auto-logged for: status changes, assignee changes, merges
- Comment notifications — commenting on a report notifies its reporter and assignee (never yourself). Unread reports are highlighted amber with a dot on the dashboard, with an "N new" badge in the header; opening a report clears its notifications, and the badge doubles as "mark all read". Only reaches reporters who were logged in when they submitted — anonymous reports have no `user_id` and cannot be notified.
- Toast notifications for actions
- Dark theme UI

---

## Planned features (not yet built)

### 1. Improved merge UI — MEDIUM PRIORITY
The basic merge function exists but needs polish:
- Clearly indicate which report is the "primary" when merging
- Show merged reports visibly linked in the detail panel with a reference/link back to the primary
- Option to unmerge

### 2. In-game bug reporter (Unreal Engine) — LOW PRIORITY / NICE TO HAVE
An in-game widget in Skyward Masters (Unreal Engine 5, Blueprint-only workflow) that lets players submit bug reports without leaving the game. Approach:
- UMG widget with a short form (title, description, severity)
- HTTP POST request using UE's HTTP module or Blueprint HTTP nodes
- Posts directly to Supabase REST API with the anon key
- No middleman server needed

### 3. Other ideas noted (not prioritised)
- Email notifications on new reports or status changes (Supabase Edge Functions)
- Duplicate detection on submit
- Bulk status change
- Report ID shown on each card
- Pagination / infinite scroll
- Markdown support in repro/expected fields
- Public read-only status page for testers

---

## Repo structure

```
index.html           — markup
styles.css           — all styles
app.js               — all logic
supabase/
  rls-policies.sql   — all RLS policies and helper functions to run in Supabase SQL editor
  notifications.sql  — notifications table + policies, run once after rls-policies.sql
CLAUDE.md            — this file
```

---

## Deployment
- Repo is on GitHub, hosted via GitHub Pages
- The entire app is `index.html`, `styles.css` and `app.js` in the root of the repo
- Push to `main` → GitHub Actions builds and deploys automatically (~1-2 min)
- Hard refresh (`Ctrl+Shift+R`) after deploy to bypass browser cache

---

## Developer context
- Studio: Trinor Entertainment, small indie team (~5 people), based in Denmark
- Game: Skyward Masters — arena shooter, 16 players, 4 teams, Bedwars-inspired FPS, targeting 2027 Early Access
- Engine: Unreal Engine 5, Blueprint-only workflow
- Version control: Perforce (P4V/Helix Core) for the game project; GitHub for this web tool
- The developer (Dani) is the Technical Lead — comfortable with technical tasks but prefers simple, maintainable solutions over over-engineered ones
- Keep the app to the **three root files** (`index.html`, `styles.css`, `app.js`) — no build tools or further splitting unless there is a very strong reason
