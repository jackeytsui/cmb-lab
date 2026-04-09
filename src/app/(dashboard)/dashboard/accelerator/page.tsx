import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  users,
  typingSentences,
  typingProgress,
  conversationScripts,
  scriptLines,
  scriptLineProgress,
  curatedPassages,
  passageReadStatus,
  acceleratorContentCompletion,
  toneMasteryClips,
  toneMasteryProgress,
  listeningQuestions,
  listeningProgress,
} from "@/db/schema";
import { eq, asc, count, sql } from "drizzle-orm";
import { FeatureGate } from "@/components/auth/FeatureGate";
import { resolvePermissions } from "@/lib/permissions";
import {
  getUserFeatureTagOverrides,
  hasFeatureWithTagOverrides,
} from "@/lib/tag-feature-access";
import Link from "next/link";
import {
  Keyboard,
  MessageSquare,
  BookOpen,
  Trophy,
  ChevronRight,
  ClipboardList,
  Package,
  AudioLines,
  Music,
  Ear,
} from "lucide-react";

interface SectionProgress {
  label: string;
  href: string;
  icon: React.ReactNode;
  completed: number;
  total: number;
  color: string;
}

function ProgressCard({ section }: { section: SectionProgress }) {
  const pct =
    section.total > 0
      ? Math.round((section.completed / section.total) * 100)
      : 0;
  const isComplete = section.total > 0 && section.completed >= section.total;

  return (
    <Link
      href={section.href}
      className="block group rounded-xl border border-border bg-card p-5 hover:border-cyan-500/30 hover:bg-accent/50 transition-all"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`rounded-lg p-2 ${section.color}`}
          >
            {section.icon}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{section.label}</h3>
            <p className="text-sm text-muted-foreground">
              {section.completed}/{section.total} completed
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>

      {/* Progress bar */}
      <div className="mt-4 space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{pct}%</span>
          {isComplete && (
            <span className="text-emerald-500 font-medium flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              Complete
            </span>
          )}
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isComplete ? "bg-emerald-500" : "bg-cyan-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

async function AcceleratorDashboard() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!user) redirect("/sign-in");

  // --- Typing Kit progress ---
  const [typingTotal] = await db
    .select({ count: count() })
    .from(typingSentences);
  const [typingDone] = await db
    .select({ count: count() })
    .from(typingProgress)
    .where(eq(typingProgress.userId, user.id));

  // --- Conversation Scripts progress ---
  const [scriptsTotal] = await db
    .select({ count: count() })
    .from(scriptLines);
  const [scriptsDone] = await db
    .select({ count: count() })
    .from(scriptLineProgress)
    .where(eq(scriptLineProgress.userId, user.id));

  // --- Curated Passages progress ---
  const [passagesTotal] = await db
    .select({ count: count() })
    .from(curatedPassages);
  const [passagesDone] = await db
    .select({ count: count() })
    .from(passageReadStatus)
    .where(eq(passageReadStatus.userId, user.id));

  // --- Content page completions (Practice Plan, Starter Pack) ---
  const contentCompletions = await db
    .select({ contentKey: acceleratorContentCompletion.contentKey })
    .from(acceleratorContentCompletion)
    .where(eq(acceleratorContentCompletion.userId, user.id));
  const completedKeys = new Set(contentCompletions.map((r) => r.contentKey));

  const sections: SectionProgress[] = [
    {
      label: "Practice Plan",
      href: "/dashboard/accelerator/practice-plan",
      icon: <ClipboardList className="w-5 h-5" />,
      completed: completedKeys.has("practice_plan") ? 1 : 0,
      total: 1,
      color: "bg-purple-500/10 text-purple-500",
    },
    {
      label: "Starter Pack",
      href: "/dashboard/accelerator/starter-pack",
      icon: <Package className="w-5 h-5" />,
      completed: completedKeys.has("starter_pack") ? 1 : 0,
      total: 1,
      color: "bg-pink-500/10 text-pink-500",
    },
    {
      label: "Typing Unlock Kit",
      href: "/dashboard/accelerator/typing",
      icon: <Keyboard className="w-5 h-5" />,
      completed: typingDone.count,
      total: typingTotal.count,
      color: "bg-blue-500/10 text-blue-500",
    },
    {
      label: "Conversation Scripts",
      href: "/dashboard/accelerator/scripts",
      icon: <MessageSquare className="w-5 h-5" />,
      completed: scriptsDone.count,
      total: scriptsTotal.count,
      color: "bg-amber-500/10 text-amber-500",
    },
    {
      label: "Curated Passages",
      href: "/dashboard/accelerator/reader",
      icon: <BookOpen className="w-5 h-5" />,
      completed: passagesDone.count,
      total: passagesTotal.count,
      color: "bg-emerald-500/10 text-emerald-500",
    },
  ];

  // --- Extra Pack: check which features the user has access to ---
  const permissions = await resolvePermissions(user.id);
  const tagOverrides = await getUserFeatureTagOverrides(user.id);

  const hasAudioAccelerator = hasFeatureWithTagOverrides(
    "audio_accelerator_edition",
    permissions.features.has("audio_accelerator_edition"),
    tagOverrides,
  );
  const hasToneMastery = hasFeatureWithTagOverrides(
    "tone_mastery",
    permissions.features.has("tone_mastery"),
    tagOverrides,
  );
  const hasListeningTraining = hasFeatureWithTagOverrides(
    "listening_training",
    permissions.features.has("listening_training"),
    tagOverrides,
  );

  const extraSections: SectionProgress[] = [];

  if (hasAudioAccelerator) {
    extraSections.push({
      label: "Audio Accelerator Edition",
      href: "/dashboard/accelerator-extra/audio",
      icon: <AudioLines className="w-5 h-5" />,
      completed: 0,
      total: 1,
      color: "bg-indigo-500/10 text-indigo-500",
    });
  }

  if (hasToneMastery) {
    const [toneTotal] = await db.select({ count: count() }).from(toneMasteryClips);
    const [toneDone] = await db
      .select({ count: count() })
      .from(toneMasteryProgress)
      .where(eq(toneMasteryProgress.userId, user.id));
    extraSections.push({
      label: "Tone Mastery",
      href: "/dashboard/accelerator-extra/tone-mastery",
      icon: <Music className="w-5 h-5" />,
      completed: toneDone.count,
      total: toneTotal.count,
      color: "bg-violet-500/10 text-violet-500",
    });
  }

  if (hasListeningTraining) {
    const [listenTotal] = await db.select({ count: count() }).from(listeningQuestions);
    const [listenDone] = await db
      .select({ count: count() })
      .from(listeningProgress)
      .where(eq(listeningProgress.userId, user.id));
    extraSections.push({
      label: "Listening Training",
      href: "/dashboard/accelerator-extra/listening-training",
      icon: <Ear className="w-5 h-5" />,
      completed: listenDone.count,
      total: listenTotal.count,
      color: "bg-cyan-500/10 text-cyan-500",
    });
  }

  const allSections = [...sections, ...extraSections];
  const totalItems = allSections.reduce((s, sec) => s + sec.total, 0);
  const totalDone = allSections.reduce((s, sec) => s + sec.completed, 0);
  const overallPct =
    totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;
  const allComplete = totalItems > 0 && totalDone >= totalItems;

  return (
    <div className="container mx-auto px-4 py-8 space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          My Progress: Mandarin Accelerator
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your progress across all accelerator content.
        </p>
      </div>

      {/* Overall progress */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Overall Progress</h2>
          <span className="text-2xl font-bold text-foreground">{overallPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              allComplete ? "bg-emerald-500" : "bg-cyan-500"
            }`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {totalDone} of {totalItems} items completed
        </p>
        {allComplete && (
          <div className="flex items-center gap-2 text-emerald-500 font-medium text-sm mt-2">
            <Trophy className="w-4 h-4" />
            All content completed!
          </div>
        )}
      </div>

      {/* Section cards */}
      <div className="space-y-4">
        {sections.map((section) => (
          <ProgressCard key={section.label} section={section} />
        ))}
      </div>

      {/* Extra Pack sections (if student has access) */}
      {extraSections.length > 0 && (
        <>
          <div className="pt-2">
            <h2 className="text-lg font-semibold text-foreground">
              Extra Pack
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your bonus order bump content.
            </p>
          </div>
          <div className="space-y-4">
            {extraSections.map((section) => (
              <ProgressCard key={section.label} section={section} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function AcceleratorPage() {
  return (
    <FeatureGate feature="mandarin_accelerator">
      <AcceleratorDashboard />
    </FeatureGate>
  );
}
