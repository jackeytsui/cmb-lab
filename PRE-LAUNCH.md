# Pre-Launch Must-Dos

Everything that needs to happen before going live in production.

---

## CRITICAL - Will Break Without These

### Mux Video Webhook
- [ ] In Mux dashboard → Settings → Webhooks → Add endpoint
- [ ] URL: `https://YOUR-DOMAIN.com/api/admin/mux/webhook`
- [ ] Copy signing secret → set `MUX_WEBHOOK_SECRET` in production env
- **Why:** Without this, uploaded videos stay stuck on "processing" forever — status never updates to "ready"

### Clerk Auth - Switch to Production
- [ ] In Clerk dashboard, create a **production instance** (current keys are `test` keys)
- [ ] Update `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (production key, starts with `pk_live_`)
- [ ] Update `CLERK_SECRET_KEY` (production key, starts with `sk_live_`)
- [ ] Configure your production domain in Clerk

### App URL
- [ ] Change `NEXT_PUBLIC_APP_URL` from `http://localhost:3000` to your real domain (e.g. `https://yourdomain.com`)

### Upstash Redis - Rate Limiting
- [ ] Sign up at [upstash.com](https://upstash.com) and create a Redis database
- [ ] Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- **Why:** Without this there's zero rate limiting on API routes — anyone can spam your OpenAI/Mux bills

---

## IMPORTANT - Features Won't Work Without These

### Azure Speech (Pronunciation Scoring + TTS)
- [ ] Sign up for Azure Cognitive Services → Speech
- [ ] Set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`
- **Why:** Pronunciation scoring and server-side TTS won't work without this

### n8n Webhook Auth
- [ ] Set `N8N_WEBHOOK_AUTH_HEADER` to a real secret (shared with your n8n workflows)
- **Why:** Without auth, anyone could call your grading webhooks

### CRON_SECRET
- [ ] Generate a random secret string and set `CRON_SECRET`
- **Why:** Protects scheduled job endpoints from unauthorized access

### ENROLLMENT_WEBHOOK_SECRET
- [ ] Set to a real secret for enrollment webhook verification

---

## OPTIONAL - Nice to Have

### GoHighLevel CRM
- [ ] Set `GHL_API_TOKEN` and `GHL_LOCATION_ID` if using GHL for student CRM
- Skip if not using GoHighLevel

---

## GoHighLevel (GHL) to LMS Migration Strategy

Strategy for moving existing students from GHL CRM to the new LMS.

### 1. Invitation & Onboarding
- [ ] Prepare an email campaign in GHL targeting existing active students.
- [ ] Include a unique registration link to the LMS (e.g., `https://your-lms.com/sign-up`).
- [ ] **Constraint:** Students MUST use the same email address in the LMS as they do in GHL to ensure data continuity and future auto-linking.

### 2. Manual Access Management
- [ ] For "VIP" or early-access students, use the **Course Access Management** section in the Admin Student Detail page to manually grant/revoke course access.
- [ ] Access this by navigating to `Admin > Students > [Click Student] > Course Access Management`.

### 3. Data Source of Truth
- **GoHighLevel:** Remains the source of truth for core contact data (Email, Phone, CRM Tags). This is synced as read-only in the LMS.
- **LMS SQL Database:** The source of truth for all learning data (Quiz answers, Lesson progress, Video watch time, Grades).
- **Strategy:** All administrative changes (refunding, updating contact info) should happen in GHL. All educational monitoring happens in the LMS Admin Panel.

---

## Environment Variables Summary

| Variable | Status | Priority |
|----------|--------|----------|
| `DATABASE_URL` | Set (Neon) | Done |
| `CLERK_*` keys | Test keys - need production | CRITICAL |
| `MUX_TOKEN_ID` | Set | Done |
| `MUX_TOKEN_SECRET` | Set | Done |
| `MUX_WEBHOOK_SECRET` | placeholder | CRITICAL |
| `OPENAI_API_KEY` | Set | Done |
| `UPSTASH_REDIS_*` | placeholder | CRITICAL |
| `N8N_*_WEBHOOK_URL` | Set | Done |
| `N8N_WEBHOOK_AUTH_HEADER` | placeholder | IMPORTANT |
| `AZURE_SPEECH_KEY` | placeholder | IMPORTANT |
| `AZURE_SPEECH_REGION` | Set (eastus) | Done |
| `NEXT_PUBLIC_APP_URL` | localhost | CRITICAL |
| `CRON_SECRET` | placeholder | IMPORTANT |
| `ENROLLMENT_WEBHOOK_SECRET` | placeholder | IMPORTANT |
| `GHL_*` | placeholder | Optional |

---

## Deployment Checklist

- [ ] All env vars above set in hosting provider (Vercel/etc)
- [ ] Run `npm run db:generate && npm run db:migrate` against production DB
- [ ] Verify Clerk production domain is configured
- [ ] Set up Mux webhook pointing to production URL
- [ ] Test video upload end-to-end in production
- [ ] Test sign-up/sign-in flow
- [ ] Test AI features (reader translations, article generation)
- [ ] Verify rate limiting is active (check Upstash dashboard)
