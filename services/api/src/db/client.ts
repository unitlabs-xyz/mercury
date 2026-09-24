import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

/** One pool per process. The worker builds its own. */
export const createDb = (url: string) => drizzle(postgres(url, { max: 10 }), { schema });
