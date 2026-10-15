/**
 * Errors in the log as one line each, never a stack.
 *
 * A trace is a screenful of `node_modules` frames around the one sentence that
 * says what went wrong, and in a log read by scrolling it buries the next line
 * too. Every call site already says where it is ("position-sync: wallet for
 * user … failed"), so the error only has to say what happened.
 *
 * Done once, at the console, rather than at each of the call sites that hand
 * an error over: those are dozens across this service and the packages it
 * runs, plus Hono and every library that logs on its own, and a rule kept by
 * remembering it at each one is a rule the next call site breaks.
 *
 * `LOG_STACKS=1` puts the frames back, for the session that needs them.
 */

type Console = Pick<globalThis.Console, "error" | "warn" | "log" | "info" | "debug">;
type Env = Readonly<Record<string, string | undefined>>;

/*
 * `debug` included, though nothing in this service used it when this list was
 * written. It was absent from both this array and the OTel forward's, so a
 * `console.debug` call went to stdout with its stack intact and never reached
 * the collector at all — a level that looked available and silently was not.
 */
const LEVELS = ["error", "warn", "log", "info", "debug"] as const;

/** How far down a chain of causes to follow before stopping. */
const MAX_DEPTH = 3;

const flat = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * A `SolanaError`, in the words of whoever raised it.
 *
 * Production builds of `@solana/errors` replace the message with "Solana error
 * #-32004; Decode this error by running `npx @solana/errors decode …`", which
 * no one reading a log can act on. An RPC failure carries the node's own
 * sentence in its context, and that is the line.
 */
const solanaLine = (error: Error): string | null => {
  if (error.name !== "SolanaError") return null;
  const context = (error as { readonly context?: Readonly<Record<string, unknown>> }).context ?? {};
  const code = String(context["__code"] ?? "unknown");
  const said = context["__serverMessage"];
  if (typeof said === "string" && said !== "") return `solana error ${code}: ${flat(said)}`;
  const message = flat(error.message.replace(/;\s*Decode this error by running[\s\S]*$/, ""));
  return message.startsWith("Solana error #") ? `solana error ${code}` : `solana error ${code}: ${message}`;
};

/** What went wrong, in one line. Anything can be thrown, so anything is accepted. */
export const errorLine = (error: unknown, depth = 0): string => {
  if (!(error instanceof Error)) {
    if (typeof error === "string") return flat(error);
    try {
      return JSON.stringify(error) ?? String(error);
    } catch {
      return String(error);
    }
  }

  let line =
    solanaLine(error) ??
    (error.name === "Error" ? flat(error.message) : `${error.name}: ${flat(error.message)}`);
  if (error instanceof AggregateError && depth < MAX_DEPTH) {
    line += `: ${error.errors.map((inner) => errorLine(inner, depth + 1)).join("; ")}`;
  }
  if (error.cause !== undefined && depth < MAX_DEPTH) {
    line += ` (cause: ${errorLine(error.cause, depth + 1)})`;
  }
  return line;
};

/**
 * Every `Error` handed to the console becomes its one line on the way out.
 * The rest of what the call site wrote is left exactly as it was.
 */
export const oneLineErrors = (target: Console = console, env: Env = process.env): void => {
  if (env["LOG_STACKS"] === "1") return;
  for (const level of LEVELS) {
    const write = target[level].bind(target);
    target[level] = (...args: unknown[]) =>
      write(...args.map((a) => (a instanceof Error ? errorLine(a) : a)));
  }
};

/**
 * An error nothing caught still ends the process, as Node would end it, and
 * says why in one line instead of Node's trace.
 *
 * Ending it matters more than the line. A migration that fails at boot lands
 * here, and a server that stays up against a schema it does not match is the
 * failure `applyMigrations` exists to prevent.
 */
export const exitOnUncaught = (
  proc: Pick<NodeJS.EventEmitter, "on"> = process,
  target: Console = console,
  exit: (code: number) => void = (code) => process.exit(code),
  env: Env = process.env,
): void => {
  if (env["LOG_STACKS"] === "1") return;
  const fatal = (error: unknown) => {
    target.error(`fatal: ${errorLine(error)}`);
    exit(1);
  };
  proc.on("uncaughtException", fatal);
  proc.on("unhandledRejection", fatal);
};
