CREATE TABLE "art" (
	"name" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"about" text NOT NULL,
	"place" text,
	"replaces" text,
	"px" text NOT NULL,
	"ramp" jsonb,
	"drawn_for" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "asks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"staff_id" text NOT NULL,
	"kind" text DEFAULT 'approval' NOT NULL,
	"title" text NOT NULL,
	"why" text NOT NULL,
	"if_approved" text NOT NULL,
	"access" jsonb,
	"hire" jsonb,
	"goal" jsonb,
	"plan" jsonb,
	"revises" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attachments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"staff_id" text NOT NULL,
	"path" text NOT NULL,
	"media_type" text NOT NULL,
	"task_id" integer,
	"ask_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_one_owner" CHECK (num_nonnulls("attachments"."task_id", "attachments"."ask_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"kind" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"registry" text,
	"read_tools" text[] DEFAULT '{}' NOT NULL,
	"tools" text[] DEFAULT '{}' NOT NULL,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "follow_ups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"staff_id" text NOT NULL,
	"kind" text NOT NULL,
	"ask_id" integer,
	"report_id" integer,
	"task_id" integer,
	"goal_id" integer,
	"note" text,
	"report_when_done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"outcome" text,
	"result" text,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "goal_progress" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "goal_progress_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"goal_id" integer NOT NULL,
	"staff_id" text NOT NULL,
	"health" text NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "goals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"why" text,
	"done_when" text,
	"horizon" text DEFAULT 'ongoing' NOT NULL,
	"due" text,
	"area" text DEFAULT 'work' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"staff_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"level" text DEFAULT 'read' NOT NULL,
	"ask_id" integer,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grants_staff_id_connector_id_pk" PRIMARY KEY("staff_id","connector_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"staff_id" text NOT NULL,
	"name" text NOT NULL,
	"instructions" text NOT NULL,
	"schedule" jsonb NOT NULL,
	"report" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"reason" text,
	"ask_id" integer,
	"task_id" integer,
	"run_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"embedding" vector(768)
);
--> statement-breakpoint
CREATE TABLE "office_rooms" (
	"office" text PRIMARY KEY NOT NULL,
	"rooms" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "offices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text NOT NULL,
	"spec" jsonb NOT NULL,
	"plan" jsonb NOT NULL,
	"templates" jsonb NOT NULL,
	"kinds" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"moved_in_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "owner" (
	"id" text PRIMARY KEY DEFAULT 'owner' NOT NULL,
	"name" text NOT NULL,
	"welcomed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"px" text NOT NULL,
	"drawn_for" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parts_kind_name_pk" PRIMARY KEY("kind","name")
);
--> statement-breakpoint
CREATE TABLE "plan_limits" (
	"id" text PRIMARY KEY DEFAULT 'claude' NOT NULL,
	"five_hour" double precision NOT NULL,
	"five_hour_resets_at" timestamp with time zone,
	"seven_day" double precision NOT NULL,
	"seven_day_resets_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pokes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"staff_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"staff_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_names" (
	"office" text NOT NULL,
	"room" text NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_names_office_room_pk" PRIMARY KEY("office","room")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job_id" integer NOT NULL,
	"staff_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"summary" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"office" text DEFAULT 'Main Street' NOT NULL,
	"sprite" text DEFAULT 'staff' NOT NULL,
	"variant" text NOT NULL,
	"portrait" text NOT NULL,
	"room" text DEFAULT 'workspace' NOT NULL,
	"permission" text DEFAULT 'read' NOT NULL,
	"tools" text[] DEFAULT '{"search_ledger","give_owner_a_task","find_connectors","ask_for_access","edit_my_job","edit_my_description","poke_owner"}' NOT NULL,
	"remit" text NOT NULL,
	"desk" text NOT NULL,
	"look" jsonb,
	"portrait_px" text,
	"hired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff_goals" (
	"staff_id" text NOT NULL,
	"goal_id" integer NOT NULL,
	"part" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_goals_staff_id_goal_id_pk" PRIMARY KEY("staff_id","goal_id")
);
--> statement-breakpoint
CREATE TABLE "switched_off" (
	"office" text NOT NULL,
	"obj" text NOT NULL,
	"off_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "switched_off_office_obj_pk" PRIMARY KEY("office","obj")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"staff_id" text,
	"ask_id" integer,
	"title" text NOT NULL,
	"why" text NOT NULL,
	"steps" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usage_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"staff_id" text,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "art" ADD CONSTRAINT "art_drawn_for_offices_id_fk" FOREIGN KEY ("drawn_for") REFERENCES "public"."offices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asks" ADD CONSTRAINT "asks_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ask_id_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."asks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_ask_id_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."asks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_ask_id_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."asks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_ask_id_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."asks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_drawn_for_staff_id_fk" FOREIGN KEY ("drawn_for") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokes" ADD CONSTRAINT "pokes_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_goals" ADD CONSTRAINT "staff_goals_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_goals" ADD CONSTRAINT "staff_goals_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ask_id_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."asks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_by_task" ON "attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "attachments_by_ask" ON "attachments" USING btree ("ask_id");--> statement-breakpoint
CREATE INDEX "goal_progress_goal_idx" ON "goal_progress" USING btree ("goal_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_embedding" ON "ledger" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "ledger_words" ON "ledger" USING gin (to_tsvector('english', "title" || ' ' || "body" || ' ' || coalesce("reason", '')));--> statement-breakpoint
CREATE INDEX "usage_by_staff" ON "usage" USING btree ("staff_id","created_at");--> statement-breakpoint

-- Written by hand from here on: what schema.ts cannot say. Every change to a
-- table the page shows sends one notice on the `office` channel, naming the
-- table. The office app listens and pushes it to the page, so a row an odd
-- writes reaches the owner's screen without polling. A new table the page
-- shows gets a trigger in the migration that adds it.
CREATE FUNCTION office_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('office', TG_TABLE_NAME);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER staff_notify AFTER INSERT OR UPDATE OR DELETE ON staff FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER asks_notify AFTER INSERT OR UPDATE OR DELETE ON asks FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER tasks_notify AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER reports_notify AFTER INSERT OR UPDATE OR DELETE ON reports FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER grants_notify AFTER INSERT OR UPDATE OR DELETE ON grants FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER jobs_notify AFTER INSERT OR UPDATE OR DELETE ON jobs FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER runs_notify AFTER INSERT OR UPDATE OR DELETE ON runs FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER connectors_notify AFTER INSERT OR UPDATE OR DELETE ON connectors FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER usage_notify AFTER INSERT OR UPDATE OR DELETE ON usage FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER plan_limits_notify AFTER INSERT OR UPDATE OR DELETE ON plan_limits FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER follow_ups_notify AFTER INSERT OR UPDATE OR DELETE ON follow_ups FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER attachments_notify AFTER INSERT OR UPDATE OR DELETE ON attachments FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER pokes_notify AFTER INSERT OR UPDATE OR DELETE ON pokes FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER room_names_notify AFTER INSERT OR UPDATE OR DELETE ON room_names FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER switched_off_notify AFTER INSERT OR UPDATE OR DELETE ON switched_off FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER goals_notify AFTER INSERT OR UPDATE OR DELETE ON goals FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER staff_goals_notify AFTER INSERT OR UPDATE OR DELETE ON staff_goals FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
CREATE TRIGGER goal_progress_notify AFTER INSERT OR UPDATE OR DELETE ON goal_progress FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
--> statement-breakpoint
-- Moving into a layout updates its row: the page hears it and reloads the floor.
CREATE TRIGGER offices_notify AFTER UPDATE ON offices FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
