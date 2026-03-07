# CI Setup for E2E Tests

This document covers everything needed to run E2E tests in GitHub Actions CI.

## Required GitHub Secrets

The E2E workflow (`.github/workflows/e2e.yml`) references these secrets:

| Secret Name | Description | Where to Find |
|-------------|-------------|---------------|
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key for the test environment | Clerk Dashboard > API Keys |
| `CLERK_SECRET_KEY` | Clerk secret key for the test environment | Clerk Dashboard > API Keys |
| `DATABASE_URL` | Neon Postgres connection string for test/preview DB | Neon Dashboard > Connection Details |
| `E2E_CLERK_STUDENT_EMAIL` | Email of the test student Clerk account | Created manually (see below) |
| `E2E_CLERK_STUDENT_PASSWORD` | Password for the test student account | Set during creation (see below) |
| `E2E_CLERK_COACH_EMAIL` | Email of the test coach Clerk account | Created manually (see below) |
| `E2E_CLERK_COACH_PASSWORD` | Password for the test coach account | Set during creation (see below) |
| `ENROLLMENT_WEBHOOK_SECRET` | Shared secret for enrollment webhook authentication | `.env` or a generated value |

## Creating Test Accounts in Clerk

E2E tests authenticate as real Clerk users via Playwright's global setup. You need two test accounts: one student and one coach.

### Student Account

1. Go to the Clerk Dashboard for your development/test instance.
2. Navigate to Users and click "Create User".
3. Set the email to a dedicated test address (e.g., `e2e-student@yourdomain.com`).
4. Set a password. This becomes the `E2E_CLERK_STUDENT_PASSWORD` secret.
5. If your app uses Clerk roles, assign the "student" role to this user.
6. Save the email as `E2E_CLERK_STUDENT_EMAIL`.

### Coach Account

1. Same process as above but with a coach-specific email (e.g., `e2e-coach@yourdomain.com`).
2. Assign the "coach" role if using Clerk roles.
3. Save as `E2E_CLERK_COACH_EMAIL` and `E2E_CLERK_COACH_PASSWORD`.

### Important Notes

- Use a separate Clerk development instance (not production) for E2E tests.
- These accounts persist between test runs. Playwright's global setup logs in once and saves session state.
- Do not use real user accounts for testing.

## Setting GitHub Secrets

1. Go to your GitHub repository.
2. Navigate to Settings > Secrets and variables > Actions.
3. Click "New repository secret" for each secret listed above.
4. For `DATABASE_URL`, use a Neon preview/test branch connection string, not the production database.

## Local Development

For running E2E tests locally, the same environment variables should be set in `.env.local` (already gitignored). The local workflow is:

```bash
# Ensure .env.local has all required vars
npx playwright test
```

Playwright automatically starts the dev server locally (`npm run dev`) or the production server in CI (`npm run start`). The `webServer` config in `playwright.config.ts` handles this based on the `CI` environment variable.

## How CI Works

The GitHub Actions workflow performs these steps on every PR to `main`:

1. Checks out code and sets up Node.js 22 with npm cache.
2. Runs `npm ci` for reproducible dependency installation.
3. Installs Playwright browsers (Chromium and WebKit).
4. Builds Next.js with `npm run build` (needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at build time).
5. Runs `npx playwright test` which automatically starts `npm run start` via Playwright's webServer config.
6. Uploads the Playwright HTML report as an artifact (retained for 14 days).

If tests fail, download the `playwright-report` artifact from the workflow run to inspect failures locally.
