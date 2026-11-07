ALTER TABLE "asks" ADD COLUMN "reply" jsonb;--> statement-breakpoint
ALTER TABLE "asks" ADD COLUMN "via" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "via" text;