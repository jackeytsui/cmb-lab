# Phase 75: LTO Student Access & Mandarin Accelerator - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 75-lto-student-access-mandarin-accelerator
**Areas discussed:** LTO Access Gating, Typing Kit Mechanics, Conversation Scripts UX, Reader Passages Setup

---

## LTO Access Gating

| Option | Description | Selected |
|--------|-------------|----------|
| New feature key | Add 'mandarin_accelerator' feature key. Coaches assign via roles. | |
| CRM tag-based override | GHL tag 'LTO' auto-enables access via tag-feature overrides | |
| New dedicated role | Create 'LTO Student' role with standard + accelerator features | Initially selected |

**Initial choice:** New dedicated role
**Revised to:** Tag-based approach after user reflected that role-driven management is harder. LTO students keep standard Student role + `LTO_student` tag triggers feature override.
**Notes:** User prefers simpler tag management over role juggling.

### Nav Placement

| Option | Description | Selected |
|--------|-------------|----------|
| New sidebar section | 'Mandarin Accelerator' group with sub-items, gated by FeatureGate | ✓ |
| Dashboard widget | Card on dashboard linking to features | |
| Inside existing sections | Typing under Practice, Scripts under Coaching, etc. | |

### Tag Management

| Option | Description | Selected |
|--------|-------------|----------|
| GHL sync only | Auto from GHL webhook | |
| Both GHL + manual | Auto-synced + coach can add/remove in admin | ✓ |
| Manual only | Coach tags manually, no automation | |

### Role Scope (superseded by tag decision)

| Option | Description | Selected |
|--------|-------------|----------|
| All defaults + accelerator | LTO role inherits all standard features + mandarin_accelerator | |
| Only mandarin_accelerator | LTO role grants just accelerator features | Initially selected |

**Notes:** This question became moot when user switched from role-based to tag-based approach.

### Visibility for Non-LTO

| Option | Description | Selected |
|--------|-------------|----------|
| Completely hidden | Non-LTO students don't see the section | ✓ |
| Visible but locked | Grayed out with lock icon | |

### Expiry

| Option | Description | Selected |
|--------|-------------|----------|
| Permanent | Never expires, coach revokes manually | |
| Time-limited | Expires after set duration | Initially selected |

**Notes:** With tag-based approach, "expiry" = tag removal. Progress preserved, access locked.

---

## Typing Kit Mechanics

### Typing UI Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated typing UI | New 'typing drill' interface, duolingo-style | ✓ |
| Reuse practice set free-text | 40 free-text exercises in practice set | |
| Reuse fill-in-the-blank | Sentences with blanks for key words | |

### Auto-Checking Method

| Option | Description | Selected |
|--------|-------------|----------|
| Exact match | Must type exact expected sentence | ✓ |
| Fuzzy match with hints | Allow minor variations, character-by-character diff | |

### Sentence Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Two separate sections | Mandarin (20) and Cantonese (20) tabs/sections | ✓ |
| Paired progression | Mandarin then Cantonese per pair | |
| Single mixed list | All 40 in one list | |

### Prompt Information

| Option | Description | Selected |
|--------|-------------|----------|
| English + Pinyin/Jyutping | Show translation and romanisation | ✓ |
| English only | Only English, student recalls everything | |

### Retry Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Retry until correct | Unlimited retries, must pass to advance | ✓ |
| Show answer + move on | One attempt then correct answer shown | |

### Content Management

| Option | Description | Selected |
|--------|-------------|----------|
| Admin panel + bulk upload | Coach creates in admin, plus CSV/JSON bulk upload | ✓ |
| Admin panel only | Manual entry only | |
| Hardcoded | Static JSON in codebase | |

**User's choice:** Admin panel with bulk upload option for coaches

### Progress Tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with progress bar | Completion count per section, resume capability | ✓ |
| No tracking | Start fresh each time | |

### Demo Video Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded at top | Video above exercise sections, watch or skip | ✓ |
| Separate intro page | First-visit video then exercises | |

---

## Conversation Scripts UX

### Script Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Scenario cards grid | 10 cards labeled by scenario, tap to enter | ✓ |
| Sequential list | Numbered list, unlock sequentially | |

### Self-Checking Mechanism

**User's choice:** Provided detailed SOP via Loom reference
- Two-column layout (Speaker / Responder roles)
- Chinese characters + romanisation + English per line
- Student speaks aloud, then audio plays correct pronunciation
- Self-check: mark as "good" or "not good"
- Honor system, no recording or AI scoring

**Loom reference:** https://loom.com/share/116fe473c59e4606ab9dae2aff1a5a06

### Audio Source

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-recorded uploads | Janelle records all audio | ✓ |
| Azure TTS generated | Generate via existing pipeline | |
| Both | Pre-recorded preferred, TTS fallback | |

### Content Management

| Option | Description | Selected |
|--------|-------------|----------|
| Admin panel + bulk upload | Consistent with Typing Kit | ✓ |
| Admin panel only | Manual entry | |

### Self-Check Tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Tracked with progress | Store ratings, show completion per script | ✓ |
| Ephemeral only | No data saved | |

### Language Display

| Option | Description | Selected |
|--------|-------------|----------|
| Two tabs per script | One language at a time | |
| Inline both languages | Canto + Mando shown per line | ✓ |
| Sequential passes | Full script in Canto, then repeat in Mando | |

### Role Practice

| Option | Description | Selected |
|--------|-------------|----------|
| Both roles | Student practices all lines | ✓ |
| One role | Student picks a role, other plays automatically | |

---

## Reader Passages Setup

### Reader Mode

| Option | Description | Selected |
|--------|-------------|----------|
| Curated passages list | Dedicated page, 5 passages by title, opens in Reader | ✓ |
| Pre-loaded in Reader | Appear as saved items mixed with student content | |

### Content Management

| Option | Description | Selected |
|--------|-------------|----------|
| Admin panel + bulk upload | Consistent with other features | ✓ |
| Admin panel only | Manual entry | |

### Progress Tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Simple read status | Read/Unread badge per passage | ✓ |
| No tracking | Just a list | |

### Reader Features

| Option | Description | Selected |
|--------|-------------|----------|
| All features except editing text | Full Reader minus text modification | Initially selected |
| Read-only with limited features | Only dictionary popup | Initially selected |
| Full Reader, no content creation | All features, just can't paste/import/create passages | ✓ |

**User's clarification:** "Everything the same, LTO student just can't generate passages by themselves — should be preloaded for them." Full Reader experience on preloaded content.

---

## Claude's Discretion

- DB schema design for all three features
- Admin panel layout and forms
- Bulk upload format and validation
- Progress tracking schema
- Sidebar icon and ordering

## Deferred Ideas

None — discussion stayed within phase scope
