"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const roleFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z
    .string()
    .max(500, "Description too long")
    .optional()
    .or(z.literal("")),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

type RoleFormData = z.infer<typeof roleFormSchema>;

const COLOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#78716c",
];

interface RoleFormProps {
  role?: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    sortOrder: number;
  } | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RoleForm({ role, onSuccess, onCancel }: RoleFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: role?.name ?? "",
      description: role?.description ?? "",
      color: role?.color ?? "#3b82f6",
    },
  });

  const selectedColor = watch("color");

  const onSubmit = async (data: RoleFormData) => {
    try {
      const res = await fetch(
        role ? `/api/admin/roles/${role.id}` : "/api/admin/roles",
        {
          method: role ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            description: data.description || undefined,
            color: data.color,
          }),
        }
      );

      if (!res.ok) {
        const responseData = await res.json();
        if (res.status === 400) {
          toast.error(responseData.error || "Validation error");
        } else if (res.status === 409) {
          toast.error(
            responseData.error || "A role with this name already exists"
          );
        } else {
          toast.error("An unexpected error occurred");
        }
        return;
      }

      toast.success(role ? "Role updated" : "Role created");
      onSuccess();
    } catch {
      toast.error("Network error -- please try again");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="role-name">
          Name <span className="text-red-400">*</span>
        </Label>
        <Input
          id="role-name"
          {...register("name")}
          placeholder="e.g. Gold, Premium, Beginner"
        />
        {errors.name && (
          <p className="text-sm text-red-400">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="role-description">
          Description
        </Label>
        <Textarea
          id="role-description"
          {...register("description")}
          placeholder="Optional description for this role"
          rows={3}
          className="resize-y"
        />
        {errors.description && (
          <p className="text-sm text-red-400">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setValue("color", hex)}
              className={`h-8 w-8 rounded-full transition-all ${
                selectedColor === hex
                  ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background"
                  : "hover:scale-105"
              }`}
              style={{ backgroundColor: hex }}
              aria-label={`Select color ${hex}`}
            />
          ))}
        </div>
        {errors.color && (
          <p className="text-sm text-red-400">{errors.color.message}</p>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : role
              ? "Update Role"
              : "Create Role"}
        </Button>
      </div>
    </form>
  );
}
