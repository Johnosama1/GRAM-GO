CREATE TABLE "bans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"reason" text DEFAULT 'duplicate_account' NOT NULL,
	"matched_user_id" bigint,
	"matched_signals" jsonb DEFAULT '[]'::jsonb,
	"banned_at" timestamp DEFAULT now() NOT NULL,
	"banned_by" text DEFAULT 'system' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_fingerprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"fingerprint" text NOT NULL,
	"canvas_fp" text,
	"audio_fp" text,
	"local_id" text,
	"screen_resolution" text,
	"time_zone" text,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"event_type" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
