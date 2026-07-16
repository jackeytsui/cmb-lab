import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canViewCourseLibrary } from "@/lib/tag-feature-access";
import { Lock } from "lucide-react";

// ---------------------------------------------------------------------------
// CourseLibraryGate — async Server Component.
//
// Course Library visibility is tag-driven, replacing the old course_library
// feature gate:
// - admin/coach always pass (real user role, same as FeatureGate, so admin
//   tools stay reachable during "View As")
// - students pass only with an explicit grant: a tag granting at least one
//   library course, or a per-student grant on any course
// ---------------------------------------------------------------------------

function LockedFallback() {
  return (
    <div className="py-16 text-center">
      <Lock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-zinc-300">
        Course Library is Locked
      </h2>
      <p className="text-zinc-500 mt-2 max-w-md mx-auto">
        This feature is not included in your current plan. Contact your coach
        to upgrade your access.
      </p>
    </div>
  );
}

export async function CourseLibraryGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return <LockedFallback />;
  }

  const realUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true, role: true },
  });
  if (!realUser) {
    return <LockedFallback />;
  }

  const allowed = await canViewCourseLibrary(realUser);
  return allowed ? <>{children}</> : <LockedFallback />;
}
