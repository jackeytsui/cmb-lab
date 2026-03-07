# Feature Landscape: CRM-Lite Student Management Dashboard

**Domain:** LMS Student Management with External CRM Integration (GoHighLevel)
**Researched:** 2026-01-31
**Milestone:** Student Management Dashboard (subsequent milestone, builds on v1.0 + v1.1)
**Confidence:** HIGH

---

## Executive Summary

This research maps the feature landscape for a coach-facing student management dashboard that bridges the gap between a learning management system and an external CRM (GoHighLevel). The core challenge is scope discipline: coaches need learning-relevant CRM context without rebuilding CRM functionality inside the LMS.

Research across coaching platforms (Delenta, Meritto, Capsule CRM), LMS dashboards (iSpring, Docebo, LearnWorlds, Absorb LMS), and GoHighLevel's API reveals a clear pattern: the most effective coaching tools surface 5-8 key CRM fields alongside learning data, then link out to the full CRM for everything else. This "window into CRM, not a mirror of CRM" approach keeps the LMS focused while giving coaches the context they need.

The existing codebase already has student listing (`/coach/students`), course access management (`StudentAccessManager`), coach notes (`coachNotes` table), submission review queue, and progress tracking. The student management dashboard extends these by adding filterable/sortable data tables, bulk operations, tagging, and GoHighLevel CRM field display -- building on top of existing schema rather than replacing it.

---

## Table Stakes

Features coaches expect from any student management interface. Missing any of these makes the tool feel incomplete compared to basic spreadsheet tracking.

| Feature | Why Expected | Complexity | Dependency |
|---------|--------------|------------|------------|
| **Searchable student table** | Coaches need to find specific students quickly by name or email; current list is flat with no search | LOW | Extends existing `/coach/students` page |
| **Sort by columns** | Sort by name, enrollment date, last active, progress -- standard data table behavior | LOW | Query parameter-driven sorting |
| **Filter by course** | "Show me only students enrolled in Course X" -- coaches manage per-course cohorts | LOW | Joins existing `courseAccess` table |
| **Filter by progress status** | "Show me students who haven't started" or "students stuck on Module 2" | MEDIUM | Aggregates `lessonProgress` data |
| **Student detail view** | Click student row to see full profile: enrolled courses, progress per course, submissions, notes | MEDIUM | Extends existing student profile (admin has one at `/admin/students/[id]`) |
| **Bulk course assignment** | Select 10 students, assign to a course in one action -- coaches onboard cohorts, not individuals | MEDIUM | Extends existing `courseAccess` + batch insert |
| **Bulk course removal** | Select students, remove from a course -- for cohort management and access cleanup | MEDIUM | Batch delete from `courseAccess` |
| **Last active indicator** | Show when student last accessed the platform -- coaches need to spot disengaged students | LOW | Query `lessonProgress.lastAccessedAt` or add activity tracking |
| **Student count and summary stats** | Header showing total students, active this week, pending reviews -- quick situational awareness | LOW | Aggregate queries on existing tables |
| **Pagination** | Current page loads all students; breaks with 100+ students | LOW | Cursor or offset pagination |
| **Export student list** | CSV download of student data for external reporting or coach meetings | LOW | Server action generating CSV |

### UX Pattern: The Student Table

The standard pattern for coach-facing student management is a data table with:

1. **Header bar**: Search input, filter dropdowns, bulk action buttons
2. **Table body**: Checkbox column, name/email, courses, progress indicator, last active, tags, actions
3. **Bulk actions toolbar**: Appears when 1+ rows selected -- "Assign Course", "Add Tag", "Remove"
4. **Selection behavior**: Individual checkboxes, header "select all" (with indeterminate state), shift-click for range selection
5. **Detail slide-out or page**: Click row to see full student profile without losing table context

This matches patterns from PatternFly (bulk selection), Helios (table multi-select), and React Admin (DataTable with bulk actions). The existing `StudentList` component uses an expandable row pattern that works for access management but needs to evolve into a proper data table for the full student management experience.

---

## Differentiators

Features that set this apart from a basic student list. These leverage the GoHighLevel integration and learning-specific context to give coaches superpowers.

| Feature | Value Proposition | Complexity | Dependency |
|---------|-------------------|------------|------------|
| **GoHighLevel CRM field display** | Show timezone, goals, native language from GHL without leaving LMS -- coaches get context for personalized feedback | MEDIUM | GHL API v2 contact lookup |
| **Link to full GHL profile** | One-click deep link to student's GoHighLevel contact page -- "for everything else, go to CRM" | LOW | URL construction with GHL contact ID |
| **Student tagging system** | Tag students as "beginner-cohort-jan", "needs-extra-help", "vip" -- enables cohort filtering and re-engagement targeting | MEDIUM | New `student_tags` table + many-to-many join |
| **Filter by tag** | "Show me all students tagged 'january-cohort'" -- coaches manage groups without creating courses | LOW | Tag filter in student table query |
| **Bulk tagging** | Select 15 students, add tag "needs-review" in one action | LOW | Batch insert into join table |
| **Activity timeline on student profile** | Chronological view: enrolled Jan 5, completed Lesson 1 Jan 7, submitted audio Jan 8, coach reviewed Jan 9 | MEDIUM | Aggregates events from multiple tables |
| **Progress heatmap per student** | Visual grid showing completion status across all lessons -- spot gaps at a glance | MEDIUM | Aggregates `lessonProgress` per student |
| **Quick notes from student table** | Add internal note about a student without navigating away from the list | LOW | Extends existing `coachNotes` -- inline form |
| **Engagement status badge** | Auto-calculated: "Active" (accessed <7 days), "Inactive" (7-30 days), "At Risk" (>30 days) | LOW | Computed from `lastAccessedAt` |
| **GHL tag sync** | Tags created in LMS sync to GoHighLevel contact tags -- enables CRM automations (email sequences, re-engagement) | HIGH | GHL API v2 tag endpoints + webhook or scheduled sync |

### GoHighLevel Integration Depth

The key architectural decision is **how much CRM data to pull into the LMS**. Research across coaching CRM platforms (Capsule CRM, Meritto, Delenta) shows three tiers:

**Tier 1: Read-only display (Recommended for MVP)**
- Pull 5-8 fields from GHL on student profile view: timezone, goals, native language, phone, enrollment source, GHL tags
- Cache in LMS database with TTL (refresh every 24h or on profile view)
- Display as a "CRM Context" card on the student detail page
- Deep link to full GHL profile for everything else

**Tier 2: Bidirectional sync (Recommended for post-MVP)**
- LMS tags sync to GHL tags (one-way: LMS -> GHL)
- Course enrollment/completion events push to GHL as notes or custom field updates
- Enables GHL workflow automations triggered by LMS events

**Tier 3: Full CRM mirror (NOT recommended)**
- Pulling all GHL contact data into LMS
- Editing CRM fields from within LMS
- Building pipeline/opportunity views inside LMS
- This is CRM replacement territory -- explicitly out of scope

### GoHighLevel API Specifics (V2)

GoHighLevel's V2 API (V1 reached end-of-support January 2026) provides:

- **Get Contact**: Full contact record with standard fields (name, email, phone, timezone, address, tags, source, date_created) and custom fields
- **Custom Fields V2 API**: Retrieve custom field definitions and values (goals, native language, etc. stored as custom fields)
- **Contact Tags**: Read and write tags on contacts
- **Authentication**: OAuth 2.0 or Private Integration Token (Sub-Account level)
- **Rate Limits**: 100 requests per 10 seconds per app per resource, 200K daily
- **Webhook Events**: 50+ event types for real-time notifications from GHL to LMS

**Critical implementation detail**: GoHighLevel stores "goals" and "native language" as **custom fields**, not standard fields. The LMS needs to:
1. Call `GET /custom-fields` to discover field IDs for the GHL sub-account
2. Map field IDs to known LMS concepts (goal_field_id -> "student goals")
3. Store the mapping in LMS config (admin sets up once)
4. On student profile view, fetch contact by email, extract mapped custom field values

---

## Anti-Features

Features to deliberately NOT build. These represent the boundary between "learning management" and "marketing CRM." Building these would turn the LMS into a CRM competitor, which the user explicitly wants to avoid.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Email marketing from LMS** | GoHighLevel already has email campaigns, sequences, and automations. Duplicating this in the LMS creates two email systems to manage. | Push relevant events (enrollment, completion) to GHL via webhook; let GHL handle email campaigns. |
| **Pipeline/opportunity management** | Sales pipeline tracking is CRM territory. Coaches track learning progress, not sales stages. | Show learning progress stages (not started, in progress, completed) which serve a similar visual purpose without sales semantics. |
| **Contact creation in LMS** | Students should come through the enrollment funnel (GHL -> webhook -> LMS), not be manually created in the LMS. | Keep existing webhook enrollment flow. If a coach needs to add a student, they do it in GHL and the webhook creates the LMS record. |
| **SMS/WhatsApp messaging** | Communication channels are CRM territory. GHL has built-in SMS, WhatsApp, and chat. | Link to GHL conversation for the contact. Keep LMS communication to in-app notifications and coach feedback. |
| **Payment/invoice management** | Revenue tracking belongs in GHL or Stripe, not the LMS. | No payment features in LMS. Enrollment webhook is triggered by payment in GHL. |
| **Lead scoring** | Scoring leads based on engagement is marketing automation, not learning management. | Engagement status (Active/Inactive/At Risk) serves the learning equivalent without marketing semantics. |
| **Calendar/scheduling** | Booking coaching calls is GHL territory (Calendly integration, booking widget). | Link to coach's GHL booking page from student profile. |
| **Duplicate contact detection** | Deduplication is CRM infrastructure. LMS has one record per Clerk user, linked by email. | GHL handles dedup. LMS links to GHL by email match. If no match found, show "No CRM profile found" gracefully. |
| **Custom field editing** | Editing CRM fields from LMS creates data ownership confusion -- which system is the source of truth? | Display CRM fields read-only. Edit link opens GHL contact page. |
| **Full contact history** | Call logs, email history, form submissions -- this is GHL's domain. | Show LMS-specific activity timeline (lessons, submissions, feedback). Link to GHL for full contact history. |
| **Workflow automation builder** | Trigger-action automations belong in n8n or GHL workflows, not in the LMS UI. | Expose webhook events that n8n/GHL can consume. Don't build an automation UI. |

### The Boundary Principle

**The LMS is a consumer of CRM data, not a producer.** This means:

- **LMS reads** CRM fields (timezone, goals, language) for display context
- **LMS writes** learning events back to CRM (enrollment confirmed, course completed, tag added) via webhooks
- **LMS links** to CRM for deep-dive actions (edit contact, view full history, send message)
- **LMS never** stores CRM data as source of truth -- always cache with clear staleness indicators

This principle keeps the systems complementary rather than competing.

---

## Feature Dependencies

```
Existing v1.0/v1.1 Foundation
    |
    +-- Student Data Table (core)
    |       |
    |       +-- [Search & Sort] (no new schema)
    |       +-- [Filter by Course] (uses courseAccess)
    |       +-- [Filter by Progress] (uses lessonProgress)
    |       +-- [Pagination] (query modification)
    |       +-- [Last Active] (query lessonProgress or add activity log)
    |       +-- [Engagement Status Badge] (computed from lastAccessedAt)
    |
    +-- Bulk Operations
    |       |
    |       +-- [Select UI] (checkboxes, select-all, shift-click)
    |       +-- [Bulk Assign Course] (batch insert courseAccess)
    |       +-- [Bulk Remove Course] (batch delete courseAccess)
    |       +-- [Bulk Add Tag] (requires tagging system)
    |       +-- [Bulk Remove Tag] (requires tagging system)
    |
    +-- Tagging System (new schema)
    |       |
    |       +-- [Tags table + join table] (new DB tables)
    |       +-- [Tag CRUD for coaches] (create/rename/delete tags)
    |       +-- [Tag filter in student table] (WHERE clause)
    |       +-- [GHL Tag Sync] (OPTIONAL, post-MVP, GHL API)
    |
    +-- Student Detail View (enhanced profile)
    |       |
    |       +-- [Progress per course] (aggregates lessonProgress)
    |       +-- [Activity timeline] (aggregates multiple tables)
    |       +-- [Coach notes inline] (extends existing coachNotes)
    |       +-- [CRM Context Card] (requires GHL integration)
    |       +-- [Link to GHL profile] (URL construction)
    |
    +-- GoHighLevel Integration
            |
            +-- [GHL API client] (auth, contact lookup)
            +-- [Custom field mapping config] (admin setup)
            +-- [Contact data cache] (local cache table)
            +-- [CRM Context Card display] (on student detail)
            +-- [Deep link to GHL] (URL construction)
            +-- [Event push to GHL] (OPTIONAL, webhooks)
```

### Dependency Notes

- **Student Data Table** has no new schema dependencies -- it enhances existing queries on `users`, `courseAccess`, and `lessonProgress`
- **Bulk Operations** depend on the data table's selection UI being built first
- **Tagging System** requires new database tables (`tags`, `student_tags`) but is otherwise independent
- **Student Detail View** can be built incrementally -- start with progress data (no new deps), add CRM context later
- **GoHighLevel Integration** is the most independent concern -- can be added last as a "CRM Context Card" on the student detail page without affecting other features

---

## MVP Recommendation

For MVP, prioritize the features that solve the immediate coach pain point: "I need to see all my students, find specific ones quickly, and manage their course access in bulk."

### Build First (Core Table)
1. **Searchable, sortable, paginated student table** -- replaces current flat list
2. **Filter by course enrollment** -- "show me students in Course X"
3. **Filter by progress status** -- "show me inactive students"
4. **Engagement status badge** -- visual indicator of student activity level
5. **Bulk course assignment/removal** -- onboard cohorts efficiently

### Build Second (Tagging + Detail)
6. **Student tagging system** -- tag creation, assignment, filtering
7. **Bulk tagging** -- tag multiple students at once
8. **Enhanced student detail view** -- progress heatmap, activity timeline, inline notes

### Build Third (CRM Integration)
9. **GoHighLevel API integration** -- fetch contact data (timezone, goals, language)
10. **CRM Context Card** -- display GHL fields on student detail page
11. **Deep link to GHL profile** -- one-click to full CRM record

### Defer to Post-MVP
- **GHL tag sync** (LMS tags -> GHL tags): Requires webhook infrastructure and error handling for bidirectional concerns
- **Event push to GHL** (completion events as GHL notes): Useful but not blocking coach workflow
- **CSV export**: Nice-to-have; coaches can screenshot or use GHL reports
- **Progress heatmap visualization**: Beautiful but not essential; simple progress bars suffice for MVP

---

## Bulk Operations UX Specification

Based on research from PatternFly, Helios Design System, and React Admin patterns, bulk operations should follow these conventions:

### Selection Behavior

1. **Individual checkbox** on each row
2. **Header checkbox** with three states: unchecked (none selected), checked (all on page selected), indeterminate (some selected)
3. **Select all banner**: When all rows on current page are selected, show "All 25 students on this page are selected. Select all 142 students?" -- enables cross-page selection
4. **Shift-click range selection**: Click row 3, shift-click row 8 to select rows 3-8
5. **Selection persists across filter changes**: Selecting 5 students, then changing filter, then changing back should still show those 5 selected (if they match the filter)
6. **Selection count**: "12 students selected" shown in bulk actions toolbar

### Bulk Actions Toolbar

Appears as a sticky bar at the top of the table when 1+ rows are selected:

```
[ 12 students selected ] [ Assign Course v ] [ Add Tag v ] [ Remove from Course v ] [ Clear Selection ]
```

- **Assign Course**: Dropdown shows available courses; selecting one assigns all selected students
- **Add Tag**: Dropdown shows existing tags + "Create new tag" option
- **Remove from Course**: Dropdown shows courses the selected students have in common
- **Clear Selection**: Deselects all, hides toolbar

### Error Handling for Bulk Operations

- Return `{ succeeded: string[], failed: { id: string, reason: string }[] }` from bulk operation endpoints
- Show summary toast: "10 of 12 students assigned. 2 failed (already enrolled)."
- Do NOT silently skip failures
- Provide "Retry Failed" button for transient errors

### Accessibility Requirements

- Bulk actions toolbar has `role="toolbar"` with `aria-label="Bulk actions"`
- Selection count uses `role="status"` for screen reader announcements
- Checkboxes have `aria-label="Select [student name]"`
- Keyboard: Space toggles checkbox, Shift+Space for range, Escape clears selection

---

## CRM Field Display Specification

Based on the user's requirements, the CRM Context Card on the student detail page should show:

| Field | Source | Display Format | Why Coaches Need It |
|-------|--------|----------------|---------------------|
| **Timezone** | GHL standard field `timezone` | "Asia/Hong_Kong (UTC+8)" with current local time | Schedule feedback and know when student is active |
| **Goals** | GHL custom field (mapped) | Free text, truncated with "Show more" | Personalize feedback and lesson recommendations |
| **Native Language** | GHL custom field (mapped) | "Cantonese" / "Mandarin" / "English" / other | Understand student's language background for feedback |
| **Enrollment Source** | GHL standard field `source` | "Facebook Ad" / "Referral" / etc. | Context for student's motivation and expectations |
| **GHL Tags** | GHL contact tags | Comma-separated badges | See CRM segmentation without leaving LMS |
| **Phone** | GHL standard field `phone` | Formatted phone number | Quick reference (not for calling from LMS) |
| **Date Enrolled (GHL)** | GHL standard field `date_created` | "Jan 15, 2026" | Know how long they've been in the funnel vs when they started learning |

### Cache Strategy

- **Cache location**: `ghl_contact_cache` table in LMS database
- **Cache fields**: Contact ID, email, timezone, goals, native language, source, tags, phone, GHL created_at, cached_at
- **TTL**: 24 hours (refresh on next student profile view after TTL expires)
- **Cache miss**: Show "Loading CRM data..." spinner, fetch from GHL API, store in cache, display
- **GHL unreachable**: Show "CRM data unavailable" with last-cached date; never block the page
- **No GHL match**: Show "No CRM profile found for [email]. Create in GoHighLevel?" with deep link

### Admin Configuration

Coaches should not need to configure the GHL integration. An admin (or developer) sets up once:

1. GHL Private Integration Token (stored as environment variable)
2. GHL Sub-Account/Location ID (stored as environment variable)
3. Custom field mapping: admin UI page that lists GHL custom fields and lets admin map them to LMS concepts ("This field = Student Goals", "This field = Native Language")

This mapping is stored in the database and referenced when displaying the CRM Context Card.

---

## Sources

### LMS Dashboard Patterns
- [iSpring LMS Dashboard Features](https://www.ispringsolutions.com/blog/lms-dashboard) - Supervisor dashboard patterns, issue identification
- [Docebo LMS Dashboard Guide](https://www.docebo.com/learning-network/blog/lms-dashboard/) - Coach & Share features, learner management
- [Best LMS for Creators & Coaches 2026](https://www.disco.co/blog/best-lms-for-creators-and-coaches-2026) - Disco, Kajabi, Teachable comparison
- [LevelUp LMS Features 2026](https://leveluplms.com/the-best-learning-management-system-features-you-should-look-for-in-2026/) - AI-powered learning, customization

### CRM & Coaching Platforms
- [Capsule CRM for Coaches](https://capsulecrm.com/blog/best-crm-for-coaches/) - Custom fields, session notes, pipeline patterns
- [Meritto CRM for Coaching Institutes](https://www.meritto.com/crm-for-coaching-multi-center-training-institutes/) - AI enrollment signals, counselor assignment
- [Delenta Coaching Platform](https://www.delenta.com/) - All-in-one CRM + coaching management
- [Salesforce Education Cloud](https://www.salesforce.com/education/crm/) - Holistic student profiles, data centralization

### GoHighLevel API
- [HighLevel API Documentation](https://marketplace.gohighlevel.com/docs/) - Official V2 API reference
- [Get Contacts API](https://marketplace.gohighlevel.com/docs/ghl/contacts/get-contacts/index.html) - Contact retrieval endpoints
- [Custom Fields V2 API](https://marketplace.gohighlevel.com/docs/ghl/custom-fields/custom-fields-v-2-api/index.html) - Custom field CRUD
- [GHL Webhook Integration Guide](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/index.html) - Webhook event types and payloads
- [GHL Outbound Webhook Fields](https://help.gohighlevel.com/support/solutions/articles/155000003299-workflow-action-webhook-outbound-) - Contact field payload documentation

### Bulk Operations & Data Tables
- [PatternFly Bulk Selection Pattern](https://www.patternfly.org/patterns/bulk-selection/) - Toolbar-based bulk selector, selection scopes
- [Helios Table Multi-Select](https://helios.hashicorp.design/patterns/table-multi-select) - Selection persistence across filters, shift-click
- [React Admin DataTable](https://marmelab.com/react-admin/DataTable.html) - useListContext hook, custom bulk action buttons
- [Bulk Actions UX Guidelines](https://www.eleken.co/blog-posts/bulk-actions-ux) - Per-item feedback, error handling

### LMS Student Management
- [Absorb LMS Tags](https://support.absorblms.com/hc/en-us/articles/360052151373-Tags) - Tagging best practices, automatic tagging
- [LearnDash Bulk Course Assignment](https://wpsheeteditor.com/learndash-course-groups/) - CSV import, bulk group assignment
- [LearnWorlds Bulk Import](https://support.learnworlds.com/support/solutions/articles/12000087148-how-to-bulk-import-and-enroll-your-users) - Template format, 10K row limit
- [Tutor LMS Bulk Enrollment](https://tutorlms.com/blog/tutor-lms-v3-3-0/) - CSV upload, duplicate prevention
- [LearnDash Cohort Manager](https://www.training-spark.com/cohort-manager-for-learndash/) - Workflow-based cohort scheduling

### Coaching-Specific UX
- [19+ Filter UI Examples for SaaS](https://www.eleken.co/blog-posts/filter-ux-and-ui-for-saas) - Filter patterns, instant vs batch filtering
- [Best Practices for Actions in Data Tables](https://medium.com/uxdworld/best-practices-for-providing-actions-in-data-tables-d629c6e73ab8) - Row actions, bulk actions, inline editing
- [Data Table UI Best Practices](https://www.justinmind.com/ui-design/data-table) - Column design, responsive tables
- [11 LMS Reports to Track 2026](https://www.educate-me.co/blog/lms-reporting) - Cohort progress reports, filtering

---

*Feature research for: CantoMando Blueprint - CRM-Lite Student Management Dashboard*
*Researched: 2026-01-31*
*Confidence: HIGH*
