const { getDefaultConfig } = require("expo/metro-config");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

/*
 * pnpm's store is symlinked, and Metro has to be told to live with it.
 *
 * `watchFolders` brings the workspace packages in — @mercury/view and the rest
 * live outside this directory and still need fast refresh.
 *
 * Hierarchical lookup stays ON, which is the part that took a while to find.
 * Turning it off means Metro resolves only from `nodeModulesPaths`, and a
 * package in pnpm's store keeps its own dependencies beside itself rather than
 * hoisted — so expo-router could not see `@expo/metro-runtime`, then
 * `@expo/log-box`, and would have gone on like that one package at a time.
 * Walking up from the importing file is how a nested tree is meant to be read.
 *
 * `apps/mobile/.npmrc` sets `node-linker=hoisted`, which does nothing: pnpm
 * reads that from the workspace root. The tree here is symlinked whatever that
 * file says, so this config assumes it is.
 */
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;

/*
 * Read packages' `exports` maps, and ask for the React Native build first.
 *
 * Without this Metro falls back to `main`, and `jose` — which @privy-io/expo
 * pulls in for JWT work — resolves to its Node build. That one opens with
 * `import { createDecipheriv } from 'crypto'`, so the bundle fails on a module
 * React Native does not have. jose ships a browser build that uses WebCrypto;
 * the condition order below is what reaches it.
 */
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ["react-native", "browser", "require", "import"];

/*
 * `./format.js` means `./format.ts` in this repository.
 *
 * Every shared package writes its own imports with a `.js` extension —
 * @mercury/core, sdk, types and view all do. `moduleResolution: "Bundler"`
 * makes that a convention rather than a requirement, and tsc and Vite both read
 * it; Metro takes the extension literally and looks for a file that was never
 * written. Rewriting only `packages/view` would have moved the failure to the
 * first import of @mercury/core.
 *
 * Only when a `.ts` is actually sitting there. The first version stripped the
 * extension and let Metro re-resolve, which quietly redirected React Native's
 * own `.js` files to whatever `./name` happened to match and broke the runtime
 * with "Object is not a function". Checking the filesystem first means this
 * touches our sources and nothing else.
 */
const metroResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js") && context.originModulePath) {
    const stem = path.resolve(path.dirname(context.originModulePath), moduleName.slice(0, -3));
    for (const ext of [".ts", ".tsx"]) {
      if (fs.existsSync(stem + ext)) {
        return { type: "sourceFile", filePath: stem + ext };
      }
    }
  }
  return (metroResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
