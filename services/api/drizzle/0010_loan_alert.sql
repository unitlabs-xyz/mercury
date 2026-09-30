CREATE TABLE "loan_alert" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"health" text NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_alert" ADD CONSTRAINT "loan_alert_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;