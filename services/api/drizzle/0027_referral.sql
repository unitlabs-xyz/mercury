CREATE TABLE "referral" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"qualified_at" timestamp with time zone,
	CONSTRAINT "referral_not_self" CHECK ("referral"."inviter_id" <> "referral"."friend_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral" ADD CONSTRAINT "referral_friend_id_user_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_friend_idx" ON "referral" USING btree ("friend_id");--> statement-breakpoint
CREATE INDEX "referral_inviter_idx" ON "referral" USING btree ("inviter_id","qualified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_referral_code_idx" ON "user" USING btree ("referral_code");