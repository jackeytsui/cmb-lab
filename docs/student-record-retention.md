# Student expiry and record retention

- Use **Expire access**, not delete, when a student leaves or their term ends.
- Keep the user row, coach assignments, tags, enrollments, progress and coaching history.
- Admins and assigned coaches retain their existing record permissions; expiry does not broaden coach access.
- The single and bulk legacy delete endpoints reject student records before mutating any account.
- Expired/paused access uses a durable Clerk ban when supported by the plan. Otherwise it uses a Clerk lock (renewed every scheduled pass) and revokes active sessions. The app also denies expired real students when resolving authenticated access. Portal labels remain `expired` / `paused`.
- Only bans marked in private metadata as `cmbPortalLoginBlockManaged` can be lifted by the access controls. Independent security bans require separate review.
- Reactivation requires an explicit Active change and a non-expired course end date (or explicit removal of the date). Omitting a date in a status-only request preserves it.
- Date-only end dates are valid through 23:59:59.999 UTC on that day, matching existing stored end-of-day timestamps.

## Scheduled enforcement

`/api/cron/student-access-expiry` runs every 15 minutes, authenticated with `CRON_SECRET`. The dashboard also denies expired access and enforces the block on visits. A scheduled run can lag a newly passed end date by up to 15 minutes; it is not an exact-to-the-second sign-in cutoff.

The job reads non-deleted student accounts only. It never restores records, reactivates access, changes GHL, or sends email. `?dryRun=true` reports proposed restrictions or lock renewals without mutations. Missing Clerk users and provider failures produce an error response rather than a false success; subsequent scheduled runs retry unresolved restrictions. The current Clerk plan supports locks but rejects bans (402), so recurring lock renewal must remain enabled. No subscription upgrade is required or performed.

Clerk metadata/ban updates also generate `user.updated` events. The webhook only synchronizes changed email addresses to GHL; account-status changes do not cause CRM email writes.

## Historical repair

Restore a hidden student only after verifying their identity and reason for removal. First enforce/verify the expired sign-in block, then clear that specific user's `deleted_at`. Compare session/note/progress counts and content hashes before and after. Preserve coach assignments. Do not bulk-restore deliberately removed test/internal accounts or ambiguous deletions.
