# ADR 0012 · No wallet confirmation before a signature

**Status:** accepted · 30 September 2026

## Context

Every transaction this app builds is confirmed twice. Our own review screen states what the order
does — shares, charge, price per share, the route — and then Privy's sheet opens and asks again,
naming nothing except a fee and a truncated address.

The second sheet does not tell the user anything the first did not, and it tells them less. A
first-time investor buying $5 of Nvidia sees `8fLSH…GdX6` and `US$7.48` and is asked to approve
it. That is a wallet's idea of a confirmation, and this product exists so that nobody has to
learn what a wallet is.

## Decision

**`showWalletUIs: false` on the embedded wallet, app-wide.** One press, one signature, no second
sheet. Our review screen is the confirmation.

## What this gives up

The sheet is the last point at which a user can refuse. Without it, anything executing in the
page — a cross-site script, a compromised dependency — can sign with the user's key and they will
not see it happen.

Three things that look like mitigations and are not:

- **Scoping it per call**, so trades sign silently and sends still prompt, is a UX choice and not
  a boundary. Once the page is able to suppress the sheet, code running in the page can suppress
  it too.
- **The relayer refusing to co-sign** what it did not build (`relay/validate.ts`, and the
  remembered message hashes in `relay/builds.ts`) stops a sponsored drain, and stops nothing else:
  an attacker pays the signature themselves for a fraction of a cent.
- **The wallet holding no SOL** does not help for the same reason. It is the attacker's fee to pay.

So the honest statement is that this trades a real protection for a better first five minutes, and
the protection it trades is the whole of what stood between a compromised page and a balance.

## Why that is acceptable now, and when it stops being

Today this runs on a dev deployment, for accounts we control, holding test amounts. The risk is
bounded by what is in those wallets.

It stops being acceptable the moment someone who is not us holds a balance here worth taking. The
replacement is not the sheet coming back — it is delegated signing constrained by policy, which
[ADR 0003](0003-custody.md) already names for recurring investing and basket rebalancing: a key
that may call Jupiter and the token program for this user's own accounts and can do nothing else.
That is a boundary an XSS cannot talk its way past, and it is silent, which the sheet never was.

**This ADR is the marker for that work.** Shipping to real users with neither the sheet nor a
policy is the outcome it exists to prevent.

## Consequences

**Good.** A buy is one press. The review screen becomes the confirmation rather than competing
with one, and the figures a user agreed to are the figures we showed them.

**Bad.** An XSS in this app is now a drained wallet rather than a suspicious popup. Nothing in the
code will remind anyone of that; this document is the reminder.
