CREATE TABLE "sponsored_token_account" (
	"owner" text NOT NULL,
	"mint" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsored_token_account_owner_mint_pk" PRIMARY KEY("owner","mint")
);
