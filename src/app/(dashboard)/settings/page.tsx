import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { OnboardingWalkthroughCard } from "@/components/settings/OnboardingWalkthroughCard";

export const metadata = {
  title: "Settings - Canto to Mando",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const roleLabel = user.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : "Student";

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Basic account and learning preferences preset.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <aside className="space-y-4 lg:col-span-1">
          <section id="onboarding">
            <OnboardingWalkthroughCard />
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Account
            </h2>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium text-foreground">
                  {user.name || user.email}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium text-foreground break-all">
                  {user.email}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Role</p>
                <p className="text-sm font-medium text-foreground">{roleLabel}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Terms and Conditions
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Read the platform terms that apply to all user types.
            </p>
            <Link
              href="/settings/terms"
              className="mt-3 inline-flex rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Terms and Conditions
            </Link>
          </section>

        </aside>

        <div className="space-y-6 lg:col-span-2">
          <section id="preferences">
            <SettingsForm
              dailyGoalXp={user.dailyGoalXp}
              userName={user.name || user.email}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
