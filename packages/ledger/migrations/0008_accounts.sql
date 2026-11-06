CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "account" text;