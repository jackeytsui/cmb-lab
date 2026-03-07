# Phase 14: CI/CD Pipeline - Research

**Researched:** 2026-01-30
**Domain:** GitHub Actions CI/CD, Vercel Deployment, Neon Database Branching
**Confidence:** HIGH

## Summary

Phase 14 establishes automated validation and deployment for every code change. The project is a Next.js 16 app deployed on Vercel with a Neon Postgres database using Drizzle ORM. Currently there are no GitHub Actions workflows, no `vercel.json`, and Vercel's built-in GitHub integration is presumably active (default behavior).

The standard approach is a **hybrid model**: keep Vercel's built-in Git integration for automatic preview/production deployments (CICD-03, CICD-04) while adding GitHub Actions workflows for CI checks (CICD-01, CICD-02) and database safety (CICD-06). This avoids the complexity of CLI-based deployment while gaining full CI control. Environment variable separation (CICD-05) is handled natively by Vercel's dashboard with per-environment scoping.

**Primary recommendation:** Use GitHub Actions for lint/typecheck/build/test CI gates on PRs, Vercel's native Git integration for deployments, Neon's GitHub Actions for database branch management and schema diff validation.

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| GitHub Actions | N/A (platform) | CI pipeline runner | Native to GitHub, free for public repos, 2000 min/month free for private |
| Vercel Git Integration | Built-in | Auto-deploy on push/merge | Zero-config, handles preview + production deployments natively |
| `neondatabase/create-branch-action` | v6 | Create Neon DB branch per PR | Official Neon action, instant database copies for preview isolation |
| `neondatabase/delete-branch-action` | v3 | Cleanup DB branches on PR close | Official Neon action, prevents branch sprawl |
| `neondatabase/schema-diff-action` | v1 | Post schema diff as PR comment | Official Neon action, makes DB changes visible in code review |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `actions/checkout` | v4 | Checkout repository | Every workflow |
| `actions/setup-node` | v4 | Setup Node.js with caching | Every workflow needing npm |
| `vercel` CLI | latest | Pull env vars for build | Only if migrating away from built-in integration (not recommended initially) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vercel Git Integration | Vercel CLI via GitHub Actions | Full control but 3x setup complexity, lose auto-preview URLs in PR comments, must manage deploy tokens |
| Neon branching | Single shared preview DB | Simpler but preview deployments share state, risk data conflicts |
| GitHub Actions | Vercel built-in checks | Less control, cannot gate deploys on custom checks |

## Architecture Patterns

### Recommended Workflow Structure

```
.github/
└── workflows/
    ├── ci.yml                    # Lint + typecheck + build on every PR
    ├── e2e.yml                   # E2E test placeholder on every PR
    ├── db-branch-create.yml      # Create Neon branch on PR open
    ├── db-branch-cleanup.yml     # Delete Neon branch on PR close
    └── db-schema-check.yml       # Schema diff comment on PRs with migration changes
```

### Pattern 1: Hybrid Deployment (Vercel Native + GitHub Actions CI)

**What:** Use Vercel's built-in Git integration for deployments while GitHub Actions handles CI validation. GitHub branch protection rules require CI checks to pass before merge.

**When to use:** When deploying to Vercel with a straightforward Git workflow (which this project uses).

**Why this over full GitHub Actions deployment:** Vercel's native integration automatically generates preview URLs, posts PR comments with deployment links, handles environment variable injection, and manages the build cache. Replicating all of this via CLI is significant overhead with little benefit.

**Example CI workflow:**
```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Lint
        run: npm run lint
      - name: TypeScript check
        run: npx tsc --noEmit
      - name: Build
        run: npm run build
        env:
          # Required env vars for build to succeed
          DATABASE_URL: ${{ secrets.DATABASE_URL_PREVIEW }}
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY_PREVIEW }}
          MUX_TOKEN_ID: ${{ secrets.MUX_TOKEN_ID }}
          MUX_TOKEN_SECRET: ${{ secrets.MUX_TOKEN_SECRET }}
```

### Pattern 2: Neon Branch-Per-PR for Database Isolation

**What:** Automatically create an isolated Neon database branch for each PR, run migrations against it, and clean up on PR close.

**When to use:** When PRs may include schema changes and you need to validate migrations without touching production.

**Example:**
```yaml
name: Create DB Branch
on:
  pull_request:
    types: [opened, reopened]

jobs:
  create-branch:
    runs-on: ubuntu-latest
    steps:
      - uses: neondatabase/create-branch-action@v6
        id: create-branch
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch_name: preview/pr-${{ github.event.pull_request.number }}
          api_key: ${{ secrets.NEON_API_KEY }}
      - run: echo "Branch URL: ${{ steps.create-branch.outputs.db_url }}"
```

### Pattern 3: Schema Diff as PR Comment

**What:** Automatically detect schema changes between the PR's Neon branch and the main branch, posting a comment showing the diff.

**When to use:** On every PR that modifies files in the `src/db/` directory to make schema changes visible during code review.

**Example:**
```yaml
name: Schema Diff
on:
  pull_request:
    paths:
      - 'src/db/**'

jobs:
  schema-diff:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: neondatabase/schema-diff-action@v1
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          compare_branch: preview/pr-${{ github.event.pull_request.number }}
          api_key: ${{ secrets.NEON_API_KEY }}
```

### Anti-Patterns to Avoid

- **Disabling Vercel Git Integration prematurely:** Only switch to CLI-based deployments if you need build-time secrets that Vercel can't handle or need to run migrations before deploy. The native integration handles 95% of cases.
- **Running migrations in the CI pipeline against production:** Never run `drizzle-kit migrate` against the production database in CI. Migrations to production should only happen via Vercel's build step or a dedicated post-deploy workflow.
- **Using `NODE_ENV` to distinguish preview from production:** Vercel always sets `NODE_ENV=production` for all deployed environments. Use `VERCEL_ENV` instead (values: `production`, `preview`, `development`).
- **Committing `.env` files or `vercel.json` with secrets:** All environment variables should be managed via Vercel Dashboard and GitHub Secrets. The `.gitignore` already excludes `.env*` files.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Preview deployments | Custom deploy scripts | Vercel Git Integration | Handles URL generation, PR comments, environment scoping automatically |
| Database branch management | Custom Neon API calls | `neondatabase/*-action` v6/v3 | Official actions handle idempotency, error cases, output parsing |
| Schema change visibility | Custom diff scripts | `neondatabase/schema-diff-action` v1 | Posts formatted PR comments, handles branch comparison automatically |
| Environment variable separation | Custom env management | Vercel Dashboard per-environment vars | Built-in encryption, role-based access, per-branch scoping |
| Branch protection | Manual review checklists | GitHub branch protection rules | Enforces CI pass before merge, requires reviews programmatically |

**Key insight:** The entire CI/CD pipeline for this stack can be built with zero custom code -- only YAML configuration files and platform features. Every requirement maps to an existing tool or platform capability.

## Common Pitfalls

### Pitfall 1: Build Failing in CI Due to Missing Environment Variables

**What goes wrong:** The `next build` step fails because it requires environment variables (DATABASE_URL, Clerk keys, etc.) that aren't available in the GitHub Actions runner.
**Why it happens:** Next.js validates environment variables at build time. The Vercel deployment has these set, but the CI runner does not.
**How to avoid:** Add all required environment variables as GitHub Secrets and pass them to the build step. For `NEXT_PUBLIC_*` vars, they must be available during build (not just runtime). Use a separate set of preview/test credentials, never production credentials.
**Warning signs:** Build passes locally but fails in CI with "missing environment variable" errors.

### Pitfall 2: Vercel Deploying Before CI Passes

**What goes wrong:** Vercel's native integration deploys immediately on push, before GitHub Actions CI checks complete. A broken build gets a preview URL.
**Why it happens:** Vercel deploys are independent of GitHub Actions by default.
**How to avoid:** This is acceptable for preview deployments (they're ephemeral). For production, enable GitHub branch protection on `main` requiring CI status checks to pass before merge. Vercel only deploys to production on merge to main, so the CI gate prevents broken production deploys.
**Warning signs:** Preview deployments showing errors that CI would have caught.

### Pitfall 3: Neon Branch Sprawl

**What goes wrong:** Neon branches accumulate as PRs are opened but the cleanup workflow fails or PRs are abandoned.
**Why it happens:** The delete workflow only triggers on PR close. If it fails silently, branches persist.
**How to avoid:** Add error handling to the delete workflow. Consider a scheduled cleanup workflow that removes branches older than 7 days. Monitor Neon branch count in the dashboard.
**Warning signs:** Increasing number of Neon branches visible in the console, potential hitting branch limits.

### Pitfall 4: Schema Diff Not Running Because Branch Doesn't Exist Yet

**What goes wrong:** The schema-diff action runs before the create-branch action completes, or the PR doesn't trigger branch creation (e.g., on `synchronize` events).
**Why it happens:** Race condition between workflows or branch creation only on `opened` events.
**How to avoid:** Either combine branch creation and schema diff into a single workflow with sequential jobs, or ensure the schema diff workflow checks for branch existence before running. Use `needs:` to chain jobs.
**Warning signs:** Schema diff action errors in workflow logs.

### Pitfall 5: Drizzle Migration Validation Gaps

**What goes wrong:** A migration that passes `drizzle-kit generate` locally produces SQL that breaks in CI or production (different Postgres version, missing extensions, etc.).
**Why it happens:** Drizzle's `strict` flag behavior has changed in recent versions. The generated SQL may include statements that are environment-specific.
**How to avoid:** Run migrations against the Neon preview branch in CI. Neon branches use the same Postgres version as production. Use the schema diff action to make changes visible. Always review generated SQL files in PRs.
**Warning signs:** Migration files with `IF NOT EXISTS` or `DO $$` blocks that may behave differently across environments.

## Code Examples

### Complete CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-typecheck-build:
    name: Lint, Typecheck & Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: TypeScript check
        run: npx tsc --noEmit

      - name: Build
        run: npm run build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PREVIEW }}
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_PREVIEW }}
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY_PREVIEW }}
          CLERK_WEBHOOK_SECRET: ${{ secrets.CLERK_WEBHOOK_SECRET_PREVIEW }}
          MUX_TOKEN_ID: ${{ secrets.MUX_TOKEN_ID }}
          MUX_TOKEN_SECRET: ${{ secrets.MUX_TOKEN_SECRET }}
          MUX_WEBHOOK_SECRET: ${{ secrets.MUX_WEBHOOK_SECRET }}
          ENROLLMENT_WEBHOOK_SECRET: ${{ secrets.ENROLLMENT_WEBHOOK_SECRET_PREVIEW }}
```

### E2E Placeholder Workflow

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  pull_request:
    branches: [main]

jobs:
  e2e:
    name: E2E Tests (Placeholder)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: E2E Placeholder
        run: |
          echo "E2E test placeholder - real tests will be added in Phase 16"
          echo "This job exists to establish the CI gate for future E2E tests"
          exit 0
```

### Neon Branch Lifecycle Workflows

```yaml
# .github/workflows/db-branch-create.yml
name: Create Preview DB Branch

on:
  pull_request:
    types: [opened, reopened]

jobs:
  create-branch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: neondatabase/create-branch-action@v6
        id: create-branch
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch_name: preview/pr-${{ github.event.pull_request.number }}
          api_key: ${{ secrets.NEON_API_KEY }}

      - name: Run migrations on preview branch
        run: |
          npm ci
          npx drizzle-kit migrate
        env:
          DATABASE_URL: ${{ steps.create-branch.outputs.db_url }}
```

```yaml
# .github/workflows/db-branch-cleanup.yml
name: Cleanup Preview DB Branch

on:
  pull_request:
    types: [closed]

jobs:
  delete-branch:
    runs-on: ubuntu-latest
    steps:
      - uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch: preview/pr-${{ github.event.pull_request.number }}
          api_key: ${{ secrets.NEON_API_KEY }}
```

### Schema Diff on DB Changes

```yaml
# .github/workflows/db-schema-check.yml
name: Database Schema Check

on:
  pull_request:
    paths:
      - 'src/db/**'

jobs:
  schema-diff:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: neondatabase/create-branch-action@v6
        id: create-branch
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch_name: preview/pr-${{ github.event.pull_request.number }}
          api_key: ${{ secrets.NEON_API_KEY }}

      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install and run migrations
        run: |
          npm ci
          npx drizzle-kit migrate
        env:
          DATABASE_URL: ${{ steps.create-branch.outputs.db_url }}

      - uses: neondatabase/schema-diff-action@v1
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          compare_branch: preview/pr-${{ github.event.pull_request.number }}
          api_key: ${{ secrets.NEON_API_KEY }}
```

### GitHub Branch Protection Setup (Manual Step)

```
Repository Settings > Branches > Branch protection rules > Add rule:
- Branch name pattern: main
- Require status checks to pass before merging: ON
  - Required checks: "Lint, Typecheck & Build", "E2E Tests (Placeholder)"
- Require branches to be up to date before merging: ON
- Do not allow bypassing the above settings: ON (optional, for strict enforcement)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vercel CLI in GitHub Actions for all deploys | Vercel native Git integration + GH Actions for CI only | 2024+ consensus | Simpler setup, better DX, same control for CI gates |
| `neondatabase/create-branch-action@v5` | `neondatabase/create-branch-action@v6` | 2025 | New `role` input, improved idempotency |
| `drizzle-kit push` for CI | `drizzle-kit migrate` for CI | Drizzle ORM 0.34+ | `migrate` uses SQL files (reviewable); `push` is for dev only |
| `actions/checkout@v3` / `actions/setup-node@v3` | `actions/checkout@v4` / `actions/setup-node@v4` | 2024 | Node 20 default, improved caching |
| `NODE_ENV` for env detection | `VERCEL_ENV` for env detection | Always (Vercel-specific) | `NODE_ENV` is always `production` on Vercel |

**Deprecated/outdated:**
- `drizzle-kit push --strict`: The `strict` flag behavior changed in recent Drizzle versions. Use `drizzle-kit migrate` with reviewed SQL files instead.
- `neondatabase/create-branch-action@v5`: Use v6 for latest features and fixes.

## Open Questions

1. **Neon branch limits on current plan**
   - What we know: Neon has branch limits depending on the plan tier.
   - What's unclear: How many concurrent branches the project's current Neon plan supports.
   - Recommendation: Check Neon dashboard for branch limits. If limited, implement aggressive cleanup and consider only creating branches for PRs that modify `src/db/**`.

2. **Build-time environment variables completeness**
   - What we know: The `.env.example` lists DATABASE_URL, Clerk keys, Mux keys, and webhook secrets.
   - What's unclear: Whether all of these are strictly required at build time or only at runtime. Some may cause build failures if missing.
   - Recommendation: Test with `npm run build` locally, removing env vars one by one to determine which are build-critical vs runtime-only. Only build-critical vars need to be in GitHub Secrets.

3. **Production migration strategy**
   - What we know: Drizzle migrations are in `src/db/migrations/`. The Vercel build process does not run migrations automatically.
   - What's unclear: Whether migrations should run as part of the Vercel build step, a separate GitHub Actions workflow on merge to main, or manually.
   - Recommendation: Add a migration step to the production deploy flow. The safest approach is a GitHub Actions workflow triggered on push to main that runs `drizzle-kit migrate` against the production DATABASE_URL before Vercel finishes deploying.

## Sources

### Primary (HIGH confidence)
- [Vercel: How to use GitHub Actions with Vercel](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel) - Complete workflow examples for preview/production
- [Vercel: Environments documentation](https://vercel.com/docs/deployments/environments) - Environment variable scoping
- [Vercel: Environment Variables](https://vercel.com/docs/environment-variables) - Variable management per environment
- [neondatabase/create-branch-action](https://github.com/neondatabase/create-branch-action) - v6 action for creating Neon branches
- [neondatabase/delete-branch-action](https://github.com/neondatabase/delete-branch-action) - v3 action for deleting Neon branches
- [neondatabase/schema-diff-action](https://github.com/neondatabase/schema-diff-action) - v1 action for schema diff PR comments
- [Neon: Automate branching with GitHub Actions](https://neon.com/docs/guides/branching-github-actions) - Official Neon CI/CD guide

### Secondary (MEDIUM confidence)
- [Clerk blog: Automate Neon schema changes with Drizzle and GitHub Actions](https://clerk.com/blog/automate-neon-schema-changes-with-drizzle-and-github-actions) - Drizzle + Neon + GH Actions integration pattern
- [Neon blog: A database for every preview environment](https://neon.com/blog/branching-with-preview-environments) - Architecture for preview DB branches
- [neondatabase/preview-branches-with-vercel](https://github.com/neondatabase/preview-branches-with-vercel) - Reference implementation for Vercel + Neon branching
- [Drizzle ORM Discussion #2624](https://github.com/drizzle-team/drizzle-orm/discussions/2624) - Updated migration process details
- [Drizzle ORM Issue #5249](https://github.com/drizzle-team/drizzle-orm/issues/5249) - Strict flag deprecation context

### Tertiary (LOW confidence)
- Various Medium/DEV.to articles on Next.js CI workflows - Community patterns for lint/typecheck/build steps

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools are official, well-documented platform features (GitHub Actions, Vercel native, Neon official actions)
- Architecture: HIGH - Hybrid model (Vercel native deploy + GH Actions CI) is the documented recommended approach from Vercel itself
- Pitfalls: HIGH - Based on documented known issues (NODE_ENV vs VERCEL_ENV, Drizzle strict flag, env vars at build time)
- Database branching: MEDIUM - Neon actions are well-documented but integration with Drizzle migrate in CI has fewer real-world examples

**Research date:** 2026-01-30
**Valid until:** 2026-03-30 (90 days - stable tools, mature ecosystem)
