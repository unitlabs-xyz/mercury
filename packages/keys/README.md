# @mercury/keys

Key parsing and address derivation, one module per VM family.

**Node only. Never import this from `apps/web`.** `packages/chain` is in the web
app's dependency graph, which is exactly why these derivations are not there:
shipping secp256k1 and a Bitcoin signer to a browser costs bundle weight at
best and is a bad idea at worst.

There is no root export. A caller names the family it wants — `@mercury/keys/evm`,
`/svm`, `/bvm` — so importing one can never pull all three signing stacks in.

Why derive at all, rather than configure an address: a configured address can be
one we hold no key for, and nothing would catch it until a refund landed
somewhere unspendable. See `docs/adr/0015-treasury-service.md`.
