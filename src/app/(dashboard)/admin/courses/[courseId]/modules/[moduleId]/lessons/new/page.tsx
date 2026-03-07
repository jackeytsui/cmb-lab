"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LessonForm } from "@/components/admin/LessonForm";

interface PageProps {
  params: Promise<{ courseId: string; moduleId: string }>;
}

/**
 * Admin Create Lesson page.
 */
export default function AdminNewLessonPage({ params }: PageProps) {
  const { courseId, moduleId } = use(params);
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
          <Link href={`/admin/courses/${courseId}`} className="hover:text-white">
            Course
          </Link>
          <span className="mx-2">/</span>
          <Link
            href={`/admin/courses/${courseId}/modules/${moduleId}`}
            className="hover:text-white"
          >
            Module
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-200">New Lesson</span>
        </nav>

        {/* Page header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Create Lesson</h1>
          <p className="mt-2 text-zinc-400">
            Add a new lesson to this module
          </p>
        </header>

        {/* Lesson form */}
        <LessonForm
          moduleId={moduleId}
          onSuccess={() =>
            router.push(`/admin/courses/${courseId}/modules/${moduleId}`)
          }
          onCancel={() =>
            router.push(`/admin/courses/${courseId}/modules/${moduleId}`)
          }
        />
      </div>
  );
}
