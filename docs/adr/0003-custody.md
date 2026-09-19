# ADR 0003 · The server never holds a key

**Status:** accepted · 19 September 2026 · one sub-decision open, see [09](../09-open-questions.md)

## Context
An investing app has to move money on a schedule. That is easiest if the server signs, and
easiest is the wrong answer.

## Decision
The server never holds a private key and never signs a transaction. It builds unsigned
transactions and returns them. The client signs, through Privy's embedded wallet or Phantom.

Recurring investing, which needs to act unattended, uses a **scoped session key** held by the
user's wallet provider, limited by a token allowlist, a per-run cap and an expiry, and revocable
by the user at any time.

## Consequences
**Good.** We are not a custodian. The worst failure mode is a bad recommendation, not a drained
wallet. The claim that leaving is trivial is true rather than marketing.

**Bad.** Three round trips for a purchase instead of one. Recurring investing depends on the
wallet provider supporting session keys, which constrains the choice in question 1 of
[09 Open questions](../09-open-questions.md).

**Enforced by.** `services/api` has no signing dependency in its `package.json`, and a lint rule
fails the build if one appears.
