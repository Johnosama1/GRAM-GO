CREATE TABLE "admins" (
	"id" bigint PRIMARY KEY NOT NULL,
	"username" text,
	"role" text DEFAULT 'admin' NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"photo_url" text,
	"balance" numeric(18, 6) DEFAULT '10' NOT NULL,
	"go_balance" numeric(18, 6) DEFAULT '10' NOT NULL,
	"gram_balance" numeric(18, 6) DEFAULT '0' NOT NULL,
	"mining_rate" numeric(6, 4) DEFAULT '0.0300' NOT NULL,
	"last_mining_at" timestamp DEFAULT now() NOT NULL,
	"ton_balance" numeric(18, 6) DEFAULT '0' NOT NULL,
	"spins" integer DEFAULT 0 NOT NULL,
	"referral_count" integer DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"referred_by" bigint,
	"is_visible" boolean DEFAULT true NOT NULL,
	"ip_hash" text,
	"ip_suspicious" boolean DEFAULT false NOT NULL,
	"ip_verified_at" timestamp,
	"device_id" text,
	"user_agent" text,
	"verification_token" text,
	"saved_wallet_address" text,
	"daily_streak" integer DEFAULT 0 NOT NULL,
	"last_daily_claim_at" timestamp,
	"combo_completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"rewarded_spins" integer DEFAULT 0 NOT NULL,
	"is_blocked_for_leaving" boolean DEFAULT false NOT NULL,
	"joined_channels_at_reward" text,
	"last_channel_check_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"icon" text DEFAULT '⭐',
	"channel_photo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"task_id" integer NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"wallet_address" text NOT NULL,
	"fee" numeric(18, 6) DEFAULT '0.05',
	"status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"error_msg" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "wheel_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" bigint NOT NULL,
	"referred_id" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp,
	"warned_at" timestamp,
	"warn_msg_id" integer
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"currency" text DEFAULT 'Gram' NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
