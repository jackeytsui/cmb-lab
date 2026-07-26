# Communication Templates

Variables use the invite-email placeholder syntax already supported by the invitations API: `{{first_name}}`, `{{student_name}}`, `{{email}}`, `{{portal_link}}`. Section/lesson/coach/end-date values are mail-merged from the normalized import sheet at send time (GHL email builder or Resend batch).

> ⚠️ The current default invite copy in the app ("beta test version… try it out for fun", signed "Jackey, Head of Operations") **must be replaced** with Template 2 before any migration email goes out. It lives in `AddUserQuickDialog.tsx` (hardcoded) and `StudentInvitePanel.tsx` (localStorage default) — see `engineering-gaps.md`.

---

## 1 · T-14 Heads-up (from Sheldon, via GHL)

**Subject:** Something big is coming to your Chinese learning 🎉

Hi {{first_name}},

Over the past year we've been building something I'm really proud of: **CMB Lab** — a learning platform we designed from scratch around how you actually learn Chinese, instead of squeezing lessons into generic course software.

What's different:

- **Videos that make sure you've got it** — lessons pause at key moments and you type or speak your answer before moving on. Instant AI feedback, unlimited retries.
- **Pronunciation scoring** down to individual tones.
- **A built-in Chinese reader and dictionary** (145,000+ entries, Cantonese and Mandarin side by side).
- **Streaks, daily goals, and progress you can see.**

Here's the important part: **everything carries over.** Your progress, your remaining access time, your coach — all of it. You don't need to do anything today.

In about two weeks you'll get one email with your personal access link. One click, and you'll be exactly where you left off.

Talk soon,
Sheldon

---

## 2 · T-0 Invitation (replaces the default invite email)

**Subject:** {{first_name}}, your CMB Lab is ready — pick up at Lesson {LESSON_N}

Hi {{first_name}},

Your new home for the Canto to Mando Blueprint is ready.

**We saved your spot:** you're on **{SECTION}, Lesson {LESSON_N}**, and your plan runs until **{END_DATE}** — plus we've added **14 bonus days** to say thanks for making the switch.

**[Open my CMB Lab →]({{portal_link}})**

Two things to know:

1. Sign in with **this email address** ({{email}}) — it's how we matched up all your progress.
2. First login takes about 5 minutes: a quick tour, then your course, right where you left off.

{COACH_FIRST_NAME} is already set up as your coach in there and will see your work the moment you submit it.

If anything looks off — wrong lesson, wrong dates, anything — just reply to this email and we'll fix it within 48 hours.

See you inside,
The CMB Team

*P.S. The old course portal stays available (read-only) until {READONLY_DATE}, so nothing disappears overnight.*

---

## 3 · T+3 Nudge (non-activated only)

**Subject:** {{first_name}}, Lesson {LESSON_N} is waiting for you

Hi {{first_name}},

Quick one — your CMB Lab account is ready and your spot at **{SECTION}, Lesson {LESSON_N}** is saved.

**[Jump back in →]({{portal_link}})**

It takes about 5 minutes to get set up (no password needed — we'll email you a code).

Stuck or short on time? Reply here and we'll walk you through it, or hop on a 10-minute setup call with us: {SUPPORT_BOOKING_LINK}

— The CMB Team

---

## 4 · T+7 Final nudge (non-activated only)

**Subject:** The old portal goes read-only on {READONLY_DATE}

Hi {{first_name}},

Heads-up: on **{READONLY_DATE}** the old course portal switches to read-only, and everything new — lessons, homework, coach feedback — happens in CMB Lab.

Your progress is already moved over. One click to claim it:

**[Open my CMB Lab →]({{portal_link}})**

Your plan (running until {END_DATE}) is unaffected either way — we just don't want you losing momentum.

Need a hand? Reply to this email. A real person answers.

— The CMB Team

---

## 5 · Coach announcement (internal, T-21)

**Subject:** CMB Lab migration — what changes for you + one ask

Team,

We're moving all students from the GHL course area into CMB Lab on {CUTOVER_DATE}. What changes for you:

- **All new homework and reviews happen in CMB Lab** from cutover day. The GHL portal becomes read-only reference.
- Your review queue, Loom feedback, coaching-material tool, and student end-dates are all in the coach hub — training session on {TRAINING_DATE} covers everything.
- During the first two weeks you'll get a **daily list of your students who haven't activated yet** — a personal nudge from you converts better than any email we send.

**The one ask (deadline {SIGNOFF_DATE}):** you'll get a sheet listing each of your students with their section, lesson number, end date, and 1:1 status. Please verify every row — this is what decides where each student lands on day one. A wrong lesson placement is the fastest way to lose a student's trust, and you know their real position better than any spreadsheet.

Flag anything off directly in the sheet. Nothing gets imported for a student until their row is confirmed.

{OPS_NAME}

---

## 6 · Post-activation welcome (in-app notification + email, T+1 after first login)

**Subject:** You're in! Here's your 60-second map of CMB Lab

Hi {{first_name}},

Great to see you inside. Three things worth knowing:

1. **Your course** picks up at {SECTION}, Lesson {LESSON_N} — the player pauses to check your understanding; that's the point 🙂
2. **The Reader** ({APP_URL}/dashboard/reader) turns any text into a lesson with tap-to-define words in both scripts.
3. **Questions about your plan, dates, or coach?** Ask the Lab Assistant (chat bubble, bottom right) — it knows your account.

Your coach {COACH_FIRST_NAME} gets notified the moment you submit work.

Happy learning,
The CMB Team

---

## 6-alt · Rollback email (only if rollback triggered)

**Subject:** A quick update on the new CMB Lab

Hi {{first_name}},

We're taking a little more time to make CMB Lab perfect before moving everyone over. **Nothing changes for you** — keep using the current portal as usual, and your access time is unaffected.

If you already started using CMB Lab, it stays available to you, and your progress there is safe.

We'd rather get this right than get it fast. More soon.

— Sheldon

---

## Send rules

- Respect the `DND` column — DND students get **no automated email**; their coach delivers the invite personally (call/WhatsApp/text per their preference).
- All student emails send through GHL (keeps open/click tracking in the CRM) with Resend as the platform-side fallback for invite delivery.
- Waves: expiring-≤30d first, then per-coach batches. Never send an invite before the student's account, end date, tags, coach, and progress are verified in the reconciliation report.
