/**
 * `pnpm visual:review` — renders every screen and hands them to a person.
 *
 * NOT A TEST. It asserts nothing, approves nothing and cannot fail on a
 * difference, which is the whole point.
 *
 * WHY IT EXISTS. The automated screenshot suite is good at what screenshots
 * are good at — a colour swap, an element gone, a theme token that silently
 * stopped applying — and structurally bad at geometry. `pixelmatch` measures
 * COLOUR DISTANCE, and a panel here is deliberately "the felt plus a few per
 * cent of white" (chrome-styles.ts's own words), so a card that lost two
 * thirds of its width moved fewer pixels past the per-pixel threshold than
 * the noise floor. It passed. Geometry now lives in getBoundingClientRect()
 * assertions, which fail saying `expected 960 to be 352`.
 *
 * What no assertion replaces is somebody's eye on a whole screen at once.
 *
 * HOW IT WORKS, and why there is no new mechanism: it regenerates the
 * screenshots on the host and then leaves the working tree dirty ON PURPOSE.
 * `git diff` is the review, `git checkout` is "no", a commit is "yes". The
 * repo already had every piece of that; it was only missing the one command
 * that puts a person in front of the result.
 *
 * IN THE CONTAINER, and that costs about a minute for a reason. The first
 * version of this ran on the host, because reviewing commits nothing so the
 * pinned-rasterizer rule seemed not to apply. Measured: a host run rewrote
 * THREE baselines that nothing had changed — this machine's font hinting
 * against the container's. That is a false positive in the one place this
 * tool must not have one, since "git diff is the review" only works if the
 * diff is real. What you see here is what would be committed.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "visual", "review");

function shots() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      // The SUFFIX is the discriminator, the same one .gitattributes and
      // .gitignore already use: Vitest names an approved baseline
      // `<snapshot>-chromium-linux.png`, and a failure attachment after the
      // full test title plus a retry index. Both land in this directory, and
      // a contact sheet of red-run debris beside real screens would make the
      // review worthless.
      else if (entry.name.endsWith("-chromium-linux.png") && full.includes("__screenshots__")) found.push(full);
    }
  };
  walk(join(ROOT, "apps"));
  walk(join(ROOT, "packages"));
  return found.sort();
}

const run = spawnSync("node", ["scripts/visual-container.mjs", "--update"], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, CI: "1" },
});
if (run.status !== 0) {
  process.stderr.write("\nThe render did not finish, so there is nothing to review.\n");
  process.exit(run.status ?? 1);
}

const files = shots();
mkdirSync(OUT, { recursive: true });
const cards = files
  .map((file) => {
    const label = relative(ROOT, file);
    return `<figure><img src="${relative(OUT, file)}" alt="${label}" loading="lazy"><figcaption>${label}</figcaption></figure>`;
  })
  .join("\n");
writeFileSync(
  join(OUT, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Convite — revisión visual</title>
<style>
 body{margin:0;padding:24px;background:#14231d;color:#e8efe9;font:14px/1.5 system-ui,sans-serif}
 h1{font-size:18px;font-weight:600;margin:0 0 4px}
 p{margin:0 0 24px;opacity:.75;max-width:60ch}
 code{background:#0000004d;padding:1px 5px;border-radius:4px}
 main{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:24px}
 figure{margin:0}
 img{width:100%;height:auto;display:block;border-radius:8px;background:#0006}
 figcaption{margin-top:8px;font-size:12px;opacity:.65;word-break:break-all}
</style>
<h1>Revisión visual — ${String(files.length)} pantallas</h1>
<p>Recién renderizadas en esta máquina. Nada se comparó y nada falló: mirá.
 Lo que esté bien, <code>git add</code>. Lo que no, <code>git checkout</code>.
 Si vas a conservar un cambio, regeneralo antes con
 <code>pnpm test:visual &lt;archivo&gt; --update</code>, que usa el contenedor
 fijado.</p>
<main>${cards}</main>
`,
);

process.stdout.write(`\n  ${String(files.length)} pantallas renderizadas\n  abrí: ${join(OUT, "index.html")}\n\n  git diff  = qué cambió    git checkout = descartar\n\n`);
