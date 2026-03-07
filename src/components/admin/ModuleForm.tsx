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
import type { Module } from "@/db/schema/courses";

const moduleSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

type ModuleFormData = {
  title: string;
  description?: string;
  sortOrder: number;
};

interface ModuleFormProps {
  courseId: string;
  module?: Module;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Form for creating and editing modules.
 * Handles both create (POST) and edit (PUT) modes based on module prop.
 */
export function ModuleForm({
  courseId,
  module,
  onSuccess,
  onCancel,
}: ModuleFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!module;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ModuleFormData>({
    resolver: zodResolver(moduleSchema) as never,
    defaultValues: {
      title: module?.title || "",
      description: module?.description || "",
      sortOrder: module?.sortOrder || 0,
    },
  });

  const onSubmit = async (data: ModuleFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const url = isEditMode
        ? `/api/admin/modules/${module.id}`
        : "/api/admin/modules";
      const method = isEditMode ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          courseId: isEditMode ? undefined : courseId,
          description: data.description || null,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to save module");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save module");
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
        {isEditMode ? "Edit Module" : "Create New Module"}
      </h3>

      {error && <ErrorAlert message={error} />}

      <div className="space-y-2">
        <Label htmlFor="title" className="text-zinc-300">
          Title <span className="text-red-400">*</span>
        </Label>
        <Input
          id="title"
          {...register("title")}
          placeholder="Enter module title"
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
          placeholder="Enter module description"
          rows={3}
          className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-400"
        />
        {errors.description && (
          <p className="text-sm text-red-400">{errors.description.message}</p>
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
              ? "Update Module"
              : "Create Module"}
        </Button>
      </div>
    </form>
  );
}
