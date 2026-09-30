# @mercury/mobile

Expo + React Native, iOS only. The web app in `apps/web` is the reference
implementation — build against it, not from scratch.

**Scaffolded, not implemented.** `app/` holds a placeholder screen so the
project is valid and `expo start` runs.

## What is shared, and what is not

`@mercury/view` holds everything both clients compute: formatting, the activity
feed's model, the wire decision. Its `tsconfig` leaves `DOM` out of `lib`, so a
file that reaches for `document` or `localStorage` fails to build there rather
than failing on a phone. `@mercury/core`, `@mercury/types` and `@mercury/sdk`
are shared the same way.

Nothing under `apps/web/src` crosses. It is DOM, Tailwind and React Router.

## Notes for whoever picks this up

- **Expo 56, React Native 0.85, React 19.2.** Moved off Expo 52 on 30 September
  because `@privy-io/expo-native-extensions` — a required native peer for auth —
  is built against 56. See the spike findings in
  [the design](../../docs/superpowers/specs/2026-09-30-ios-app-design.md).
- **Privy needs a custom dev client.** Its native modules mean Expo Go will not
  run this app, and a dev client needs the Apple Developer account.
- `.npmrc` sets `node-linker=hoisted` because Metro does not follow pnpm's
  symlinked tree, and `metro.config.js` adds the workspace root to
  `watchFolders` for the same reason.
- The palette tracks `apps/web/src/tokens.css`. Ground is `#F7F6F2`, ink
  `#1B1A17`, brand `#0F7480`.
