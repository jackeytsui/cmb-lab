# Phase 18: Certificates - Research

**Researched:** 2026-01-30
**Domain:** PDF generation with CJK font support, certificate verification, LinkedIn sharing
**Confidence:** HIGH

## Summary

This phase requires generating downloadable PDF certificates when students complete a course, with a public verification page and LinkedIn sharing. The primary technical challenges are: (1) server-side PDF generation in a Next.js 15 App Router API route, (2) rendering Chinese characters correctly in the PDF by embedding a CJK font, and (3) building a public verification endpoint.

The recommended approach is to use `@react-pdf/renderer` for PDF generation. This library provides a declarative JSX-based API for building PDFs, works server-side via `renderToBuffer`, and supports custom font registration including CJK fonts. A known compatibility issue with Next.js App Router has been resolved when using React 19 -- and this project already uses React 19.2.3. The alternative `pdf-lib` has known CJK font subsetting bugs, and PDFKit uses an imperative API that is harder to maintain for template-style certificates.

The certificate system needs a new `certificates` database table to store issued certificates with unique verification IDs, a generation API route triggered on course completion, a public `/verify/[certificateId]` page, and a LinkedIn "Add to Profile" button using LinkedIn's official URL scheme.

**Primary recommendation:** Use `@react-pdf/renderer` with `renderToBuffer` in an API route, embed Noto Sans SC font for Chinese characters, and store certificate records in a `certificates` table with a nanoid-based verification ID.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @react-pdf/renderer | ^4.3.2 | Server-side PDF generation with JSX components | Declarative React-based API, works with React 19, 860K weekly downloads |
| nanoid | ^5.x | Generate unique, URL-safe verification IDs | Standard for short unique IDs, no collisions at scale, URL-safe by default |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Noto Sans SC (font file) | 2.004 | CJK font for Chinese characters in PDF | Embedded in certificate PDF via Font.register() |
| Inter (font file) | latest | Latin text in PDF certificates | For English text, headings, dates |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @react-pdf/renderer | pdf-lib + @pdf-lib/fontkit | Lower-level imperative API, known CJK subsetting bugs (Issue #494), manual coordinate math |
| @react-pdf/renderer | PDFKit | Imperative stream-based API, more verbose, no JSX |
| @react-pdf/renderer | Puppeteer | Pixel-perfect HTML but massive bundle (200MB+), slow cold starts, bad for serverless |
| nanoid | uuid v4 | UUIDs are 36 chars and not user-friendly for verification; nanoid produces shorter, URL-safe IDs |

**Installation:**
```bash
npm install @react-pdf/renderer nanoid
```

**Font Setup:**
Download `NotoSansSC-Regular.ttf` and `NotoSansSC-Bold.ttf` from Google Fonts / notofonts/noto-cjk GitHub releases (Subset OTF versions, ~5-9MB each). Place in `public/fonts/` directory. Also download `Inter-Regular.ttf` and `Inter-Bold.ttf` for Latin text.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── certificates.ts         # Certificate table schema
├── lib/
│   └── certificates.ts         # Certificate generation logic
├── components/
│   └── certificate/
│       ├── CertificateDocument.tsx  # @react-pdf/renderer JSX document
│       └── CertificateDownloadButton.tsx  # Client download button
├── app/
│   ├── api/
│   │   └── certificates/
│   │       ├── generate/route.ts    # POST: generate cert on completion
│   │       └── [certificateId]/
│   │           └── download/route.ts  # GET: download PDF
│   └── verify/
│       └── [certificateId]/
│           └── page.tsx             # Public verification page (no auth)
public/
└── fonts/
    ├── NotoSansSC-Regular.ttf       # Chinese font
    ├── NotoSansSC-Bold.ttf          # Chinese font bold
    ├── Inter-Regular.ttf            # Latin font
    └── Inter-Bold.ttf               # Latin font bold
```

### Pattern 1: On-Demand PDF Generation via API Route
**What:** Generate the PDF when the user clicks "Download Certificate", not at completion time. Store only the certificate metadata (student, course, date, verification ID) in the database. The PDF is rendered on each download request.
**When to use:** Always -- this avoids storing large PDF blobs in the database or file storage.
**Why:** Certificate data is small (a few KB of metadata); PDF generation is fast (< 1 second). On-demand generation means the certificate template can be updated without re-generating old certificates.

### Pattern 2: Completion-Triggered Certificate Record Creation
**What:** When a student completes all lessons in a course, automatically create a `certificates` record with a unique verification ID. This happens as a side effect of the final lesson completion.
**When to use:** When the last lesson in a course is marked complete.
**How:** After updating lesson progress, check if all lessons in the course are now complete. If so, insert a certificate record (idempotently, using ON CONFLICT DO NOTHING on user_id + course_id).

### Pattern 3: Public Verification Page (No Auth Required)
**What:** The `/verify/[certificateId]` route is a public page that displays certificate details without requiring login. It fetches the certificate by its verification ID and joins with user/course data.
**When to use:** For the CERT-04 requirement.

### Anti-Patterns to Avoid
- **Storing PDF blobs in the database:** Never store generated PDFs. Always generate on demand from metadata.
- **Using client-side PDF generation:** The certificate must be generated server-side to prevent tampering with student names/dates.
- **Generating certificate at completion time synchronously:** Use a two-step approach: (1) create the DB record at completion, (2) generate PDF on download.
- **Using base64-encoded font data in source code:** CJK fonts are 5-9MB. Load from file system at runtime, never inline in source.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF document layout | Canvas/SVG to PDF conversion | @react-pdf/renderer JSX components | Handles text wrapping, pagination, font embedding automatically |
| Unique verification IDs | Custom random string generator | nanoid | Cryptographically secure, URL-safe, configurable length, zero dependencies |
| CJK font rendering | Manual glyph mapping or character detection | Font.register() with Noto Sans SC TTF | Font embedding handles all Unicode ranges automatically |
| LinkedIn sharing URL | Custom OAuth integration | LinkedIn Add to Profile static URL scheme | Free, no approval needed, official supported method |
| Course completion detection | Custom lesson counting query | SQL aggregation comparing completed vs total lessons | One query, atomic, consistent |

**Key insight:** PDF generation and CJK font rendering are solved problems. The complexity is in the integration: triggering certificate creation at the right time, making the verification page public while the rest of the app requires auth, and ensuring the font files are available at runtime in the deployed environment.

## Common Pitfalls

### Pitfall 1: CJK Font File Not Found at Runtime
**What goes wrong:** PDF generation fails because the font file path is relative or incorrect in the deployed environment. `process.cwd()` may differ between dev and production.
**Why it happens:** Next.js bundles and deploys differently than local dev. Font files in `public/` are served statically but not always accessible via filesystem in serverless.
**How to avoid:** Use `path.join(process.cwd(), 'public', 'fonts', 'NotoSansSC-Regular.ttf')` and verify the file exists. For @react-pdf/renderer, you can also use a URL pointing to the font file (e.g., from `public/` via the app's own URL or a CDN). Test in production-like build.
**Warning signs:** PDF generates fine in dev but fails in production with "font not found" errors.

### Pitfall 2: @react-pdf/renderer Font Registration is Global
**What goes wrong:** Calling `Font.register()` inside an API route handler causes issues with repeated registrations or race conditions.
**Why it happens:** `Font.register()` is a module-level side effect, not request-scoped.
**How to avoid:** Call `Font.register()` at module scope (top of file), outside any function. It only needs to run once.
**Warning signs:** Intermittent font loading failures, especially under concurrent requests.

### Pitfall 3: Large CJK Font Files Increasing Response Time
**What goes wrong:** First PDF generation request is slow because the 5-9MB font file needs to be read from disk and parsed.
**Why it happens:** Font embedding with CJK fonts is inherently larger than Latin-only fonts.
**How to avoid:** Accept the first-request latency (~1-2 seconds). The font is cached in memory after first load. Consider using the lighter-weight Subset OTF versions of Noto Sans SC (~5MB vs ~16MB for full CJK).
**Warning signs:** First certificate download takes 3+ seconds, subsequent ones are fast.

### Pitfall 4: Duplicate Certificate Records
**What goes wrong:** Multiple certificate records created for the same user + course combination if completion is triggered multiple times.
**Why it happens:** Race conditions when multiple lesson completions fire simultaneously, or lesson progress is re-saved.
**How to avoid:** Use a UNIQUE constraint on (userId, courseId) in the certificates table and ON CONFLICT DO NOTHING in the insert.
**Warning signs:** Multiple certificates with different verification IDs for the same user/course.

### Pitfall 5: Public Verification Page Leaking Auth Routes
**What goes wrong:** The `/verify/[certificateId]` page redirects to sign-in because Clerk middleware protects all routes by default.
**Why it happens:** Clerk middleware configuration typically protects all routes under the app.
**How to avoid:** Add `/verify/:path*` to the Clerk middleware's `publicRoutes` configuration. Also ensure the certificate download API route checks auth but the verification page does not.
**Warning signs:** Unauthenticated users get redirected when visiting verification links.

### Pitfall 6: Course Completion Logic Missing Edge Cases
**What goes wrong:** Certificate is not created because the completion check doesn't account for deleted lessons, lessons with no interactions, or modules with no lessons.
**Why it happens:** The completion check counts total lessons but some may be soft-deleted (deletedAt IS NOT NULL).
**How to avoid:** Filter out soft-deleted modules and lessons when counting total lessons for course completion. Match the same filtering logic used in the dashboard progress display.
**Warning signs:** Student shows 100% on dashboard but no certificate appears.

## Code Examples

### Certificate Database Schema
```typescript
// src/db/schema/certificates.ts
import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { courses } from "./courses";

export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    verificationId: text("verification_id").notNull().unique(),
    completedAt: timestamp("completed_at").notNull(),
    issuedAt: timestamp("issued_at").notNull().defaultNow(),
  },
  (table) => [
    unique("certificates_user_course_unique").on(table.userId, table.courseId),
  ]
);

export const certificatesRelations = relations(certificates, ({ one }) => ({
  user: one(users, {
    fields: [certificates.userId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [certificates.courseId],
    references: [courses.id],
  }),
}));

export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
```

### @react-pdf/renderer Certificate Document
```typescript
// src/components/certificate/CertificateDocument.tsx
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import path from "path";

// Register fonts at module scope (runs once)
Font.register({
  family: "NotoSansSC",
  fonts: [
    { src: path.join(process.cwd(), "public/fonts/NotoSansSC-Regular.ttf") },
    { src: path.join(process.cwd(), "public/fonts/NotoSansSC-Bold.ttf"), fontWeight: "bold" },
  ],
});

Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(process.cwd(), "public/fonts/Inter-Regular.ttf") },
    { src: path.join(process.cwd(), "public/fonts/Inter-Bold.ttf"), fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#0a0a0a",
    padding: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter",
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 20,
  },
  studentName: {
    fontSize: 28,
    fontFamily: "NotoSansSC",
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 16,
  },
  courseTitle: {
    fontSize: 20,
    fontFamily: "NotoSansSC",
    color: "#a1a1aa",
    marginBottom: 24,
  },
  date: {
    fontSize: 14,
    fontFamily: "Inter",
    color: "#71717a",
    marginBottom: 8,
  },
  verificationId: {
    fontSize: 10,
    fontFamily: "Inter",
    color: "#52525b",
    marginTop: 40,
  },
});

interface CertificateDocumentProps {
  studentName: string;
  courseTitle: string;
  completionDate: string;
  verificationId: string;
}

export function CertificateDocument({
  studentName,
  courseTitle,
  completionDate,
  verificationId,
}: CertificateDocumentProps) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Certificate of Completion</Text>
        <Text style={styles.studentName}>{studentName}</Text>
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.courseTitle}>{courseTitle}</Text>
        </View>
        <Text style={styles.date}>Completed on {completionDate}</Text>
        <Text style={styles.verificationId}>
          Verification ID: {verificationId}
        </Text>
      </Page>
    </Document>
  );
}
```

### API Route for PDF Download
```typescript
// src/app/api/certificates/[certificateId]/download/route.ts
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/db";
import { certificates, users, courses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { CertificateDocument } from "@/components/certificate/CertificateDocument";
import { format } from "date-fns";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ certificateId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { certificateId } = await params;

  const cert = await db.query.certificates.findFirst({
    where: eq(certificates.verificationId, certificateId),
    with: { user: true, course: true },
  });

  if (!cert) {
    return new Response("Certificate not found", { status: 404 });
  }

  const pdfBuffer = await renderToBuffer(
    CertificateDocument({
      studentName: cert.user.name ?? cert.user.email,
      courseTitle: cert.course.title,
      completionDate: format(cert.completedAt, "MMMM d, yyyy"),
      verificationId: cert.verificationId,
    })
  );

  return new Response(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificate-${cert.verificationId}.pdf"`,
    },
  });
}
```

### LinkedIn Add to Profile URL
```typescript
// src/lib/certificates.ts
export function buildLinkedInShareUrl(params: {
  certName: string;
  organizationName: string;
  issueYear: number;
  issueMonth: number;
  certUrl: string;
  certId: string;
}): string {
  const base = "https://www.linkedin.com/profile/add";
  const query = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: params.certName,
    organizationName: params.organizationName,
    issueYear: params.issueYear.toString(),
    issueMonth: params.issueMonth.toString(),
    certUrl: params.certUrl,
    certId: params.certId,
  });
  return `${base}?${query.toString()}`;
}
```

### Course Completion Check
```typescript
// src/lib/certificates.ts (partial)
import { db } from "@/db";
import { modules, lessons, lessonProgress, certificates } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function checkAndCreateCertificate(
  userId: string,
  courseId: string
): Promise<string | null> {
  // Count total non-deleted lessons in the course
  const [totals] = await db
    .select({
      totalLessons: sql<number>`COUNT(DISTINCT ${lessons.id})`,
      completedLessons: sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.completedAt} IS NOT NULL THEN ${lessons.id} END)`,
    })
    .from(modules)
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .leftJoin(
      lessonProgress,
      and(
        eq(lessonProgress.lessonId, lessons.id),
        eq(lessonProgress.userId, userId)
      )
    )
    .where(
      and(
        eq(modules.courseId, courseId),
        isNull(modules.deletedAt),
        isNull(lessons.deletedAt)
      )
    );

  if (!totals || totals.totalLessons === 0 || totals.completedLessons < totals.totalLessons) {
    return null; // Not complete
  }

  // All lessons complete - create certificate (idempotent)
  const verificationId = nanoid(12);
  const [cert] = await db
    .insert(certificates)
    .values({
      userId,
      courseId,
      verificationId,
      completedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [certificates.userId, certificates.courseId],
    })
    .returning();

  return cert?.verificationId ?? null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Puppeteer HTML-to-PDF | @react-pdf/renderer with renderToBuffer | 2024+ | No headless browser dependency, works in serverless |
| pdf-lib with @pdf-lib/fontkit for CJK | @react-pdf/renderer with Font.register() | 2024+ | Avoids CJK subsetting bugs in pdf-lib |
| @react-pdf/renderer broken in App Router | Fixed with React 19 | Feb 2025 (Issue #3074) | renderToBuffer works in Next.js 15 App Router routes with React 19 |
| LinkedIn customized pre-fill URLs | Static URL with optional params | 2024 | LinkedIn no longer auto-fills; members must confirm info |

**Deprecated/outdated:**
- `pdfkit-cjk`: Last published 12 years ago, not needed -- modern PDFKit handles CJK natively with fontkit
- `@pdf-lib/fontkit` CJK subsetting: Known broken for Chinese fonts (Issue #494), use `@pdfme/pdf-lib` fork if you must use pdf-lib
- LinkedIn auto-fill Add to Profile: LinkedIn changed policy; fields are no longer auto-populated, members enter info themselves

## Open Questions

1. **Font file deployment on Vercel/serverless**
   - What we know: Files in `public/` are accessible via HTTP but filesystem access may be limited in serverless functions. `process.cwd()` should work on Vercel for files in the project root.
   - What's unclear: Whether `path.join(process.cwd(), 'public/fonts/...')` reliably works in all deployment targets.
   - Recommendation: Test with production build locally (`next build && next start`). If file path fails, fall back to fetching font via HTTP URL (e.g., `${process.env.NEXT_PUBLIC_APP_URL}/fonts/NotoSansSC-Regular.ttf`).

2. **Font file size impact on build/deploy**
   - What we know: Noto Sans SC Subset OTF is ~5-9MB per weight. Two weights (Regular + Bold) = ~10-18MB added to the project.
   - What's unclear: Whether this causes issues with deployment size limits.
   - Recommendation: Use only Regular and Bold weights. The subset (SC-only) versions are sufficient for Simplified Chinese. Consider only using one weight if size is critical.

3. **Clerk middleware public route configuration**
   - What we know: The project uses Clerk. The verification page must be public.
   - What's unclear: Exact current Clerk middleware configuration in this project.
   - Recommendation: Add `/verify/:path*` to public routes in Clerk middleware. Also ensure the certificate download API validates auth while the verification page does not.

## Sources

### Primary (HIGH confidence)
- [GitHub: @react-pdf/renderer Issue #3074](https://github.com/diegomura/react-pdf/issues/3074) - Next.js 15 renderToBuffer fix confirmed with React 19
- [@react-pdf/renderer npm](https://www.npmjs.com/package/@react-pdf/renderer) - v4.3.2, React 19 compatible
- [react-pdf.org/fonts](https://react-pdf.org/fonts) - Official font registration docs
- [LinkedIn Add to Profile](https://addtoprofile.linkedin.com/) - Official URL scheme documentation
- [GitHub: notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) - Noto Sans SC subset fonts

### Secondary (MEDIUM confidence)
- [GitHub: pdf-lib Issue #494](https://github.com/Hopding/pdf-lib/issues/494) - CJK subsetting bugs confirmed by multiple users
- [PDFKit.org](https://pdfkit.org/) - PDFKit font support documentation
- [LinkedIn Help: Add to Profile](https://www.linkedin.com/help/linkedin/answer/a528030) - Certification URL parameters

### Tertiary (LOW confidence)
- WebSearch results on font file sizes for Noto Sans SC (varies by source, ~5-9MB for subset)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @react-pdf/renderer is well-documented, React 19 fix is confirmed, Font.register() supports CJK
- Architecture: HIGH - Pattern follows existing project conventions (Drizzle schema, API routes, App Router)
- Pitfalls: HIGH - CJK font issues are well-documented across multiple libraries, Clerk public routes are a known pattern
- LinkedIn sharing: MEDIUM - LinkedIn changed auto-fill policy; URL scheme still works but fields may not pre-populate

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (30 days - stable domain, libraries are mature)
