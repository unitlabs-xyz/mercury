CREATE TABLE "basket_account" (
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "basket_account_user_id_address_pk" PRIMARY KEY("user_id","address")
);
--> statement-breakpoint
ALTER TABLE "basket_account" ADD CONSTRAINT "basket_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;