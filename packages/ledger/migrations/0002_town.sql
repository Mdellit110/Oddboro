CREATE TABLE "context" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "context_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"basis" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"for_staff_id" text,
	"confidence" double precision DEFAULT 1 NOT NULL,
	"replaces" integer,
	"file" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "town_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "town_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"shop" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "owner" ADD COLUMN "town" jsonb;--> statement-breakpoint
ALTER TABLE "owner" ADD COLUMN "memory" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "owner" ADD COLUMN "look" jsonb;--> statement-breakpoint
ALTER TABLE "owner" ADD COLUMN "invited_by" jsonb;--> statement-breakpoint
ALTER TABLE "context" ADD CONSTRAINT "context_for_staff_id_staff_id_fk" FOREIGN KEY ("for_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Written by hand: the town panel hears when an Odd offers to remember something, hands off, or delivers.
CREATE TRIGGER context_notify AFTER INSERT OR UPDATE OR DELETE ON context FOR EACH STATEMENT EXECUTE FUNCTION office_notify();
