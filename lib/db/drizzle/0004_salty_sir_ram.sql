CREATE TABLE "fsm_states" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "miners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT '⛏️' NOT NULL,
	"cost_go" text DEFAULT '100' NOT NULL,
	"daily_yield_gram" text DEFAULT '1.0' NOT NULL,
	"duration_days" text DEFAULT '30' NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"reward_type" text DEFAULT 'GRAM' NOT NULL,
	"reward_amount" text DEFAULT '10' NOT NULL,
	"max_uses" text DEFAULT '100' NOT NULL,
	"current_uses" text DEFAULT '0' NOT NULL,
	"expires_at" timestamp,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_promo_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"promo_code_id" serial NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"task_id" integer NOT NULL,
	"proof" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" bigint,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint,
	"ip_address" text,
	"success" boolean DEFAULT false NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "mining_rate" SET DATA TYPE numeric(10, 6);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "mining_rate" SET DEFAULT '0.001250';--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_withdrawal_banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_deposit_banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "approvals" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "rejections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "required_approvals" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "admin_notes" text;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "channel_message_id" integer;