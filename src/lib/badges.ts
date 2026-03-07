// Badge Definitions — Static TypeScript config computed from user stats at render time
//
// Badges are NOT persisted to a database table. They are derived from
// existing data (XP, streak, lesson count, practice count) and computed
// on each render. This avoids sync problems.

// ============================================================
// Types
// ============================================================

export interface UserStats {
  totalXP: number;
  longestStreak: number;
  currentStreak: number;
  lessonsCompleted: number;
  practiceSetsPerfect: number; // practice sets with score >= 95
  practiceSetsCompleted: number;
  conversationCount: number;
  daysActive: number;
}

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  icon: string; // lucide icon name
  category: "learning" | "streak" | "xp" | "practice";
  check: (stats: UserStats) => { earned: boolean; progress: number; target: number };
}

export interface BadgeResult {
  badge: BadgeDefinition;
  earned: boolean;
  progress: number;
  target: number;
}

// ============================================================
// Badge Definitions
// ============================================================

export const BADGES: BadgeDefinition[] = [
  // --- Learning category (3) ---
  {
    id: "first_lesson",
    title: "First Steps",
    description: "Complete your first lesson",
    icon: "BookOpen",
    category: "learning",
    check: (s) => ({
      earned: s.lessonsCompleted >= 1,
      progress: Math.min(s.lessonsCompleted, 1),
      target: 1,
    }),
  },
  {
    id: "lesson_10",
    title: "Dedicated Learner",
    description: "Complete 10 lessons",
    icon: "GraduationCap",
    category: "learning",
    check: (s) => ({
      earned: s.lessonsCompleted >= 10,
      progress: Math.min(s.lessonsCompleted, 10),
      target: 10,
    }),
  },
  {
    id: "lesson_25",
    title: "Knowledge Seeker",
    description: "Complete 25 lessons",
    icon: "Library",
    category: "learning",
    check: (s) => ({
      earned: s.lessonsCompleted >= 25,
      progress: Math.min(s.lessonsCompleted, 25),
      target: 25,
    }),
  },

  // --- Streak category (3) ---
  {
    id: "streak_3",
    title: "Getting Started",
    description: "Maintain a 3-day streak",
    icon: "Flame",
    category: "streak",
    check: (s) => ({
      earned: s.longestStreak >= 3,
      progress: Math.min(s.longestStreak, 3),
      target: 3,
    }),
  },
  {
    id: "streak_7",
    title: "Week Warrior",
    description: "Maintain a 7-day streak",
    icon: "Flame",
    category: "streak",
    check: (s) => ({
      earned: s.longestStreak >= 7,
      progress: Math.min(s.longestStreak, 7),
      target: 7,
    }),
  },
  {
    id: "streak_30",
    title: "Monthly Master",
    description: "Maintain a 30-day streak",
    icon: "Flame",
    category: "streak",
    check: (s) => ({
      earned: s.longestStreak >= 30,
      progress: Math.min(s.longestStreak, 30),
      target: 30,
    }),
  },

  // --- XP category (3) ---
  {
    id: "xp_100",
    title: "Century Club",
    description: "Earn 100 XP",
    icon: "Trophy",
    category: "xp",
    check: (s) => ({
      earned: s.totalXP >= 100,
      progress: Math.min(s.totalXP, 100),
      target: 100,
    }),
  },
  {
    id: "xp_500",
    title: "Rising Star",
    description: "Earn 500 XP",
    icon: "Star",
    category: "xp",
    check: (s) => ({
      earned: s.totalXP >= 500,
      progress: Math.min(s.totalXP, 500),
      target: 500,
    }),
  },
  {
    id: "xp_2000",
    title: "XP Champion",
    description: "Earn 2000 XP",
    icon: "Award",
    category: "xp",
    check: (s) => ({
      earned: s.totalXP >= 2000,
      progress: Math.min(s.totalXP, 2000),
      target: 2000,
    }),
  },

  // --- Practice category (3) ---
  {
    id: "first_practice",
    title: "Practice Beginner",
    description: "Complete your first practice set",
    icon: "Target",
    category: "practice",
    check: (s) => ({
      earned: s.practiceSetsCompleted >= 1,
      progress: Math.min(s.practiceSetsCompleted, 1),
      target: 1,
    }),
  },
  {
    id: "practice_10",
    title: "Practice Pro",
    description: "Complete 10 practice sets",
    icon: "Zap",
    category: "practice",
    check: (s) => ({
      earned: s.practiceSetsCompleted >= 10,
      progress: Math.min(s.practiceSetsCompleted, 10),
      target: 10,
    }),
  },
  {
    id: "perfect_score",
    title: "Perfectionist",
    description: "Get a perfect score on a practice set",
    icon: "Crown",
    category: "practice",
    check: (s) => ({
      earned: s.practiceSetsPerfect >= 1,
      progress: Math.min(s.practiceSetsPerfect, 1),
      target: 1,
    }),
  },
];

// ============================================================
// Computation
// ============================================================

/**
 * Evaluate all badges against a user's stats.
 * Returns an array of BadgeResult with earned status and progress.
 */
export function computeBadges(stats: UserStats): BadgeResult[] {
  return BADGES.map((badge) => {
    const result = badge.check(stats);
    return {
      badge,
      earned: result.earned,
      progress: result.progress,
      target: result.target,
    };
  });
}
