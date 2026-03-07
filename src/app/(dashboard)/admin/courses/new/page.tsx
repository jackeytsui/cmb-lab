"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { CourseForm } from "@/components/admin/CourseForm";

/**
 * Admin Create Course page.
 */
export default function AdminNewCoursePage() {
  const router = useRouter();

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-zinc-400">
          <Link href="/admin" className="hover:text-white">
            Admin
          </Link>
          <span className="mx-2">/</span>
          <Link href="/admin/courses" className="hover:text-white">
            Courses
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-200">New</span>
        </nav>

        {/* Page header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Create Course</h1>
          <p className="mt-2 text-zinc-400">
            Add a new course to your catalog
          </p>
        </header>

        {/* Course form */}
        <CourseForm
          onSuccess={() => router.push("/admin/courses")}
          onCancel={() => router.push("/admin/courses")}
        />
      </div>
  );
}
