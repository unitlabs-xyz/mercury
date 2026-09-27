// Builds the API as one Vercel function, in Vercel's Build Output API format
// (https://vercel.com/docs/build-output-api/v3), so Vercel runs exactly this
// bundle rather than compiling the workspace's TypeScript on its own.
//
//   .vercel/output/config.json            every path to the function; the daily catalogue cron
//   .vercel/output/functions/index.func/  the bundled API and its runtime config
import { build } from "esbuild";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".vercel", "output");
const fn = join(out, "functions", "index.func");
// Orca is a dependency of Kamino's, not ours, so it resolves from Kamino's folder.
const kamino = dirname(createRequire(import.meta.url).resolve("@kamino-finance/klend-sdk/package.json", { paths: [root] }));

await rm(out, { recursive: true, force: true });
await mkdir(fn, { recursive: true });

await build({
  entryPoints: [join(root, "src", "vercel.ts")],
  outfile: join(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: "linked",
  logLevel: "warning",
  // Some dependencies are CommonJS and use require(), __dirname and __filename;
  // give the ESM bundle all three, pointing at the function's own folder.
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      "import { fileURLToPath as __fu } from 'node:url';",
      "import { dirname as __dn } from 'node:path';",
      "const require = __cr(import.meta.url);",
      "const __filename = __fu(import.meta.url);",
      "const __dirname = __dn(__filename);",
    ].join(" "),
  },
});

// WebAssembly a dependency loads from beside itself at runtime (__dirname), which
// a bundle cannot inline: copy it next to the bundle. Orca's pool maths, pulled
// in through Kamino's SDK.
const require = createRequire(import.meta.url);
const WASM = [["@orca-so/whirlpools-core", "dist/nodejs/orca_whirlpools_core_js_bindings_bg.wasm"]];
for (const [pkg, file] of WASM) {
  const base = dirname(require.resolve(`${pkg}/package.json`, { paths: [kamino] }));
  await copyFile(join(base, file), join(fn, file.split("/").pop()));
}

await writeFile(
  join(fn, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", maxDuration: 60 }, null, 2),
);
await writeFile(join(fn, "package.json"), JSON.stringify({ type: "module" }));

await writeFile(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [{ src: "/(.*)", dest: "/index" }],
      crons: [{ path: "/cron/catalogue", schedule: "0 6 * * *" }],
    },
    null,
    2,
  ),
);

console.log("built .vercel/output (index.func + config)");
