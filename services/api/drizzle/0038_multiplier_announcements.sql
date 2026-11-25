CREATE TABLE "multiplier_announcement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"old_multiplier" numeric(38, 18) NOT NULL,
	"new_multiplier" numeric(38, 18) NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"announced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "multiplier_announcement" ADD CONSTRAINT "multiplier_announcement_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "multiplier_announcement_idx" ON "multiplier_announcement" USING btree ("token_id","effective_at","new_multiplier");