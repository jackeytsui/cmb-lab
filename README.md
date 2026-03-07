# CantoMando LMS - Interactive Language Learning Platform

> An interactive Learning Management System for teaching Mandarin and Cantonese simultaneously, with AI-powered grading, voice conversation practice, gamification, and comprehensive learning tools.

[![License](https://img.shields.io/badge/license-Private-red.svg)]()
[![Next.js](https://img.shields.io/badge/Next.js-16.1.4-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.3-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

---

## 📋 Table of Contents

- [What is CantoMando?](#-what-is-cantomando)
- [Key Features](#-key-features)
- [Current Status](#-current-status)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Git Workflow](#-git-workflow)
- [Development](#-development)
- [Project Structure](#-project-structure)
- [Environment Variables](#-environment-variables)
- [Contributing](#-contributing)

---

## 🎯 What is CantoMando?

CantoMando is a **premium interactive LMS** that transforms passive video watching into active language learning. Students can't just watch—they must demonstrate understanding at defined checkpoints to progress through lessons.

### Core Value Proposition

**The interactive video player** that forces engagement: students watch video lessons that automatically pause at timestamps, requiring them to type Chinese sentences or record audio. AI grades their responses in real-time, and they must pass to continue.

### Teaching Method

This platform teaches students to **leverage Cantonese knowledge to learn Mandarin**. The AI systems understand this pedagogical approach and help students see connections between the two languages.

### Target Users

- **Students**: Paid learners studying both Mandarin and Cantonese
- **Coaches**: 2-3 instructors who create content and review submissions
- **Admins**: Platform administrators managing courses and users

---

## ✨ Key Features

### 🎥 Interactive Video Learning (v1.0)
- **Auto-pause video player** with Mux integration
- **Text & audio interactions** at defined timestamps
- **AI grading** via n8n webhooks with unlimited retries
- **Linear progression** - must complete lesson N to unlock N+1
- **Voice-to-voice AI bot** for conversation practice
- **Coach review workflow** with Loom video responses

### 📚 Content Management (v1.1)
- **Bulk video upload** with drag-drop queue
- **AI prompts dashboard** with versioning and rollback
- **Knowledge base** with RAG-powered chatbot
- **PDF upload** with auto-chunking for Q&A

### 📊 Analytics & Engagement (v2.0-v5.0)
- **Progress tracking** with completion rates and drop-off analysis
- **XP system** with daily goals and streak tracking
- **Activity rings** (Apple Watch-style) for personal motivation
- **Completion certificates** with Chinese font support
- **PWA support** for installable web app experience

### 📝 Practice & Homework (v4.0)
- **6 exercise types**: MCQ, fill-blank, matching, ordering, audio, free text
- **Visual canvas builder** for drag-and-drop practice set creation
- **Practice assignments** to lessons, modules, courses, students, tags
- **Instant client-side grading** + AI grading for complex responses
- **Azure pronunciation scoring** with per-character tone accuracy

### 📖 Chinese Reader & Dictionary (v6.0)
- **145K+ dictionary entries** (CC-CEDICT + CC-Canto)
- **9.5K+ character data** with radical, etymology, stroke animation
- **Text paste/import** (.txt/.pdf) with encoding detection
- **Word segmentation** with pinyin/jyutping annotations
- **Traditional ↔ Simplified conversion** with HK variants
- **Character popup** with TTS, tone comparison, stroke order
- **Azure TTS** for Mandarin and Cantonese audio
- **Saved vocabulary** list with management

### 🎬 YouTube Listening Lab (v7.0)
- **YouTube embed** with caption extraction
- **Interactive transcript** panel with playback sync
- **Dictionary integration** on transcript words
- **Vocabulary highlighting** (known vs unknown)
- **Loop mode** for section repeat practice
- **Watch progress tracking** and resume

### 🌳 Interactive Video Threads (v8.0)
- **React Flow visual editor** with VideoAsk-style cards
- **Logic branching** with n8n-style rule builder
- **Webcam recording** in builder (WebM → Mux)
- **Thread player** with autoplay and response collection
- **Coach review dashboard** for submissions
- **Thread assignments** with analytics

### 🔐 Role-Based Access (v9.0)
- **Granular permissions** for courses/modules/lessons/features
- **Multi-role assignment** with additive stacking
- **Time-limited roles** with auto-expiration
- **Webhook integration** for automated enrollment
- **Role analytics** with expiration warnings

### 🧠 Mastery & Intelligence (v10.0) ✅ **CURRENT**
- **SRS flashcard system** with FSRS scheduling
- **Smart study engine** with weak-area identification
- **Tone training module** with identification and production drills
- **Assessment system** with adaptive placement and HSK mock tests
- **Grammar library** (browsable, searchable, AI-generated drafts)
- **Auto-exercise generation** from lesson/reader content
- **AI prompt testing lab** for coaches (A/B testing, batch testing)

---

## 📌 Current Status

**Milestone:** v10.0 Mastery & Intelligence ✅ **COMPLETE**
**Phase:** 74/74 (Smart Study Engine)
**Last Updated:** February 16, 2026

### What's Shipped

| Milestone | Phases | Plans | Requirements | Status |
|-----------|--------|-------|--------------|--------|
| v1.0 | 9 | 44 | 44 | ✅ Shipped |
| v1.1 | 4 | 26 | 26 | ✅ Shipped |
| v2.0 | 7 | 23 | 23 | ✅ Shipped |
| v3.0 | 4 | 16 | 16 | ✅ Shipped |
| v3.1 | 5 | 29 | 29 | ✅ Shipped |
| v4.0 | 7 | 45 | 45 | ✅ Shipped |
| v5.0 | 7 | 37 | 37 | ✅ Shipped |
| v6.0 | 6 | 30 | 30 | ✅ Shipped |
| v7.0 | 6 | 14 | 14 | ✅ Shipped |
| v8.0 | 6 | 12 | 12 | ✅ Shipped |
| v9.0 | 7 | 43 | 43 | ✅ Shipped |
| **v10.0** | **6** | **48** | **48** | ✅ **COMPLETE** |

### Recent Changes (v10.0)

- ✅ Phase 69: SRS flashcard system with FSRS scheduling
- ✅ Phase 70: Grammar library with HSK data integration
- ✅ Phase 71: Tone training with production scoring
- ✅ Phase 72: Assessment and placement framework
- ✅ Phase 73: Auto-exercise generation and prompt lab
- ✅ Phase 74: Smart study engine with personalized recommendations

### What's Next

Ready for v11.0 planning - run `/gsd:new-milestone` to begin next cycle.

---

## 🛠 Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **UI**: React 19.2.3
- **Styling**: Tailwind CSS 4 + shadcn/ui components
- **State**: React hooks, XState for complex flows
- **Forms**: React Hook Form + Zod validation
- **Animations**: Framer Motion, canvas-confetti

### Backend
- **Database**: Neon Postgres (serverless)
- **ORM**: Drizzle ORM
- **Auth**: Clerk (role-based access control)
- **API**: Next.js API routes
- **Rate Limiting**: Upstash Redis

### Media & AI
- **Video**: Mux (hosting, playback, upload)
- **AI**: OpenAI GPT-4o-mini, Realtime API
- **Speech**: Azure Speech Services (TTS, pronunciation scoring)
- **Workflows**: n8n (AI grading, content generation)

### External Services
- **CRM**: GoHighLevel integration
- **Analytics**: Custom analytics dashboard
- **Storage**: Vercel Blob (PDFs, fonts, assets)

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have:

- **Node.js**: v20.x or higher ([Download](https://nodejs.org/))
- **npm**: v10.x or higher (comes with Node.js)
- **Git**: Latest version ([Download](https://git-scm.com/))
- **Database**: Access to Neon Postgres instance (credentials provided separately)
- **Clerk Account**: Auth credentials (provided by admin)

### Installation

#### 1. Clone the Repository

```bash
# Clone from GitHub
git clone https://github.com/fdajkffk/New-LMS.git

# Navigate into the project
cd New-LMS
```

#### 2. Install Dependencies

```bash
# Install all packages (this may take a few minutes)
npm install
```

#### 3. Set Up Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Copy the example file
cp .env.example .env.local
```

Then edit `.env.local` with your credentials (ask the team lead for these):

```env
# Database (Neon Postgres)
DATABASE_URL="postgresql://..."

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"

# Mux (Video)
MUX_TOKEN_ID="..."
MUX_TOKEN_SECRET="..."

# OpenAI
OPENAI_API_KEY="sk-..."

# Azure Speech
AZURE_SPEECH_KEY="..."
AZURE_SPEECH_REGION="..."

# n8n Webhooks
N8N_INTERACTION_WEBHOOK_URL="..."
N8N_GRAMMAR_GEN_WEBHOOK_URL="..."
N8N_EXERCISE_GEN_WEBHOOK_URL="..."

# Redis (Upstash)
UPSTASH_REDIS_REST_URL="..."
UPSTASH_REDIS_REST_TOKEN="..."
```

#### 4. Run Database Migrations

```bash
# Generate migration files (if needed)
npm run db:generate

# Apply migrations to database
npm run db:migrate
```

#### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser!

---

## 🔄 Git Workflow

### Understanding the Repository

This is a **team repository** for the New-LMS project. It's extracted from a larger monorepo and contains **only the New-LMS code**.

### Initial Setup (First Time)

If you haven't cloned yet:

```bash
# 1. Clone the repository
git clone https://github.com/fdajkffk/New-LMS.git
cd New-LMS

# 2. Check your current branch
git branch
# Should show: * main

# 3. Verify remote connection
git remote -v
# Should show:
# origin  https://github.com/fdajkffk/New-LMS.git (fetch)
# origin  https://github.com/fdajkffk/New-LMS.git (push)
```

### Daily Workflow

#### Before You Start Working

Always pull the latest changes first:

```bash
# 1. Make sure you're on main branch
git checkout main

# 2. Pull latest changes from GitHub
git pull origin main

# 3. Install any new dependencies
npm install
```

#### Making Changes

```bash
# 1. Check what files you've changed
git status

# 2. Review your changes
git diff

# 3. Stage specific files (recommended)
git add src/app/some-file.tsx
git add src/components/another-file.tsx

# Or stage all changes (use carefully)
git add .
```

#### Committing Changes

```bash
# Create a descriptive commit message
git commit -m "feat: add student dashboard export button

- Add CSV export functionality to student list
- Include progress data and completion rates
- Fix sorting bug on completion column"
```

**Commit Message Format:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code formatting (no logic changes)
- `refactor:` - Code restructuring (no behavior change)
- `test:` - Adding tests
- `chore:` - Build tasks, dependencies

#### Pushing to GitHub

```bash
# Push your commits to GitHub
git push origin main
```

### Handling Conflicts

If you get a conflict when pulling:

```bash
# 1. Stash your changes temporarily
git stash

# 2. Pull latest changes
git pull origin main

# 3. Apply your stashed changes back
git stash pop

# 4. If there are conflicts, Git will mark them in files like:
# <<<<<<< HEAD
# Their changes
# =======
# Your changes
# >>>>>>> Stashed changes

# 5. Edit the files to resolve conflicts, then:
git add <resolved-file>
git commit -m "fix: resolve merge conflicts"
git push origin main
```

### Checking History

```bash
# View commit history
git log --oneline -10

# View what changed in a specific commit
git show <commit-hash>

# View who changed a specific file
git blame src/app/some-file.tsx
```

### Undoing Changes

```bash
# Discard changes to a specific file (before staging)
git checkout -- src/app/some-file.tsx

# Unstage a file (after git add, before commit)
git reset HEAD src/app/some-file.tsx

# Undo last commit (keeps changes in working directory)
git reset --soft HEAD~1

# Completely discard last commit (DANGEROUS)
git reset --hard HEAD~1
```

---

## 💻 Development

### Available Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint

# Database
npm run db:generate      # Generate new migration files
npm run db:migrate       # Run migrations
npm run db:push          # Push schema changes directly (dev only)
npm run db:studio        # Open Drizzle Studio (database GUI)
npm run db:seed          # Seed test data
npm run db:seed-dictionary  # Seed dictionary data (145K+ entries)

# Testing
npm run test:e2e         # Run Playwright tests
npm run test:e2e:ui      # Run tests in UI mode
npm run test:e2e:debug   # Debug tests
npm run test:e2e:headed  # Run tests with browser visible
```

### Development Port

**This project runs on port 3002** (not 3000) because port 3000 is used by another project.

In `package.json`, the dev script is:
```json
"dev": "next dev -p 3002"
```

### Code Quality

Before committing, ensure:

1. **No TypeScript errors**: Run `npm run build` to check
2. **No linting errors**: Run `npm run lint`
3. **Test your changes**: Click through the UI to verify

### Service Worker Cache

**IMPORTANT**: If you make changes and don't see them after refresh:

1. Open DevTools → Application → Service Workers
2. Click "Unregister" on `cantomando-v1`
3. Go to Storage → Clear site data
4. Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)

This is a known issue documented in `.planning/` notes.

---

## 📁 Project Structure

```
New-LMS/
├── .planning/                    # GSD planning artifacts (roadmaps, plans)
│   ├── PROJECT.md               # Project overview and requirements
│   ├── REQUIREMENTS.md          # Detailed feature requirements
│   ├── ROADMAP.md               # Milestone and phase breakdown
│   ├── STATE.md                 # Current project status
│   └── phases/                  # Per-phase planning documents
│       ├── 69-srs-flashcard-system/
│       ├── 70-grammar-library-hsk-data/
│       ├── 71-tone-training/
│       ├── 72-assessment-placement/
│       ├── 73-auto-exercise-generation-prompt-lab/
│       └── 74-smart-study-engine/
│
├── public/                      # Static assets
│   ├── fonts/                   # Custom Chinese fonts
│   └── sw.js                    # Service worker
│
├── scripts/                     # Utility scripts
│   └── seed-dictionary.ts       # Dictionary seeding script
│
├── src/
│   ├── app/                     # Next.js App Router pages
│   │   ├── (auth)/              # Auth pages (sign-in, sign-up)
│   │   ├── (dashboard)/         # Main app (requires auth)
│   │   │   ├── dashboard/       # Student dashboard
│   │   │   ├── coach/           # Coach dashboard
│   │   │   ├── admin/           # Admin panel
│   │   │   └── layout.tsx       # Persistent sidebar layout
│   │   ├── api/                 # API routes
│   │   │   ├── webhooks/        # External webhooks (enrollment, etc.)
│   │   │   ├── lessons/         # Lesson endpoints
│   │   │   ├── practice/        # Practice set endpoints
│   │   │   ├── srs/             # SRS flashcard endpoints
│   │   │   ├── grammar/         # Grammar endpoints
│   │   │   ├── tone/            # Tone training endpoints
│   │   │   ├── assessments/     # Assessment endpoints
│   │   │   └── study/           # Study recommendation endpoints
│   │   └── layout.tsx           # Root layout
│   │
│   ├── components/              # React components
│   │   ├── ui/                  # shadcn/ui base components
│   │   ├── layout/              # Layout components (sidebar, header)
│   │   ├── practice/            # Practice set components
│   │   ├── reader/              # Chinese reader components
│   │   ├── srs/                 # SRS flashcard components
│   │   ├── dashboard/           # Dashboard widgets
│   │   └── ...                  # Other feature components
│   │
│   ├── db/                      # Database layer
│   │   ├── schema/              # Drizzle schema definitions
│   │   │   ├── index.ts         # Main schema exports
│   │   │   ├── courses.ts       # Course-related tables
│   │   │   ├── practice.ts      # Practice set tables
│   │   │   ├── srs.ts           # SRS tables
│   │   │   ├── grammar.ts       # Grammar tables
│   │   │   ├── tone.ts          # Tone training tables
│   │   │   ├── assessment.ts    # Assessment tables
│   │   │   ├── study.ts         # Study engine tables
│   │   │   └── ...              # Other schemas
│   │   ├── migrations/          # Database migration files
│   │   ├── seed.ts              # Test data seeder
│   │   └── index.ts             # Database connection
│   │
│   ├── lib/                     # Shared utilities
│   │   ├── auth.ts              # Auth helpers (Clerk)
│   │   ├── dictionary.ts        # Dictionary utilities
│   │   ├── fsrs.ts              # FSRS algorithm implementation
│   │   ├── srs.ts               # SRS scheduling logic
│   │   ├── study.ts             # Study recommendations
│   │   ├── utils.ts             # General utilities (cn, etc.)
│   │   └── ...                  # Other utilities
│   │
│   └── middleware.ts            # Next.js middleware (auth, rate limiting)
│
├── .env.local                   # Environment variables (DO NOT COMMIT)
├── .env.example                 # Example env file (safe to commit)
├── drizzle.config.ts            # Drizzle ORM configuration
├── next.config.ts               # Next.js configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
└── package.json                 # Dependencies and scripts
```

---

## 🔐 Environment Variables

### Required Variables

```env
# Database
DATABASE_URL                      # Neon Postgres connection string

# Clerk Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY # Public Clerk key
CLERK_SECRET_KEY                  # Secret Clerk key
NEXT_PUBLIC_CLERK_SIGN_IN_URL     # Sign-in page path
NEXT_PUBLIC_CLERK_SIGN_UP_URL     # Sign-up page path

# Mux Video
MUX_TOKEN_ID                      # Mux API token ID
MUX_TOKEN_SECRET                  # Mux API token secret

# OpenAI
OPENAI_API_KEY                    # OpenAI API key

# n8n Webhooks
N8N_INTERACTION_WEBHOOK_URL       # Main grading webhook
N8N_GRAMMAR_GEN_WEBHOOK_URL       # Grammar generation webhook
N8N_EXERCISE_GEN_WEBHOOK_URL      # Exercise generation webhook
```

### Optional Variables

```env
# Azure Speech (for tone training)
AZURE_SPEECH_KEY                  # Azure Speech Services key
AZURE_SPEECH_REGION               # Azure region (e.g., "eastus")

# Redis Rate Limiting
UPSTASH_REDIS_REST_URL            # Upstash Redis URL
UPSTASH_REDIS_REST_TOKEN          # Upstash Redis token

# GoHighLevel CRM
GHL_WEBHOOK_SECRET                # Webhook validation secret
```

**⚠️ NEVER commit `.env.local` to Git!** It's already in `.gitignore`.

---

## 🤝 Contributing

### Workflow Summary

1. **Pull latest changes**: `git pull origin main`
2. **Create feature branch** (optional): `git checkout -b feature/my-feature`
3. **Make changes** and test locally
4. **Commit with descriptive message**: `git commit -m "feat: describe change"`
5. **Push to GitHub**: `git push origin main` (or `origin feature/my-feature`)
6. **Test on staging** (if available)
7. **Merge to production** when ready

### Code Style

- **TypeScript**: Use strict types, avoid `any`
- **React**: Use functional components with hooks
- **Naming**:
  - Components: PascalCase (`MyComponent.tsx`)
  - Files: kebab-case (`my-utility.ts`)
  - Functions: camelCase (`getUserData`)
- **Imports**: Group by external → internal → relative
- **Comments**: Explain "why", not "what"

### Testing

- **Manual testing**: Click through UI changes before committing
- **E2E tests**: Run `npm run test:e2e` for critical flows
- **Database changes**: Test migrations on local DB first

### Getting Help

- **Planning docs**: Check `.planning/PROJECT.md` and `.planning/ROADMAP.md`
- **Code questions**: Search codebase with `grep -r "term" src/`
- **Team lead**: Ask for credentials, access, or clarification

---

## 📚 Additional Resources

### Documentation

- [Next.js Docs](https://nextjs.org/docs)
- [React Docs](https://react.dev)
- [Drizzle ORM](https://orm.drizzle.team/docs/overview)
- [Clerk Docs](https://clerk.com/docs)
- [Mux Docs](https://docs.mux.com)

### Internal Planning

- `.planning/PROJECT.md` - Full project overview
- `.planning/REQUIREMENTS.md` - Complete requirements list
- `.planning/ROADMAP.md` - Milestone breakdown
- `.planning/STATE.md` - Current status and next steps

### Key Decisions

See `.planning/PROJECT.md` under "Key Decisions" for architecture decisions and rationale.

---

## 📄 License

**Private - All Rights Reserved**

This is a proprietary codebase for CantoMando. Unauthorized copying, distribution, or use is strictly prohibited.

---

## 🎉 Current Milestone Completion

**v10.0 Mastery & Intelligence** ✅ **COMPLETE** (February 16, 2026)

All 6 phases shipped:
- ✅ Phase 69: SRS Flashcard System
- ✅ Phase 70: Grammar Library & HSK Data
- ✅ Phase 71: Tone Training
- ✅ Phase 72: Assessment & Placement
- ✅ Phase 73: Auto-Exercise Generation & Prompt Lab
- ✅ Phase 74: Smart Study Engine

**Next**: v11.0 planning begins when ready.

---

**Last Updated**: February 16, 2026
**Maintained By**: CantoMando Development Team
