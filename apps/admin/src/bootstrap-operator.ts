import crypto from "node:crypto";
import { createInterface } from "node:readline";
import type { OperatorId } from "@hexdev/platform-core";
import type { BootstrapOperatorResult, ResetOperatorPasswordResult } from "@hexdev/platform-core";
import { appendAuditEntry } from "./audit-log.js";
import { hashPassword } from "./operator-password.js";
import { PERMISSIONS } from "./permissions.js";

/**
 * The bootstrap CLI (design §12, spec Domain J, tasks 11b.1-11b.9) — creates
 * the FIRST operator account, and serves forgotten-password recovery for any
 * later one, through the same entry point. This module splits three
 * concerns, mirroring `login-handler.ts`'s own "framework-agnostic core +
 * thin executable" shape: `parseBootstrapArgs`/`readPasswordFromStdin` (pure
 * input parsing, fully unit-testable), `runBootstrap` (the decision logic,
 * testable with injected fakes for the Postgres-bound calls), and `main`
 * (the real I/O glue, `/* c8 ignore *``/`'d like `index.ts`'s own dispatcher).
 *
 * THE PASSWORD NEVER TOUCHES ARGV (design §12, task 11b.1) — `argv` is
 * visible in `ps` output and shell history on every multi-user system this
 * panel could run on. `parseBootstrapArgs` REFUSES any positional beyond the
 * username, naming stdin in the refusal message, so a caller who tries
 * `bootstrap ana my-password` gets told exactly why that failed rather than
 * a generic usage error.
 */

export interface ParsedBootstrapArgs {
  readonly username: string;
  readonly force: boolean;
}

/**
 * Parses argv into `{ username, force }` — `--force` is the ONLY recognised
 * flag; the username is the ONLY recognised positional. Any second
 * positional is refused (task 11b.1): this is deliberately "any EXTRA
 * positional", not "any second argument at all", since `--force` is a real,
 * legitimate second token.
 */
export function parseBootstrapArgs(argv: readonly string[]): ParsedBootstrapArgs {
  let username: string | undefined;
  let force = false;
  const extras: string[] = [];
  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (username === undefined) {
      username = arg;
      continue;
    }
    extras.push(arg);
  }
  if (username === undefined || extras.length > 0) {
    throw new Error(
      "usage: bootstrap <username> [--force] — the password is NEVER a command-line argument. " +
        'Pipe it via stdin instead, e.g. printf \'%s\' "$PASSWORD" | pnpm --filter @hexdev/admin bootstrap <username>. ' +
        `An unexpected extra argument was passed on the command line where the password is the only thing that ever belongs there.`,
    );
  }
  return { username, force };
}

/**
 * Reads the password from stdin, stripping exactly one trailing newline so
 * `printf '%s' "$PASSWORD"` and `echo "$PASSWORD"` agree (design §12). When
 * stdin IS a TTY, prompts interactively with echo disabled instead of
 * reading a pipe — exercised only by the manual runtime harness (this
 * module's own real terminal has no clean, dependency-free way to fake for
 * an automated test; `parseBootstrapArgs`/the piped branch below carry the
 * automated coverage).
 */
export async function readPasswordFromStdin(stdin: NodeJS.ReadStream): Promise<string> {
  if (stdin.isTTY) {
    return new Promise((resolve, reject) => {
      const rl = createInterface({ input: stdin, output: process.stdout, terminal: true });
      // `readline` has no public "masked input" option as of Node 24. In
      // the terminal's default "cooked" mode, keystrokes are echoed by the
      // TTY itself before `readline` ever sees them, so muting has to
      // happen at the TTY layer (`setRawMode`), with `readline`'s own
      // internal per-character echo (normally a no-op passthrough in raw
      // mode) suppressed via its undocumented `_writeToOutput` hook — the
      // same technique every dependency-free Node password prompt uses,
      // since there is no supported public API for it.
      interface MutableInterface {
        _writeToOutput(chunk: string): void;
      }
      const mutableRl = rl as unknown as MutableInterface;
      mutableRl._writeToOutput = (chunk: string) => {
        // Let a newline through (so the terminal still advances a line on
        // Enter); swallow every other echoed character.
        if (chunk === "\n" || chunk === "\r\n") process.stdout.write(chunk);
      };
      if (typeof stdin.setRawMode === "function") stdin.setRawMode(true);
      process.stdout.write("Password: ");
      rl.question("", (answer) => {
        if (typeof stdin.setRawMode === "function") stdin.setRawMode(false);
        process.stdout.write("\n");
        rl.close();
        resolve(answer);
      });
      rl.on("error", reject);
    });
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    stdin.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      resolve(raw.endsWith("\n") ? raw.slice(0, -1) : raw);
    });
    stdin.on("error", (error) => reject(error instanceof Error ? error : new Error(String(error))));
  });
}

export interface BootstrapRunDeps {
  readonly bootstrapOperator: (
    input: { readonly id: OperatorId; readonly username: string; readonly passwordHash: string; readonly permissions: readonly string[] },
    w: (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>,
  ) => Promise<BootstrapOperatorResult>;
  readonly resetOperatorPassword: (
    username: string,
    passwordHash: string,
    buildWitness: (operatorId: OperatorId) => (exec: (sql: string, values: readonly unknown[]) => Promise<void>) => Promise<void>,
  ) => Promise<ResetOperatorPasswordResult>;
  /** Test seam — production defaults to `crypto.randomUUID`. */
  readonly generateOperatorId?: () => string;
  readonly clock?: () => number;
}

export interface BootstrapRunOutcome {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * THE DECISION LOGIC (tasks 11b.3-11b.8, design §12): `--force` selects
 * EXCLUSIVELY between the two documented paths design §12 names — first-run
 * creation (no `--force`) or a reset of an EXISTING username's password
 * (`--force`) — never a third, undocumented "create a second initial
 * operator via --force" behaviour. A disclosed interpretation, not an
 * accident: `--force`'s only two mentions in spec Domain J/design §12 are
 * "bypass the 'any operator exists' refusal" and "against an existing
 * username", never "create a brand-new second operator under a fresh
 * username" — that capability already exists, gated behind
 * `operators.manage`, once ANY operator is logged in (`operator-handlers.ts`,
 * slice 11a). Giving `--force` a second, silent meaning here would blur that
 * boundary rather than serve forgotten-password recovery, the one thing this
 * flag exists for.
 */
export async function runBootstrap(args: ParsedBootstrapArgs, password: string, deps: BootstrapRunDeps): Promise<BootstrapRunOutcome> {
  const passwordHash = hashPassword(password);
  const now = (deps.clock ?? Date.now)();

  if (!args.force) {
    const id = (deps.generateOperatorId ?? (() => crypto.randomUUID()))() as OperatorId;
    const witness = async (exec: (sql: string, values: readonly unknown[]) => Promise<void>) =>
      appendAuditEntry(exec, { occurredAt: now, actorOperatorId: id, actorUsername: args.username, action: "operator.bootstrapped", targetOperatorId: id });
    const result = await deps.bootstrapOperator({ id, username: args.username, passwordHash, permissions: PERMISSIONS }, witness);
    if (!result.ok) {
      return {
        ok: false,
        message: `refused: an operator account already exists. Re-run with --force to reset "${args.username}"'s password instead, if that account already exists — or contact whoever holds "operators.manage" to create a new colleague through the panel.`,
      };
    }
    return { ok: true, message: `bootstrapped operator "${args.username}" (${result.operatorId}), holding all ${String(PERMISSIONS.length)} permissions.` };
  }

  const result = await deps.resetOperatorPassword(args.username, passwordHash, (operatorId) => async (exec) =>
    appendAuditEntry(exec, { occurredAt: now, actorOperatorId: operatorId, actorUsername: args.username, action: "operator.password.reset-by-cli", targetOperatorId: operatorId }),
  );
  if (!result.ok) {
    return { ok: false, message: `refused: no operator exists with the username "${args.username}" to reset. --force resets an EXISTING account's password; omit --force to create the FIRST account.` };
  }
  return { ok: true, message: `reset the password for operator "${args.username}" (${result.operatorId}); every live session for that account was invalidated.` };
}

/* c8 ignore start — real process I/O glue; `parseBootstrapArgs`/`runBootstrap`
 * are what the tests pin, exactly as `index.ts`'s own dispatcher docstring
 * already establishes for its equivalent split. Run only when this module is
 * executed directly (`pnpm --filter @hexdev/admin bootstrap`), never on
 * import. */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const { connectPostgres, bootstrapOperator, resetOperatorPassword } = await import("@hexdev/platform-core/node");
  const { loadAdminConfig } = await import("./config.js");

  const config = loadAdminConfig(process.env);
  const pool = await connectPostgres(config.postgresUrl);
  const args = parseBootstrapArgs(process.argv.slice(2));
  const password = await readPasswordFromStdin(process.stdin);

  const outcome = await runBootstrap(args, password, {
    bootstrapOperator: (input, w) => bootstrapOperator(pool, input, w),
    resetOperatorPassword: (username, passwordHash, buildWitness) => resetOperatorPassword(pool, username, passwordHash, buildWitness),
  });

  console.log(outcome.message);
  await pool.end();
  process.exitCode = outcome.ok ? 0 : 1;
}
/* c8 ignore stop */
