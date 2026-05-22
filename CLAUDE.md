# Skyward Masters — Bug Tracker

## Project overview
A web-based bug reporting tool for **Skyward Masters**, an indie arena shooter developed by Trinor Entertainment (small indie studio, ~5 people). Built as a single HTML file hosted on GitHub Pages, with Supabase as the backend database.

The tool has two sides:
- **Public submission form** — anyone (testers, players) can submit a bug report without logging in
- **Staff dashboard** — password-protected view for the team to manage, sort, and action reports

---

## Tech stack
- **Frontend**: Single `index.html` file — vanilla HTML, CSS, JavaScript. No build tools, no frameworks.
- **Hosting**: GitHub Pages (auto-deploys on every push to `main`)
- **Database**: Supabase (Postgres)
- **File storage**: Not yet implemented — filenames are stored as text only

---

## Supabase credentials
- **Project URL**: `https://jzrkmegsnxknfubhdoqf.supabase.co`
- **Anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cmttZWdzbnhrbmZ1Ymhkb3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjM1MDgsImV4cCI6MjA4OTMzOTUwOH0.ZavnKQy2mIi9U9pKYVJItF_-j7nxs0kPAvH5wCKupDg`
- **Supabase JS SDK**: loaded via CDN (`cdn.jsdelivr.net/npm/@supabase/supabase-js@2`)

---

## Database table: `bugreports`

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
| `files` | text | Comma-separated filenames (not actual file content) |
| `merged_into` | bigint | ID of the primary report this was merged into, nullable |
| `date` | bigint | Unix timestamp in milliseconds |

RLS (Row Level Security) is currently **disabled** on this table.

---

## Current features
- Public bug submission form (title, name, category, severity, repro steps, expected vs actual, file attachments as filenames)
- Staff login (currently hardcoded: `admin` / `skyward`)
- Staff dashboard with stats (open, in-progress, resolved, critical)
- Search, filter by severity/status/category, sort by date or severity
- Click a report to open a detail side panel
- Change status from the detail panel (open → in-progress → resolved → merged)
- Select multiple reports and merge as duplicates
- Remove individual reports
- Toast notifications for actions
- Dark theme UI

---

## Planned features (not yet built)

### 1. User accounts with roles — HIGH PRIORITY
Replace the hardcoded login with proper **Supabase Auth**. Requirements:
- Role types: **Admin**, **Developer**, **Tester**
- Admins can create new users and assign roles from inside the dashboard
- Role-based access:
  - Tester: submit reports only (no dashboard access)
  - Developer: view dashboard, update status, add comments
  - Admin: full access — create users, delete reports, merge, change any field
- A `users` table (or Supabase Auth metadata) to store role per user
- Password reset via email (Supabase Auth handles this)

### 2. Improved merge UI — MEDIUM PRIORITY
The basic merge function exists but needs polish:
- Clearly indicate which report is the "primary" when merging
- Show merged reports visibly linked in the detail panel with a reference/link back to the primary
- Option to unmerge

### 3. Actual file uploads — MEDIUM PRIORITY
Currently only filenames are stored as text. Needs:
- Supabase Storage bucket for bug report attachments
- Upload file on submit, store the public URL in the database
- Clickable links in the detail panel so staff can view/download attachments

### 4. In-game bug reporter (Unreal Engine) — LOW PRIORITY / NICE TO HAVE
An in-game widget in Skyward Masters (Unreal Engine 5, Blueprint-only workflow) that lets players submit bug reports without leaving the game. Approach:
- UMG widget with a short form (title, description, severity)
- HTTP POST request using UE's HTTP module or Blueprint HTTP nodes
- Posts directly to Supabase REST API with the anon key
- No middleman server needed

---

## Deployment
- Repo is on GitHub, hosted via GitHub Pages
- The entire app is `index.html` in the root of the repo
- Push to `main` → GitHub Actions builds and deploys automatically (~1-2 min)
- Hard refresh (`Ctrl+Shift+R`) after deploy to bypass browser cache

---

## Developer context
- Studio: Trinor Entertainment, small indie team (~5 people), based in Denmark
- Game: Skyward Masters — arena shooter, 16 players, 4 teams, Bedwars-inspired FPS, targeting 2027 Early Access
- Engine: Unreal Engine 5, Blueprint-only workflow
- Version control: Perforce (P4V/Helix Core) for the game project; GitHub for this web tool
- The developer (Dani) is the Technical Lead — comfortable with technical tasks but prefers simple, maintainable solutions over over-engineered ones
- Keep the app as a **single HTML file** unless there is a very strong reason to split it
