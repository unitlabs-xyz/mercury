CREATE TABLE "portfolio_snapshot" (
	"user_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"total_usd" numeric(38, 18) NOT NULL,
	"stocks_usd" numeric(38, 18) NOT NULL,
	"cash_usd" numeric(38, 18) NOT NULL,
	CONSTRAINT "portfolio_snapshot_user_id_captured_at_pk" PRIMARY KEY("user_id","captured_at")
);
--> statement-breakpoint
ALTER TABLE "portfolio_snapshot" ADD CONSTRAINT "portfolio_snapshot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;