"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ModuleForm } from "@/components/admin/ModuleForm";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

/**
 * Admin Create Module page.
 */
export default function AdminNewModulePage({ params }: PageProps) {
  const { courseId } = use(params);
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
          <span className="text-zinc-200">New Module</span>
        </nav>

        {/* Page header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Create Module</h1>
          <p className="mt-2 text-zinc-400">
            Add a new module to this course
          </p>
        </header>

        {/* Module form */}
        <ModuleForm
          courseId={courseId}
          onSuccess={() => router.push(`/admin/courses/${courseId}`)}
          onCancel={() => router.push(`/admin/courses/${courseId}`)}
        />
      </div>
  );
}
