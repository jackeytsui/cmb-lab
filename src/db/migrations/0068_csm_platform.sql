-- Customer Success Management (CSM) platform foundation.
--
-- Adds a unified customer-success layer on top of the LMS: a health-score
-- ledger, lifecycle-managed customer accounts, risk/opportunity signals,
-- config-as-data playbooks + runs, a prioritised CSM worklist, and a
-- touchpoint timeline.
--
-- Fully idempotent (DO-block enum guards + IF NOT EXISTS) so it is safe to
-- re-run via scripts/apply-migrations.mjs.

-- ============================================================
-- Enums
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_lifecycle_stage') THEN
    CREATE TYPE "csm_lifecycle_stage" AS ENUM (
      'onboarding','adopting','established','at_risk','renewal','expansion','churned','reactivated'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_health_band') THEN
    CREATE TYPE "csm_health_band" AS ENUM ('thriving','healthy','watch','at_risk','critical');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_trend') THEN
    CREATE TYPE "csm_trend" AS ENUM ('improving','steady','declining');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_signal_type') THEN
    CREATE TYPE "csm_signal_type" AS ENUM (
      'inactivity','stalled_progress','onboarding_stall','low_satisfaction','coaching_gap',
      'streak_broken','payment_risk','renewal_upcoming','expansion_signal','milestone_reached','champion'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_signal_severity') THEN
    CREATE TYPE "csm_signal_severity" AS ENUM ('info','low','medium','high','critical');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_signal_status') THEN
    CREATE TYPE "csm_signal_status" AS ENUM ('open','acknowledged','resolved','dismissed','expired');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_playbook_trigger') THEN
    CREATE TYPE "csm_playbook_trigger" AS ENUM ('signal','lifecycle_stage','health_band','manual','schedule');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_playbook_run_status') THEN
    CREATE TYPE "csm_playbook_run_status" AS ENUM ('active','completed','cancelled','failed');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_task_status') THEN
    CREATE TYPE "csm_task_status" AS ENUM ('open','in_progress','done','snoozed','dismissed');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_task_priority') THEN
    CREATE TYPE "csm_task_priority" AS ENUM ('low','medium','high','urgent');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'csm_activity_type') THEN
    CREATE TYPE "csm_activity_type" AS ENUM (
      'note','email','call','meeting','coaching_session','loom','in_app_message','survey_response','system'
    );
  END IF;
END $$;

-- ============================================================
-- csm_accounts
-- ============================================================

CREATE TABLE IF NOT EXISTS "csm_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_ref" text,
  "account_name" text,
  "owner_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "lifecycle_stage" "csm_lifecycle_stage" DEFAULT 'onboarding' NOT NULL,
  "health_score" integer,
  "health_band" "csm_health_band",
  "health_trend" "csm_trend",
  "churn_risk" integer,
  "product_line" text,
  "mrr_cents" integer,
  "renewal_date" timestamptz,
  "onboarded_at" timestamptz,
  "last_touch_at" timestamptz,
  "last_activity_at" timestamptz,
  "health_computed_at" timestamptz,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "csm_accounts_user_unique" ON "csm_accounts" ("user_id");
CREATE INDEX IF NOT EXISTS "csm_accounts_owner_idx" ON "csm_accounts" ("owner_id");
CREATE INDEX IF NOT EXISTS "csm_accounts_stage_idx" ON "csm_accounts" ("lifecycle_stage");
CREATE INDEX IF NOT EXISTS "csm_accounts_band_idx" ON "csm_accounts" ("health_band");
CREATE INDEX IF NOT EXISTS "csm_accounts_account_ref_idx" ON "csm_accounts" ("account_ref");
CREATE INDEX IF NOT EXISTS "csm_accounts_churn_idx" ON "csm_accounts" ("churn_risk");

-- ============================================================
-- customer_health_scores (append-only ledger)
-- ============================================================

CREATE TABLE IF NOT EXISTS "customer_health_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" uuid REFERENCES "csm_accounts"("id") ON DELETE CASCADE,
  "score" integer NOT NULL,
  "band" "csm_health_band" NOT NULL,
  "trend" "csm_trend" DEFAULT 'steady' NOT NULL,
  "churn_risk" integer DEFAULT 0 NOT NULL,
  "previous_score" integer,
  "factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "summary" text,
  "computed_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "customer_health_scores_user_idx" ON "customer_health_scores" ("user_id");
CREATE INDEX IF NOT EXISTS "customer_health_scores_user_computed_idx" ON "customer_health_scores" ("user_id","computed_at");
CREATE INDEX IF NOT EXISTS "customer_health_scores_band_idx" ON "customer_health_scores" ("band");

-- ============================================================
-- csm_signals
-- ============================================================

CREATE TABLE IF NOT EXISTS "csm_signals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" uuid REFERENCES "csm_accounts"("id") ON DELETE CASCADE,
  "type" "csm_signal_type" NOT NULL,
  "severity" "csm_signal_severity" DEFAULT 'medium' NOT NULL,
  "status" "csm_signal_status" DEFAULT 'open' NOT NULL,
  "title" text NOT NULL,
  "detail" text,
  "dedupe_key" text,
  "data" jsonb DEFAULT '{}'::jsonb,
  "detected_at" timestamp DEFAULT now() NOT NULL,
  "acknowledged_at" timestamp,
  "acknowledged_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "csm_signals_user_idx" ON "csm_signals" ("user_id");
CREATE INDEX IF NOT EXISTS "csm_signals_status_idx" ON "csm_signals" ("status");
CREATE INDEX IF NOT EXISTS "csm_signals_type_idx" ON "csm_signals" ("type");
CREATE INDEX IF NOT EXISTS "csm_signals_severity_idx" ON "csm_signals" ("severity");
CREATE UNIQUE INDEX IF NOT EXISTS "csm_signals_dedupe_unique" ON "csm_signals" ("dedupe_key");

-- ============================================================
-- csm_playbooks (config-as-data)
-- ============================================================

CREATE TABLE IF NOT EXISTS "csm_playbooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "trigger" "csm_playbook_trigger" NOT NULL,
  "trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "set_lifecycle_stage" "csm_lifecycle_stage",
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "csm_playbooks_trigger_idx" ON "csm_playbooks" ("trigger");
CREATE INDEX IF NOT EXISTS "csm_playbooks_active_idx" ON "csm_playbooks" ("is_active");

-- ============================================================
-- csm_playbook_runs
-- ============================================================

CREATE TABLE IF NOT EXISTS "csm_playbook_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "playbook_id" uuid NOT NULL REFERENCES "csm_playbooks"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" uuid REFERENCES "csm_accounts"("id") ON DELETE CASCADE,
  "signal_id" uuid REFERENCES "csm_signals"("id") ON DELETE SET NULL,
  "status" "csm_playbook_run_status" DEFAULT 'active' NOT NULL,
  "current_step" integer DEFAULT 0 NOT NULL,
  "enroll_key" text,
  "log" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "csm_playbook_runs_user_idx" ON "csm_playbook_runs" ("user_id");
CREATE INDEX IF NOT EXISTS "csm_playbook_runs_playbook_idx" ON "csm_playbook_runs" ("playbook_id");
CREATE INDEX IF NOT EXISTS "csm_playbook_runs_status_idx" ON "csm_playbook_runs" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "csm_playbook_runs_enroll_unique" ON "csm_playbook_runs" ("enroll_key");

-- ============================================================
-- csm_tasks (the CSM worklist)
-- ============================================================

CREATE TABLE IF NOT EXISTS "csm_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" uuid REFERENCES "csm_accounts"("id") ON DELETE CASCADE,
  "assigned_to" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "status" "csm_task_status" DEFAULT 'open' NOT NULL,
  "priority" "csm_task_priority" DEFAULT 'medium' NOT NULL,
  "suggested_action" text,
  "due_at" timestamp,
  "snoozed_until" timestamp,
  "signal_id" uuid REFERENCES "csm_signals"("id") ON DELETE SET NULL,
  "playbook_run_id" uuid REFERENCES "csm_playbook_runs"("id") ON DELETE SET NULL,
  "source" text DEFAULT 'manual' NOT NULL,
  "completed_at" timestamp,
  "completed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "csm_tasks_user_idx" ON "csm_tasks" ("user_id");
CREATE INDEX IF NOT EXISTS "csm_tasks_assigned_idx" ON "csm_tasks" ("assigned_to");
CREATE INDEX IF NOT EXISTS "csm_tasks_status_idx" ON "csm_tasks" ("status");
CREATE INDEX IF NOT EXISTS "csm_tasks_due_idx" ON "csm_tasks" ("due_at");
CREATE INDEX IF NOT EXISTS "csm_tasks_assigned_status_idx" ON "csm_tasks" ("assigned_to","status");

-- ============================================================
-- csm_activities (touchpoint timeline)
-- ============================================================

CREATE TABLE IF NOT EXISTS "csm_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" uuid REFERENCES "csm_accounts"("id") ON DELETE CASCADE,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "type" "csm_activity_type" NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "is_outreach" boolean DEFAULT false NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "csm_activities_user_idx" ON "csm_activities" ("user_id");
CREATE INDEX IF NOT EXISTS "csm_activities_user_occurred_idx" ON "csm_activities" ("user_id","occurred_at");
CREATE INDEX IF NOT EXISTS "csm_activities_type_idx" ON "csm_activities" ("type");
