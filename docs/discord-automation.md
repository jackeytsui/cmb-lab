# Discord Community Automation

Automated management of students in the CMB Discord server. Replaces the
manual workflow of inviting students, creating roles, adding them to private
channels, and removing them when their course ends.

## How it works

Discord membership and roles are a **projection of LMS tags**, and LMS tags
already sync bidirectionally with GoHighLevel. That means the automations you
already run in GHL (tag on purchase, tag on completion, remove tag on expiry)
now drive Discord too — with zero manual steps:

```
GHL workflow tags contact          LMS tag changes (webhook / admin / auto-tag)
        │                                        │
        ▼                                        ▼
  /api/webhooks/ghl  ──────────►  assignTag / removeTag (src/lib/tags.ts)
                                                 │  fire-and-forget
                                                 ▼
                                  Discord sync engine (src/lib/discord/sync.ts)
                                                 │
                        ┌────────────────────────┼───────────────────────┐
                        ▼                        ▼                       ▼
                auto-join server        add/remove roles        kick or strip roles
              (no manual invites)    (per tag→role mapping)    (when access ends)
```

A daily cron (`/api/cron/discord-sync`, 9:00 UTC) reconciles everything as a
safety net — expired access, drifted roles, students who left and came back.

### Student experience

1. Student signs in to CMB Lab and opens **Dashboard → Discord Community**.
2. One click on **Connect Discord** → Discord consent screen (scopes:
   `identify`, `guilds.join`).
3. The bot instantly adds them to the server with the right roles — they never
   need an invite link.
4. When their tags change (new course, completion, expiry), their roles — and
   membership itself — update automatically.

### Admin experience

Everything lives in **Admin → Manage → Discord Community** (`/admin/discord`):

- **Status** — bot/OAuth config health, server name, linked/joined counts,
  "Sync all now" button.
- **Tag → Role mappings** — map any LMS/GHL tag (e.g. `CNPLAB`) to a Discord
  role. You can pick an existing role, auto-create a new one, and optionally
  provision a **private channel** only that role can see. New mappings are
  retro-applied to every student already holding the tag.
  - *Grants server membership* (default on): holding this tag entitles the
    student to be in the server at all. Uncheck for cosmetic/bonus roles.
- **Removal policy** — what happens when a student loses all
  membership-granting tags: **kick from server** (default) or **keep but strip
  student roles**.
- **Linked students** — every linked account with Discord username, guild
  status, tags, last sync, per-student "Sync now".
- **Recent activity** — audit log of every action the automation took
  (joins, role changes, kicks, provisioning), with errors.

## Setup

### 1. Create the Discord application + bot

1. Go to https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → copy the **Token** → `DISCORD_BOT_TOKEN`.
3. **OAuth2** tab → copy **Client ID** → `DISCORD_CLIENT_ID` and
   **Client Secret** → `DISCORD_CLIENT_SECRET`.
4. Still in **OAuth2 → Redirects**, add:
   `https://<your-app-domain>/api/discord/oauth/callback`
   (must match `NEXT_PUBLIC_APP_URL`).

### 2. Invite the bot to your server

Open this URL (replace `CLIENT_ID`), pick your server, authorize:

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot&permissions=268437506
```

That permission set is: Manage Roles, Manage Channels, Kick Members, Create
Instant Invite.

> **Important:** in **Server Settings → Roles**, drag the bot's role **above**
> every role it should manage. Discord only lets a bot manage roles below its
> own.

### 3. Get the server ID

Discord → User Settings → Advanced → enable **Developer Mode**, then
right-click your server icon → **Copy Server ID** → `DISCORD_GUILD_ID`.

### 4. Set the environment variables

In Vercel (and `.env.local` for development):

```
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
```

`NEXT_PUBLIC_APP_URL` and `CRON_SECRET` must already be set (they are used for
the OAuth redirect and the daily cron).

### 5. Apply the database migration

`src/db/migrations/0068_discord_automation.sql` is applied automatically on
the next production deploy (see `scripts/apply-migrations.mjs`), or run it
manually with `node scripts/apply-migrations.mjs --force`.

### 6. Create your first mapping

1. Open `/admin/discord`.
2. Map your enrollment tag (e.g. `CNPLAB` / `Active Student`) to a Discord
   role — use **Create new** to have the bot make the role for you, and tick
   *create a private channel* if the cohort needs its own space.
3. Ask students to connect via **Dashboard → Discord Community** (add this to
   your onboarding email/GHL welcome workflow — the link is
   `https://<your-app-domain>/dashboard/community`).

### 7. Wire up GHL (already done if tag sync is live)

No new GHL configuration is required beyond the existing tag webhook
(`/api/webhooks/ghl`). Any GHL workflow that adds/removes the mapped tags now
controls Discord:

- **New student**: workflow adds the enrollment tag → student's Discord role
  is granted (and they're auto-joined if already linked).
- **Course completed / expired / refunded**: workflow removes the tag → role
  removed; if no membership-granting tag remains, the student is kicked (or
  stripped, per policy).

## Operational notes

- **Students who never link Discord** simply don't appear; nothing breaks.
  Existing community members can link at any time and their state reconciles.
- **Auto-join needs a valid OAuth token.** If a student revokes the app or the
  refresh token expires, the sync marks the connection with an error and the
  student just clicks **Reconnect Discord**. Role changes and kicks for
  members already in the server do NOT need the token — only joining does.
- **Coaches/admins are never kicked** by the automation, regardless of tags.
- **Deleting a mapping** strips that Discord role from all linked students
  holding the tag. **Pausing** a mapping does the same but keeps the config.
- All Discord API calls go through `src/lib/discord/client.ts` (rate-limit
  aware). All actions are recorded in the `discord_audit_log` table and shown
  on the admin page.
- The daily cron (`vercel.json`) runs at 9:00 UTC. Trigger a manual pass any
  time with **Sync all now**.

## Key files

| Area | File |
| --- | --- |
| Schema | `src/db/schema/discord.ts`, migration `0068_discord_automation.sql` |
| REST client | `src/lib/discord/client.ts` |
| OAuth helpers | `src/lib/discord/oauth.ts` |
| Sync engine | `src/lib/discord/sync.ts` |
| Tag hook | `src/lib/tags.ts` (`assignTag` / `removeTag`) |
| Student flow | `/api/discord/oauth/*`, `/dashboard/community` |
| Admin API | `/api/admin/discord/*` |
| Admin UI | `/admin/discord` |
| Cron | `/api/cron/discord-sync` |
