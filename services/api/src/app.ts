import { Hono } from "hono";
import { cors } from "hono/cors";
import { httpInstrumentationMiddleware } from "@hono/otel";
import { allocate, D, DEFAULT_POLICY, toWire } from "@mercury/core";
import { ConfirmOrderRequest, CreateOrderRequest, InvestBasketRequest, type ErrorCode } from "@mercury/types";
import type { Deps } from "./deps.js";
import { priceOrder, type PriceRequest } from "./pricing.js";
import { gateExecution } from "./orders/gate.js";
import { planFill } from "./orders/fill.js";
import { decisionToWire } from "./serialize.js";
import { NO_FEE, quoteFee } from "./relay/quote.js";
import { buildSponsored } from "./relay/build.js";
import { rpcLookupTables } from "./relay/lookups.js";
import { createSolanaRpc } from "@solana/kit";
import { USDC_MINT } from "@mercury/chain";
import { BASKETS } from "./baskets.js";
import { requireAuth, type AuthDeps } from "./auth/middleware.js";
import { requestId } from "./telemetry/request-id.js";
import { logger } from "./log/index.js";
import type { ReadDeps } from "./deps.js";
import { activityRoutes } from "./routes/activity.js";
import { borrowRoutes } from "./routes/borrow.js";
import { sendRoutes } from "./routes/send.js";
import { instrumentRoutes } from "./routes/instruments.js";
import { moneyRoutes } from "./routes/money.js";
import { portfolioRoutes } from "./routes/portfolio.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { basketRoutes } from "./routes/basket.js";
import { fundRoutes } from "./routes/fund.js";
import { relayWebhookRoutes } from "./routes/relay-webhook.js";

const fail = (code: ErrorCode | "not_implemented", message: string, details?: unknown) => ({
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

/**
 * A create request as `priceOrder` wants it.
 *
 * Conditional spreads rather than undefined values: `exactOptionalPropertyTypes`
 * tells an absent property apart from one set to `undefined`, and zod's
 * `.optional()` produces the second.
 */
const toPriceRequest = (
  body: CreateOrderRequest,
  wallet: string | null,
  /* Orders honour a picked issuer; quotes do not, because the review needs every token to offer the choice. */
  pinned = false,
): PriceRequest => ({
  ticker: body.ticker,
  side: body.side,
  amount: body.amount,
  ...(wallet === null ? {} : { owner: wallet }),
  ...(body.max === true ? { max: true } : {}),
  ...(pinned && body.issuer !== undefined ? { issuer: body.issuer } : {}),
  ...(body.acceptImpact === true ? { acceptImpact: true } : {}),
});

/*
 * Whether the decision a person was shown had already accepted the impact.
 *
 * The build re-prices, so the ceiling has to be the same one both times or an
 * accepted order would be refused at the moment it is signed. Reading it off
 * the stored decision keeps the two in step without a column that could
 * disagree with the decision beside it.
 */
const acceptedImpact = (shown: ReturnType<typeof decisionToWire>) =>
  shown.kind !== "refuse" &&
  shown.best.priceImpact !== null &&
  D(shown.best.priceImpact).gt(DEFAULT_POLICY.maxPriceImpact);

/** For a refusal that has to name a figure. */
const asUsd = (d: ReturnType<typeof D>) => `$${d.toFixed(2)}`;

const NOT_READY = fail(
  "not_implemented",
  "Market data is not wired up yet. See subsystem 2 of the backend spec.",
);

/**
 * `market` is a thunk, not a value. Its adapters do not exist until subsystem 2
 * lifts them out of the browser, and evaluating it at boot would stop the auth
 * path from running at all. The routes that need it answer 503 instead.
 */
/**
 * The order path's logger.
 *
 * At the boundary rather than inside the decision functions, deliberately.
 * `gateExecution`, `planFill` and `priceOrder` are pure — inputs to a verdict,
 * no I/O, tested as tables of fixtures — and logging inside them would mean
 * threading a logger through every signature to produce lines with no request
 * context anyway. Here, the request, the user and the verdict are all in scope,
 * so one line carries the whole decision.
 *
 * This is the line that answers "why was my order refused", which until now
 * had no answer anywhere: the whole of `orders/` logged nothing.
 */
const orderLog = logger("orders");

export function createApp(market: () => Deps, auth: AuthDeps, read: ReadDeps) {
  const app = new Hono();
  /* One client for the routes that talk to the chain directly. */
  const rpc = createSolanaRpc(read.send.rpcUrl);
  /*
   * Above cors(), both of them, so a request CORS turns away is still a
   * request that was counted and traced. A rejected preflight is exactly the
   * kind of failure that otherwise reaches us as "the app is broken" with
   * nothing in the logs.
   *
   * @hono/otel's default `http.route` is the Hono route pattern, which is what
   * this needs: `/v1/invest/:ticker` and never `/v1/invest/AAPL`. The second
   * would make every ticker its own time series, and the error-rate graph
   * unreadable by the time anybody needed it.
   *
   * Header capture is left off. It is opt-in in the library, and switching it
   * on would be a standing invitation to record an Authorization header.
   *
   * Both are no-ops when telemetry is unconfigured: the middleware asks for a
   * tracer and gets the API's no-op one.
   */
  app.use("*", httpInstrumentationMiddleware({ serviceName: "mercury-api" }));
  app.use("*", requestId());
  app.use("*", cors());

  // Public, so the app can say "dry run" before anyone signs anything.
  app.get("/health", (c) => c.json({ ok: true }));

  // Market data is public: the shelf and a stock page read the same for anyone,
  // and a visitor browsing before signing in should see prices. Registered ahead
  // of the auth middleware, which only guards the routes after it.
  app.route("/", instrumentRoutes(read.instruments));
  app.route("/", basketRoutes(read.basketTemplates, requireAuth(auth)));

  /*
   * The waitlist's share links. The waitlist is gone, but people posted their
   * founding cards on X, and those posts still point here: each is sent on to
   * the site rather than to a 404. See docs/archive/waitlist.
   */
  app.get("/f/:slug", (c) => c.redirect("https://trymercury.xyz", 301));

  // The in-app feedback button. Public: signing in may be the thing that broke.
  if (read.feedback) app.route("/", feedbackRoutes(read.feedback));

  /*
   * Relay's webhook, above the auth middleware because it cannot pass it — the
   * caller is Relay and has no session. Its authentication is the signature on
   * the body; see funding/verify.ts.
   */
  if (read.fund) {
    app.route("/", relayWebhookRoutes({ store: read.fund.store, secret: read.fund.webhookSecret }));
  }

  app.use("/v1/*", requireAuth(auth));

  app.onError((err, c) => {
    if (err.message.startsWith("buildDeps:")) return c.json(NOT_READY, 503);
    /*
     * The id in the log line and in the body, so the sentence somebody reads
     * on screen and the line an engineer greps for name the same request.
     *
     * `?? "unknown"` because an error thrown before the middleware ran — in
     * routing itself, say — has no id, and a crash inside the error handler
     * answers nothing at all.
     */
    const id = (c.get("requestId") as string | undefined) ?? "unknown";
    console.error(`request ${id} failed:`, err);
    return c.json({ ...fail("internal", "Something went wrong."), requestId: id }, 500);
  });

  /** Who is calling, and which wallet is theirs. The first authenticated route. */
  app.get("/v1/me", (c) => c.json(c.get("identity")));
  app.route("/", portfolioRoutes(read.portfolio));
  app.route("/", moneyRoutes(read.money));
  app.route("/", activityRoutes(read.activity));
  app.route("/", borrowRoutes(read.borrow));
  app.route("/", sendRoutes(read.send));
  /* Absent when Relay or the treasury is not configured, so the routes 404 and
     the interface hides the method rather than offering one that cannot work. */
  if (read.fund) app.route("/", fundRoutes(read.fund));

  app.get("/v1/market/status", async (c) => {
    const s = await market().sessions.current();
    return c.json({
      status: s.status,
      isOpen: s.isOpen,
      nextOpenAt: s.nextOpenAt?.toISOString() ?? null,
      nextCloseAt: s.nextCloseAt?.toISOString() ?? null,
      isWeekend: s.isWeekend,
    });
  });

  /** Create an order. Nothing happens on chain: this returns the decision to show the user. */
  /**
   * What an order would do, without creating one.
   *
   * The buy ticket used to work this out in the browser: five chain clients,
   * its own quotes, its own copy of the policy. Two decisions then existed for
   * every order — the one shown and the one executed — computed by different
   * code over separately fetched quotes, which is most of what `PriceMoved`
   * was catching.
   *
   * This is the same `priceOrder` the execute path runs, so the ticket and the
   * transaction now disagree only about time.
   *
   * It also carries the network fee, which the browser could not have worked
   * out at all: it depends on whether this buyer already holds the token, and
   * on the SOL price.
   */
  app.post("/v1/quote", async (c) => {
    const parsed = CreateOrderRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);

    const wallet = c.get("identity").walletAddress;
    const sponsored = read.send.relay !== undefined && wallet !== null;
    const req = toPriceRequest(parsed.data, wallet);

    /*
     * A sell prices once.
     *
     * The buy path below prices twice because the swap has to be quoted for
     * what is left after the charge, and which token wins decides whether rent
     * is owed. Neither holds for a sell: the share count does not move when the
     * fee does, and the account that might need opening is USDC whichever
     * wrapper wins. So the fee is quoted beside the price rather than after it.
     */
    if (parsed.data.side === "sell") {
      const [decision, fee] = await Promise.all([
        priceOrder(market(), req),
        sponsored
          ? quoteFee(
              { chain: market().chain, prices: market().prices },
              { owner: wallet, receivingMint: USDC_MINT },
            )
          : Promise.resolve(NO_FEE),
      ]);
      if (decision === null) return c.json(fail("not_found", "Unknown instrument."), 404);

      const wire = decisionToWire(decision);
      /* What the route expects to pay for the shares it is actually selling —
         which is not always the shares that were asked for. */
      const gross =
        wire.kind === "refuse" || wire.best.pricePerShare === null || wire.best.filledShares === null
          ? D(0)
          : D(wire.best.pricePerShare).mul(D(wire.best.filledShares));

      return c.json({
        decision: wire,
        fee: { usdc: fee.usdc.toString(), lamports: fee.lamports },
        investable: null,
        /* What lands in the wallet, once the network has been paid. */
        proceeds: gross.sub(fee.usdc).toString(),
      });
    }

    /*
     * Priced twice, for the same reason the execute path prices twice: the
     * charge depends on which token wins, and the swap has to be quoted for
     * what is left after the charge. The first pass only picks the winner.
     */
    const probe = await priceOrder(market(), req);
    if (probe === null) return c.json(fail("not_found", "Unknown instrument."), 404);

    const fee =
      !sponsored || probe.kind === "refuse"
        ? NO_FEE
        : await quoteFee(
            { chain: market().chain, prices: market().prices },
            { owner: wallet, receivingMint: probe.best.mint },
          );

    /*
     * The decision shown is the one for the swap that will actually happen.
     * Quoting the gross here and swapping the net would put a share count on
     * screen that the fill cannot deliver.
     */
    const decision = fee.usdc.lte(0)
      ? probe
      : await priceOrder(market(), {
          ...req,
          amount: D(parsed.data.amount).sub(fee.usdc).toFixed(),
          feeUsdc: fee.usdc.toFixed(),
        });
    if (decision === null) return c.json(fail("not_found", "Unknown instrument."), 404);

    return c.json({
      decision: decisionToWire(decision),
      fee: { usdc: fee.usdc.toString(), lamports: fee.lamports },
      /* What the swap is actually for, once the network has been paid. */
      investable: D(parsed.data.amount).sub(fee.usdc).toString(),
      proceeds: null,
    });
  });

  app.post("/v1/orders", async (c) => {
    const parsed = CreateOrderRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);

    const identity = c.get("identity");
    const decision = await priceOrder(market(), toPriceRequest(parsed.data, identity.walletAddress, true));
    if (decision === null) return c.json(fail("not_found", "Unknown instrument."), 404);

    const wire = decisionToWire(decision);
    const saved = await read.orders.create({
      userId: identity.userId,
      ticker: parsed.data.ticker,
      side: parsed.data.side,
      usdAmount: parsed.data.amount,
      max: parsed.data.max ?? false,
      decision: wire,
      chosenMint: wire.kind === "refuse" ? null : wire.best.mint,
      referencePrice: wire.fairPricePerShare,
      premiumPct: wire.kind === "refuse" ? null : wire.premium,
      status: wire.kind === "refuse" ? "refused" : "pending",
    });
    return c.json({ orderId: saved.id, decision: wire });
  });

  app.get("/v1/orders/:id", async (c) => {
    const order = await read.orders.byId(c.get("identity").userId, c.req.param("id"));
    return order === null ? c.json(fail("not_found", "Unknown order."), 404) : c.json(order);
  });

  /**
   * Build the unsigned transaction. The client signs it; we never hold a key. ADR 0003.
   *
   * Every guard runs again here, against a quote fetched in this request. The
   * decision on the order row is what the user was shown, and by the time they
   * have confirmed and their wallet is ready to sign it is anywhere from
   * seconds to minutes old — the reference price behind it is allowed to be
   * five minutes stale on its own. Pricing once and building later would mean
   * the premium check was run on a number that never filled.
   *
   * So the stored decision is used for exactly one thing: what the user agreed
   * to, which is what the drift check measures against. Everything that
   * actually gates the order — staleness, halts, price impact, premium — is
   * decided on the quote that the transaction is then built from.
   */
  app.post("/v1/orders/:id/execute", async (c) => {
    const identity = c.get("identity");
    const order = await read.orders.byId(identity.userId, c.req.param("id"));
    if (order === null) return c.json(fail("not_found", "Unknown order."), 404);

    const shown = order.decision as ReturnType<typeof decisionToWire>;
    if (shown.kind === "refuse") return c.json(fail("instrument_not_tradable", shown.detail), 409);

    // The wallet comes from the identity token Privy signed, never from a
    // header the caller controls. See services/api/src/auth/identity.ts.
    const owner = identity.walletAddress;
    if (owner === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);

    /*
     * Settled orders cannot be built again; unsettled ones can.
     *
     * `executing` here means a transaction was handed over, not that one was
     * signed — the wallet dialog can be closed, and that user should be able to
     * ask again rather than be told their order is in flight when nothing is.
     * What must never be rebuilt is an order that already reached an end: the
     * unique index on `tx_signature` is the backstop once a fill is recorded.
     */
    if (order.status === "filled" || order.status === "cancelled" || order.status === "refused") {
      return c.json(fail("instrument_not_tradable", `This order is already ${order.status}.`), 409);
    }

    /*
     * The network charge comes out of the amount, so the swap is quoted for
     * what is left after it — not for the whole amount with the charge added
     * on top. Getting this the wrong way round means the buyer is debited more
     * than the figure they agreed to, and the shares they receive are priced
     * against a number they never authorised.
     *
     * Priced before the quote rather than after, because the quote has to be
     * for the net. Which token wins is needed to know whether an account has
     * to be opened, so this prices once to find the winner and once for real.
     */
    const selling = shown.side === "sell";
    /*
     * The token the person reviewed and confirmed, picked or best. Re-pricing
     * stays on it: switching issuers between the review and the signature
     * would hand them a token they did not choose, and only xStocks back a loan.
     */
    const issuer = shown.best.issuer;

    /*
     * A sell needs neither of those passes. The fee does not change how many
     * shares are sold, so there is nothing to re-quote for; and the account it
     * might pay rent for is the USDC one, whichever wrapper wins, so there is
     * no winner to find first.
     */
    const feeUsdc =
      read.send.relay === undefined
        ? NO_FEE.usdc
        : selling
          ? (
              await quoteFee(
                { chain: market().chain, prices: market().prices },
                { owner, receivingMint: USDC_MINT },
              )
            ).usdc
          : await (async () => {
              const probe = await priceOrder(market(), {
                ticker: shown.ticker,
                side: shown.side,
                amount: shown.amount,
                issuer,
              });
              if (probe === null || probe.kind === "refuse") return NO_FEE.usdc;
              const f = await quoteFee(
                { chain: market().chain, prices: market().prices },
                { owner, receivingMint: probe.best.mint },
              );
              return f.usdc;
            })();

    /*
     * Re-priced from the row, not from the decision on it. A stored sell's
     * `amount` is in shares — that is what `decide` reports — and `priceOrder`
     * takes dollars, so reading one as the other would re-quote a $500 sell as
     * five dollars' worth.
     */
    const fresh = await priceOrder(
      market(),
      selling
        ? {
            ticker: shown.ticker,
            side: shown.side,
            amount: order.usdAmount,
            owner,
            issuer,
            ...(order.max ? { max: true } : {}),
            ...(acceptedImpact(shown) ? { acceptImpact: true } : {}),
          }
        : {
            ticker: shown.ticker,
            side: shown.side,
            amount: D(shown.amount).sub(feeUsdc).toFixed(),
            feeUsdc: feeUsdc.toFixed(),
            issuer,
            ...(acceptedImpact(shown) ? { acceptImpact: true } : {}),
          },
    );
    if (fresh === null) return c.json(fail("not_found", "Unknown instrument."), 404);
    const wire = decisionToWire(fresh);

    // The row ends up holding the decision that was acted on, never the one
    // that was merely displayed. Whatever happens below, this is what is stored.
    const record = (status: "pending" | "executing" | "refused") =>
      read.orders.reprice(identity.userId, order.id, {
        decision: wire,
        chosenMint: wire.kind === "refuse" ? null : wire.best.mint,
        referencePrice: wire.fairPricePerShare,
        premiumPct: wire.kind === "refuse" ? null : wire.premium,
        status,
      });

    const gate = gateExecution({
      shownPricePerShare: shown.best.pricePerShare,
      fresh,
      maxQuoteDriftBps: DEFAULT_POLICY.maxQuoteDriftBps,
    });

    /* The inputs, at debug, for reproducing one person's order. A thunk so the
       object is never built while debug is off, which is the default. */
    orderLog.debug(
      () => ({
        userId: identity.userId,
        orderId: order.id,
        shownPricePerShare: shown.best.pricePerShare,
        freshPricePerShare: fresh.kind === "refuse" ? null : (fresh.best.pricePerShare?.toString() ?? null),
        decision: fresh.kind,
        verdict: gate.kind,
      }),
      "gate inputs",
    );

    if (gate.kind === "refuse") {
      await record("refused");
      /*
       * `detail` is the sentence the user is about to read, recorded beside
       * the machine-readable reason so that a support conversation and a query
       * are about the same event. Without this the only trace of a refusal was
       * a row whose status said `refused` and nothing saying why.
       */
      orderLog.info(
        {
          userId: identity.userId,
          orderId: order.id,
          side: fresh.side,
          verdict: "refuse",
          detail: gate.detail,
        },
        "order refused at execution",
      );
      return c.json(fail("instrument_not_tradable", gate.detail, { decision: wire }), 409);
    }

    if (gate.kind === "moved") {
      // Still pending: the order was never sent, and the same intent can be
      // confirmed again against the price now on screen.
      await record("pending");
      /*
       * `warn`, not `info`: this is a user who tried to buy and could not, and
       * a rate of these climbing means the quote is going stale faster than
       * people can confirm it — which is a problem with us, not with them.
       */
      orderLog.warn(
        {
          userId: identity.userId,
          orderId: order.id,
          side: fresh.side,
          verdict: "moved",
          adverseBps: gate.adverseBps === null ? null : gate.adverseBps.toFixed(1),
          maxDriftBps: DEFAULT_POLICY.maxQuoteDriftBps,
        },
        "order re-quote moved too far, asking again",
      );
      return c.json(
        fail("price_moved", gate.detail, {
          wasPricePerShare: shown.best.pricePerShare,
          adverseBps: gate.adverseBps === null ? null : gate.adverseBps.toFixed(1),
          decision: wire,
        }),
        409,
      );
    }

    /* v8 ignore next 3 -- `decide` never returns execute without a best quote;
       the narrowing exists because the type allows what the code does not. */
    if (fresh.kind !== "execute") {
      return c.json(fail("internal", "The order could not be built."), 500);
    }

    /*
     * The one refusal a sell keeps, and it is arithmetic rather than policy.
     *
     * The charge is a USDC transfer out of the proceeds. Proceeds that do not
     * cover it make a transfer that fails and takes the swap with it, so it is
     * refused here rather than discovered on chain after a signature.
     *
     * Deliberately not the minimum-order refusal, which does not apply to
     * sells at all: that one means "ask for more", and this one means the
     * position cannot be moved for what moving it costs. Different remedies,
     * and this one has none.
     */
    if (selling && feeUsdc.gt(0) && fresh.best.pricePerShare !== null && fresh.best.filledShares !== null) {
      const proceeds = fresh.best.pricePerShare.mul(fresh.best.filledShares);
      if (proceeds.lte(feeUsdc)) {
        await record("refused");
        return c.json(
          fail(
            "instrument_not_tradable",
            `This is worth ${asUsd(proceeds)}, which is less than the ${asUsd(feeUsdc)} network fee to sell it.`,
            { decision: wire },
          ),
          409,
        );
      }
    }

    const quote = { quoteId: fresh.best.quoteId, raw: fresh.best.quoteRaw };

    /*
     * Sponsored when there is a relayer to pay: the buyer signs a transaction
     * whose fee payer is ours, and repays the network cost in USDC inside the
     * same message. Priced here rather than taken from the quote the ticket
     * showed, because it turns on whether the buyer holds the token — which a
     * moment ago they might not have.
     */
    const transactions =
      read.send.relay === undefined
        ? await market().quotes.buildSwap(quote, owner)
        : [
            (
              await buildSponsored(
                {
                  quotes: market().quotes,
                  lookups: rpcLookupTables(rpc),
                  relay: read.send.relay,
                  blockhash: async () => {
                    const { value } = await rpc.getLatestBlockhash().send();
                    return {
                      blockhash: value.blockhash,
                      lastValidBlockHeight: value.lastValidBlockHeight,
                    };
                  },
                },
                { quote, owner, feeUsdc, side: shown.side },
              )
            ).wire,
          ];
    await record("executing");
    return c.json({
      transactions,
      decision: wire,
      // The quote behind this transaction, not a round number: Jupiter's keyless
      // quotes hold for twenty seconds and the decision was made on one of them.
      expiresAt: new Date(fresh.decidedAt.getTime() + 20_000).toISOString(),
    });
  });

  /**
   * Record an order that landed. The last step, and the only one that writes
   * money into the books.
   *
   * The client hands over a signature; everything else is read from the chain.
   * What the user was quoted, what they were charged and what they received are
   * three different numbers, and only the last two are facts — so the lot is
   * written from the wallet's own balances before and after the transaction,
   * never from the decision that preceded it.
   *
   * Safe to call twice. The order row is claimed with a conditional update, so
   * a client that retries a confirm it already made is told the order was
   * settled and nothing is written a second time.
   */
  app.post("/v1/orders/:id/confirm", async (c) => {
    const identity = c.get("identity");
    const parsed = ConfirmOrderRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);

    const order = await read.orders.byId(identity.userId, c.req.param("id"));
    if (order === null) return c.json(fail("not_found", "Unknown order."), 404);

    const decision = order.decision as ReturnType<typeof decisionToWire>;
    if (decision.kind === "refuse") return c.json(fail("instrument_not_tradable", decision.detail), 409);

    const owner = identity.walletAddress;
    if (owner === null) return c.json(fail("unauthorized", "No wallet on this session."), 401);

    const mint = decision.best.mint;
    const [ref, token, multiplier, board] = await Promise.all([
      read.fills.tokenRef(mint),
      market().registry.byMint(mint),
      market().multipliers.multiplierFor(mint),
      // The underlying quote, to record on the lot beside the price paid. It
      // is read here rather than taken from the order's own `referencePrice`
      // because that one is from the quote the user was shown, which can be a
      // minute older than the fill.
      market().prices.pricesFor([mint]),
    ]);
    if (ref === null || token === null) return c.json(fail("not_found", "Unknown token."), 404);

    /*
     * Not yet on chain is a different answer from never: a client can confirm
     * before the node it asks has caught up, and that is worth retrying. It
     * gets the retryable code basket funding already uses, because `not_found`
     * also means an unknown order or token here — a caller cannot tell a
     * transaction that will appear from one of those, and so cannot know
     * whether asking again is worth anything.
     */
    const tx = await market().history.transaction(parsed.data.signature);
    if (tx === null) {
      return c.json(fail("transaction_pending", "Transaction is not settled yet. Try again shortly."), 409);
    }

    const fill = planFill(tx, {
      wallet: owner,
      side: decision.side,
      mint,
      decimals: token.decimals,
      multiplier: multiplier ?? D(1),
      // Without this the charge for sponsoring is indistinguishable from money
      // the swap spent, and it lands in the share price.
      ...(read.send.relay === undefined ? {} : { relayer: read.send.relay.signer.address }),
      now: new Date(),
    });
    if (fill.kind === "not_a_fill") return c.json(fail("validation_failed", fill.detail), 422);

    const settled = await read.fills.settle({
      userId: identity.userId,
      orderId: order.id,
      signature: parsed.data.signature,
      side: decision.side,
      ticker: decision.ticker,
      mint,
      tokenId: ref.tokenId,
      instrumentId: ref.instrumentId,
      fill,
      referencePricePerShare: board.get(mint)?.pricePerShare ?? null,
    });

    return c.json({
      status: "filled",
      alreadySettled: settled.kind === "already_settled",
      shares: toWire(fill.shares),
      pricePerShare: toWire(fill.pricePerShare),
      usd: toWire(fill.usd),
      feeUsd: toWire(fill.feeUsd),
      realisedPnlUsd:
        settled.kind === "settled" && settled.realisedPnlUsd !== null ? toWire(settled.realisedPnlUsd) : null,
    });
  });

  app.get("/v1/baskets", (c) =>
    c.json({
      baskets: BASKETS.map((b) => ({
        slug: b.slug,
        name: b.name,
        description: b.description,
        feeBps: b.feeBps,
        minimumUsd: b.minimumUsd,
        capUsd: b.capUsd,
        venue: "symmetry",
        constituents: b.constituents,
      })),
    }),
  );

  /**
   * Run the full decision on every leg without executing. This is what makes the
   * all-or-nothing rule visible before the user commits. See docs/04.
   */
  app.post("/v1/baskets/:slug/preview", async (c) => {
    const basket = BASKETS.find((b) => b.slug === c.req.param("slug"));
    if (basket === undefined) return c.json(fail("not_found", "Unknown basket."), 404);

    const parsed = InvestBasketRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(fail("validation_failed", parsed.error.message), 400);

    const legs = allocate(D(parsed.data.usdAmount), basket.constituents);
    const priced = await Promise.all(
      legs.map(async (leg) => {
        const decision = await priceOrder(market(), {
          ticker: leg.ticker,
          side: "buy",
          amount: toWire(leg.usdAmount),
        });
        return {
          ticker: leg.ticker,
          usdAmount: toWire(leg.usdAmount),
          decision: decision ? decisionToWire(decision) : null,
        };
      }),
    );

    const refusedLegs = priced
      .filter((l) => l.decision === null || l.decision.kind === "refuse")
      .map((l) => l.ticker);
    const queued = priced.filter((l) => l.decision?.kind === "offer_queue").length;

    return c.json({
      legs: priced,
      refusedLegs,
      // Any refused leg fails the whole basket. We never silently rebalance. docs/04.
      overall: refusedLegs.length > 0 ? "refused" : queued > 0 ? "partial" : "executable",
    });
  });

  app.notFound((c) => c.json(fail("not_found", "No such route."), 404));
  return app;
}
