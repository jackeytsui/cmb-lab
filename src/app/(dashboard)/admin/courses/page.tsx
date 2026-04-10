import { redirect } from "next/navigation";

/**
 * Legacy /admin/courses page — the old Mux-based course admin.
 * Superseded by the Course Library at /admin/course-library.
 * Any direct hit on this URL is redirected to the new page.
 */
export default function LegacyAdminCoursesPage() {
  redirect("/admin/course-library");
}
