ALTER TABLE "waitlist" ADD COLUMN "position" serial NOT NULL;--> statement-breakpoint
-- The serial filled existing rows in whatever order they sit on disk. Renumber
-- them by when they joined, then carry the sequence on from the last one.
UPDATE "waitlist" AS w SET "position" = r.n
FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS n FROM "waitlist") AS r
WHERE w."id" = r."id";--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"waitlist"', 'position'), GREATEST((SELECT max("position") FROM "waitlist"), 1), (SELECT count(*) > 0 FROM "waitlist"));--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "handle" text;--> statement-breakpoint
-- Added nullable, given every existing signup a random slug, then made required.
ALTER TABLE "waitlist" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "waitlist" SET "slug" = substr(md5(random()::text || "id"::text), 1, 12) WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "waitlist" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "background" text;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_position_idx" ON "waitlist" USING btree ("position");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_slug_idx" ON "waitlist" USING btree ("slug");
