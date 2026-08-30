CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" bigint NOT NULL,
	"action" text NOT NULL,
	"target_user_id" bigint,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"reward_type" text DEFAULT 'GO' NOT NULL,
	"total_reward" numeric(18, 6) DEFAULT '100' NOT NULL,
	"winner_count" integer DEFAULT 3 NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_finished" boolean DEFAULT false NOT NULL,
	"winners" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"currency" text DEFAULT 'TON' NOT NULL,
	"wallet_address" text,
	"tx_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"required_referrals" integer NOT NULL,
	"reward_amount" numeric(18, 6) NOT NULL,
	"reward_currency" text DEFAULT 'GO' NOT NULL,
	"is_repeatable" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"milestone_id" integer NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reward_amount" numeric(18, 6) DEFAULT '5' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reward_currency" text DEFAULT 'GO' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "max_claims" integer;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "currency" text DEFAULT 'TON' NOT NULL;