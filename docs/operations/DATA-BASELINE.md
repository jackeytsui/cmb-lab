# Ops Data Baseline — GHL Active Students Export

> **Source:** `Export_Contacts_Active students (not lifetime)_Feb_2026_1_19_PM.csv`, row-level parse (n = **143**; raw line count is inflated by multi-line quoted note fields — do not `wc -l` this file).
> **As-of:** 2026-02-11 (latest `Last Activity` in the export). Re-run this analysis after OPS-105 lands a live sync.

## Headline numbers

| Metric | Value |
|---|---:|
| Active (non-lifetime) students | **143** |
| Coaches | 3 (Jane, Tiffany, Janelle) |
| Avg paid (where recorded, n=23) | $2,458 · sum $56,543 |
| Dominant plan | 6 months (124/143 = 87%) |
| 1:1 eligible | 110 (77%) |

## F1 · Activation (lifetime portal logins, `login_counter`)

| Logins | Students |
|---|---:|
| no record | 23 |
| 0–1 | 25 |
| 2–5 | 58 |
| 6–20 | 34 |
| 21+ | 3 |

**48/143 (34%) have ≤1 recorded login ever.**

## F2 · Engagement (days since `Last_Portal_Login`, at export)

| Recency | Students |
|---|---:|
| 0–7d | 17 (12%) |
| 8–14d | 12 |
| 15–30d | 24 |
| 31–60d | 30 |
| 61–90d | 12 |
| 90d+ | 28 |
| never/unknown | 20 |

**90/143 (63%) disengaged 31d+.** Contrast: GHL `Last Activity` (email opens count) shows 91 "active" in 7d — portal data is the truth signal.
Estimated booked revenue in the disengaged group: ~90 × $2,458 ≈ **$221K** (payment data only 16% filled; treat as directional).

## F3 · Renewal exposure (`Product END date` by month)

| Month | Ends |
|---|---:|
| already past (at export) | **11** ← expired-but-active |
| 2026-02 | 16 |
| 2026-03 | 17 |
| 2026-04 | 14 |
| 2026-05 | 16 |
| 2026-06 | 12 |
| **2026-07** | **37** ← largest wave ever |
| 2026-08 | 9 |
| 2026-09/10/12, 2027-02 | 3 / 4 / 1 / 1 |
| none | 3 |

**112/143 (78%) of terms end within 6 months of export.** No orchestrated renewal motion exists.

## F4 · Coach load

| Coach | Students |
|---|---:|
| Jane | 67 (47%) |
| Tiffany | 28 |
| Janelle | 16 |
| **Unassigned** | **32 (22%)** |

## F5 · Field completeness (of 143)

| Field | Filled |
|---|---:|
| Course eligibility | 100% |
| Access plan / End date | 99% / 98% |
| Last portal login | 86% |
| login_counter | 84% |
| Coach name | 78% |
| CMBP level | 66% |
| Lesson number | 59% |
| **Product line** | **20%** |
| **Paid total** | **16%** |

## F6 · Intake by start month

2025: May 6 · Jun 9 · Jul 8 · Aug 9 · Sep 12 · Oct 10 · Nov 12 · Dec 10 → **2026-01: 45** (4× baseline) · 2026-02: 11 (partial month).
Launch-wave acquisition + fixed 6-month terms ⇒ synchronized renewal cliffs (Jan's 45 → the July wave in F3).

## Level distribution (where known)

Foundations 37 · Intermediate 26 · Advanced 20 · Finished 8 · Cantonese Improvement 4 · unknown 48.
`completed-foundations` tag: 63/143 (44%).

## Health Score v1 simulation (portal-recency + login-depth proxy)

| Band | Rule (proxy) | Students |
|---|---|---:|
| Green | portal ≤14d | 29 (20%) |
| Amber | 15–60d | 54 (38%) |
| **Red** | 61d+/never | **60 (42%)** |

## Notable tag facts

- `temporary_zapier_webhook_general` on **126/143 (88%)** — "temporary" plumbing is load-bearing; migrate to n8n deliberately.
- `10-day-engager` 91 · `first-login` 102 · `purchased-cmbp` 112 · `paid_students` 142.

---
*Generated 2026-07-18 from the Feb-11 export. Owner: Ops lead. Refresh via OPS-110/OPS-105.*
