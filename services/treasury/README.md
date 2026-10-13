# @mercury/treasury

Holds the refund keys. Derives their addresses. Reports the addresses.

That is the whole of it today. Receiving a refund needs nothing running — an
address receives whether or not this is up — so v1 is three derivations and one
authenticated route. Settling, which means sending, is a later decision and its
own ADR; when it arrives it must not be a route that signs on request.

**No public ingress.** The API reaches this on the internal network with a
shared secret. Nothing it serves, now or later, returns key material.

**It fails to boot on a bad key.** There is no useful degraded mode: a treasury
with no keys reports no addresses and the API hides funding anyway, so a loud
boot failure is strictly clearer than a quiet half-start.

See `docs/adr/0015-treasury-service.md`.
