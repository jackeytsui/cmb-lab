import { ShieldCheck, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, differenceInDays, format } from "date-fns";
import { FEATURE_LABELS } from "@/lib/feature-labels";

interface RoleViewCourse {
  courseTitle: string;
  accessTier: "preview" | "full";
}

interface RoleViewItem {
  name: string;
  color: string;
  description: string | null;
  allCourses: boolean;
  expiresAt: string | null;
  courses: RoleViewCourse[];
  features: string[];
}

interface MyRolesSectionProps {
  roles: RoleViewItem[];
}

export function MyRolesSection({ roles }: MyRolesSectionProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">
          My Roles & Access
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Roles assigned to you and what they grant
      </p>

      {roles.length === 0 ? (
        <div className="text-center py-6">
          <ShieldCheck className="w-10 h-10 text-muted-foreground/70 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            You don&apos;t have any roles assigned yet
          </p>
          <p className="text-sm text-muted-foreground/80 mt-1">
            Contact your coach for access.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <RoleCard key={role.name} role={role} />
          ))}
        </div>
      )}
    </section>
  );
}

function RoleCard({ role }: { role: RoleViewItem }) {
  const expirationInfo = getExpirationInfo(role.expiresAt);

  return (
    <div className="rounded-lg border border-border bg-background/40 p-4 space-y-3">
      {/* Role header */}
      <div className="flex items-center gap-3">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: role.color }}
        />
        <span className="font-medium text-foreground">{role.name}</span>
        <span
          className={`ml-auto text-xs ${expirationInfo.colorClass}`}
        >
          {expirationInfo.text}
        </span>
      </div>

      {/* Description */}
      {role.description && (
        <p className="text-sm text-muted-foreground">{role.description}</p>
      )}

      {/* Courses */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Courses
        </h4>
        {role.allCourses ? (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Globe className="w-4 h-4" />
            <span>All Courses</span>
          </div>
        ) : role.courses.length > 0 ? (
          <div className="space-y-1">
            {role.courses.map((course, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-foreground/90">{course.courseTitle}</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] py-0 px-1.5 ${
                    course.accessTier === "full"
                      ? "text-emerald-600 border-emerald-500/40 dark:text-emerald-300 dark:border-emerald-300/40"
                      : "text-amber-700 border-amber-500/40 dark:text-amber-300 dark:border-amber-300/40"
                  }`}
                >
                  {course.accessTier}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/80">No courses assigned</p>
        )}
      </div>

      {/* Features */}
      {role.features.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Features
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {role.features.map((key) => (
              <Badge
                key={key}
                variant="outline"
                className="text-[10px] py-0 px-1.5 text-foreground/80 border-border"
              >
                {FEATURE_LABELS[key] ?? key}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getExpirationInfo(expiresAt: string | null): {
  text: string;
  colorClass: string;
} {
  if (!expiresAt) {
    return { text: "No expiration", colorClass: "text-emerald-600 dark:text-emerald-300" };
  }

  const expDate = new Date(expiresAt);
  const daysLeft = differenceInDays(expDate, new Date());

  if (daysLeft <= 7) {
    return {
      text: `Expires ${formatDistanceToNow(expDate, { addSuffix: true })}`,
      colorClass: "text-amber-700 dark:text-amber-300",
    };
  }

  return {
    text: `Expires ${format(expDate, "MMM d, yyyy")}`,
    colorClass: "text-muted-foreground",
  };
}
