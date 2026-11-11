ALTER TABLE "asks" ADD COLUMN "standing" jsonb;--> statement-breakpoint
ALTER TABLE "grants" ADD COLUMN "standing" text[] DEFAULT '{}' NOT NULL;