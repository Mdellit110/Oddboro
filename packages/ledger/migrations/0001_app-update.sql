CREATE TABLE "app_update" (
	"id" text PRIMARY KEY DEFAULT 'app' NOT NULL,
	"window_start" text DEFAULT '02:00' NOT NULL,
	"window_end" text DEFAULT '04:00' NOT NULL,
	"ready_version" text,
	"ready_notes" text,
	"ready_at" timestamp with time zone,
	"install_at" timestamp with time zone,
	"down_at" timestamp with time zone,
	"up_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Written by hand: the Setup window hears when an update is ready.
CREATE TRIGGER app_update_notify AFTER INSERT OR UPDATE OR DELETE ON app_update FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
