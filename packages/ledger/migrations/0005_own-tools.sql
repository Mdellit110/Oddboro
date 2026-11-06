ALTER TABLE "staff" ADD COLUMN "commands" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "web" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "folders" jsonb DEFAULT '[]'::jsonb NOT NULL;