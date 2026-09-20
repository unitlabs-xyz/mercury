# @harbor/mobile

Expo + React Native, iOS only. Shares `@harbor/core`, `@harbor/sdk` and `@harbor/types` with the
web app.

**Scaffolded, not implemented.** `app/` holds a placeholder screen so the project is valid and
`expo start` runs. Real screens begin once the web build is carrying itself; it remains first on
the cut list. See [docs/08-roadmap.md](../../docs/08-roadmap.md) and open question 3 in
[docs/09-open-questions.md](../../docs/09-open-questions.md).

The web app in `apps/web` is the reference implementation. Build against it, not from scratch.

## Notes for whoever picks this up

- Dependencies are declared but **not installed**. Run `pnpm install` from the repo root.
- `.npmrc` sets `node-linker=hoisted` because Metro does not follow pnpm's symlinked tree, and
  `metro.config.js` adds the workspace root to `watchFolders` for the same reason.
- The palette here must track `apps/web/src/tokens.css`. Ground is `#F7F6F2`, ink `#1B1A17`,
  brand `#0F7480`.
