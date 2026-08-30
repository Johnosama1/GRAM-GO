CREATE TABLE "daily_checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"day" integer NOT NULL,
	"reward_amount" numeric(18, 6) NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"claim_date" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_combos" (
	"id" serial PRIMARY KEY NOT NULL,
	"combo_date" text NOT NULL,
	"item_1" integer NOT NULL,
	"item_2" integer NOT NULL,
	"item_3" integer NOT NULL,
	"reward_amount" numeric(18, 6) DEFAULT '5.000000' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_combos_combo_date_unique" UNIQUE("combo_date")
);
--> statement-breakpoint
CREATE TABLE "user_combo_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"combo_date" text NOT NULL,
	"selected_items" jsonb NOT NULL,
	"is_success" boolean DEFAULT false NOT NULL,
	"reward_claimed" boolean DEFAULT false NOT NULL,
	"reward_amount" numeric(18, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
