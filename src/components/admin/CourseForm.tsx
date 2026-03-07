"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { Course } from "@/db/schema/courses";

const courseSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  thumbnailUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  isPublished: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

type CourseFormData = {
  title: string;
  description?: string;
  thumbnailUrl?: string;
  isPublished: boolean;
  sortOrder: number;
};

interface CourseFormProps {
  course?: Course;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Form for creating and editing courses.
 * Handles both create (POST) and edit (PUT) modes based on course prop.
 */
export function CourseForm({ course, onSuccess, onCancel }: CourseFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!course;

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema) as never,
    defaultValues: {
      title: course?.title || "",
      description: course?.description || "",
      thumbnailUrl: course?.thumbnailUrl || "",
      isPublished: course?.isPublished || false,
      sortOrder: course?.sortOrder || 0,
    },
  });

  const isPublished = watch("isPublished");

  const onSubmit = async (data: CourseFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const url = isEditMode
        ? `/api/admin/courses/${course.id}`
        : "/api/admin/courses";
      const method = isEditMode ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          thumbnailUrl: data.thumbnailUrl || null,
          description: data.description || null,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to save course");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save course");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 rounded-lg border border-zinc-700 bg-zinc-800 p-6"
    >
      <h3 className="text-xl font-semibold text-white">
        {isEditMode ? "Edit Course" : "Create New Course"}
      </h3>

      {error && <ErrorAlert message={error} />}

      <div className="space-y-2">
        <Label htmlFor="title" className="text-zinc-300">
          Title <span className="text-red-400">*</span>
        </Label>
        <Input
          id="title"
          {...register("title")}
          placeholder="Enter course title"
          className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-400"
        />
        {errors.title && (
          <p className="text-sm text-red-400">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-zinc-300">
          Description
        </Label>
        <Textarea
          id="description"
          {...register("description")}
          placeholder="Enter course description"
          rows={4}
          className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-400"
        />
        {errors.description && (
          <p className="text-sm text-red-400">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="thumbnailUrl" className="text-zinc-300">
          Thumbnail URL
        </Label>
        <Input
          id="thumbnailUrl"
          type="url"
          {...register("thumbnailUrl")}
          placeholder="https://example.com/thumbnail.jpg"
          className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-400"
        />
        {errors.thumbnailUrl && (
          <p className="text-sm text-red-400">{errors.thumbnailUrl.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sortOrder" className="text-zinc-300">
          Sort Order
        </Label>
        <Input
          id="sortOrder"
          type="number"
          {...register("sortOrder")}
          min={0}
          className="w-32 border-zinc-600 bg-zinc-700 text-white"
        />
        {errors.sortOrder && (
          <p className="text-sm text-red-400">{errors.sortOrder.message}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          id="isPublished"
          type="checkbox"
          {...register("isPublished")}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500"
        />
        <Label htmlFor="isPublished" className="text-zinc-300">
          Published
          {isPublished ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
              Visible to students
            </span>
          ) : (
            <span className="ml-2 inline-flex items-center rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
              Draft
            </span>
          )}
        </Label>
      </div>

      <div className="flex justify-end gap-3 border-t border-zinc-700 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : isEditMode
              ? "Update Course"
              : "Create Course"}
        </Button>
      </div>
    </form>
  );
}
