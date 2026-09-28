CREATE TABLE "wallet_stream" (
	"wallet_id" uuid NOT NULL,
	"address" text NOT NULL,
	"cursor" text,
	"checked_at" timestamp with time zone,
	CONSTRAINT "wallet_stream_wallet_id_address_pk" PRIMARY KEY("wallet_id","address")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "mint" text;--> statement-breakpoint
ALTER TABLE "wallet_stream" ADD CONSTRAINT "wallet_stream_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_signature_mint_idx" ON "activity" USING btree ("user_id","tx_signature","mint");