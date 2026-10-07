import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text as RNText, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { BasketExitMode } from "@mercury/types";
import { FUNDING_AMOUNT, displayBasketName, fundingDestination, usd } from "@mercury/view";
import { useMoney } from "../src/api";
import {
  trackOperation,
  useBasketEnrollment,
  useBasketEnrollmentAction,
  useBasketExitAction,
  useBasketFundingAction,
  useBasketPortfolio,
  useBasketRebalanceAction,
  useBasketTemplate,
} from "../src/baskets/api";
import { Fact } from "../src/baskets/ui";
import { Haptics } from "../src/haptics";
import { AmountWell, Button, Chip, Icon, Note, PanelHeader, Segmented, useBottomGap } from "../src/ui";
import { color, font, radius, space } from "../src/theme";

type Kind = "enroll" | "fund" | "rebalance" | "exit";

const short = (address: string | undefined) =>
  address === undefined ? "Unavailable" : `${address.slice(0, 6)}…${address.slice(-6)}`;

const tail = (accountId: string | undefined) => accountId?.split(":").at(-1);

/** The fixed amounts a first funding reaches for, in dollars. */
const PRESETS = [25, 50, 100, 250];

/**
 * Every write a basket takes, in the system's sheet: enrolling, adding USDC,
 * a manual rebalance and a withdrawal. Each states exactly what will be signed
 * — the amount, the destination, the assets — before the wallet is asked, as
 * the web's review sheets do; a failure stays on screen rather than retrying a
 * write on its own.
 */
export default function BasketSheet() {
  const { slug: rawSlug, kind: rawKind } = useLocalSearchParams<{ slug: string; kind: Kind }>();
  const slug = rawSlug ?? "";
  const kind: Kind = rawKind ?? "enroll";
  const router = useRouter();
  const bottom = useBottomGap();
  const template = useBasketTemplate(slug).data;
  const enrollment = useBasketEnrollment(slug);
  const portfolio = useBasketPortfolio(slug, Boolean(enrollment.data));
  const name = template ? displayBasketName(template.name) : "Basket";
  const close = () => router.back();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.root, { paddingBottom: bottom }]}>
        {kind === "enroll" ? (
          <Enroll
            slug={slug}
            name={name}
            assets={template?.allocations.length ?? 0}
            onClose={close}
            onFund={() => router.setParams({ kind: "fund" })}
          />
        ) : kind === "fund" ? (
          enrollment.data ? (
            <Fund slug={slug} name={name} portfolio={enrollment.data} onClose={close} />
          ) : (
            <Waiting onClose={close} title={`Fund ${name}`} />
          )
        ) : kind === "rebalance" ? (
          <Rebalance
            slug={slug}
            name={name}
            assets={template?.allocations.length ?? 0}
            portfolioId={portfolio.data?.portfolioId}
            onClose={close}
          />
        ) : (
          <Exit
            slug={slug}
            name={name}
            value={portfolio.data?.totalValueUsd}
            assetCount={portfolio.data?.assets.filter((a) => Number(a.balance) > 0).length ?? 0}
            portfolioId={portfolio.data?.portfolioId}
            onClose={close}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const Waiting = ({ title, onClose }: { title: string; onClose: () => void }) => (
  <>
    <PanelHeader title={title} sub="Checking your portfolio…" onClose={onClose} />
    <View style={s.body} />
  </>
);

/** A finished step: the tick, what happened, and what it does and does not mean yet. */
const Done = ({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) => (
  <View style={s.done}>
    <View style={s.tick}>
      <Icon name="check" size={20} color={color.up} strokeWidth={2.4} />
    </View>
    <RNText style={s.doneTitle}>{title}</RNText>
    <RNText style={s.doneBody}>{body}</RNText>
    <View style={s.doneActions}>{children}</View>
  </View>
);

const Failure = ({ error }: { error: Error | null }) =>
  error === null ? null : (
    <Note tone="down">{error.message.length > 240 ? `${error.message.slice(0, 240)}…` : error.message}</Note>
  );

/* ── enroll ──────────────────────────────────────────────────────────────── */

const Enroll = ({
  slug,
  name,
  assets,
  onClose,
  onFund,
}: {
  slug: string;
  name: string;
  assets: number;
  onClose: () => void;
  onFund: () => void;
}) => {
  const action = useBasketEnrollmentAction(slug);
  const enrollment = useBasketEnrollment(slug);
  const [checking, setChecking] = useState(false);

  const confirm = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChecking(true);
    try {
      /* A previous submission may have landed upstream even if its answer did not reach us. */
      const current = await enrollment.refetch();
      if (!current.isError && !current.data) await action.mutateAsync();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setChecking(false);
    }
  };

  if (action.isSuccess || (enrollment.data && !checking && !action.isPending)) {
    return (
      <Done
        title="Portfolio ready"
        body={`Your ${name} portfolio is set up. Adding USDC is a separate step you review next.`}
      >
        <Button label="Add USDC" onPress={onFund} />
        <Button label="Done" variant="secondary" onPress={onClose} />
      </Done>
    );
  }

  return (
    <>
      <PanelHeader
        title={`Enroll in ${name}`}
        sub="Review this before your wallet signs."
        onClose={onClose}
      />
      <View style={s.body}>
        <View style={s.panel}>
          <Fact k="Strategy" v={name} />
          <Fact k="Composition" v={`${assets} target assets`} />
          <Fact k="Ownership" v="Your Glider smart account" />
        </View>
        <RNText style={s.note}>
          No USDC is invested now. Enrolling creates your own portfolio; you add USDC afterwards. Your wallet
          signs once, and a network fee may apply.
        </RNText>
        <Failure error={action.error} />
      </View>
      <View style={s.footer}>
        <Button
          label={action.walletReady ? "Enroll now" : "Getting your wallet ready"}
          busy={checking || action.isPending}
          disabled={!action.walletReady}
          onPress={() => void confirm()}
        />
      </View>
    </>
  );
};

/* ── fund ────────────────────────────────────────────────────────────────── */

const Fund = ({
  slug,
  name,
  portfolio,
  onClose,
}: {
  slug: string;
  name: string;
  portfolio: NonNullable<ReturnType<typeof useBasketEnrollment>["data"]>;
  onClose: () => void;
}) => {
  const action = useBasketFundingAction(slug);
  const cash = Number(useMoney().data?.balanceUsd ?? NaN);
  const [amount, setAmount] = useState("100");
  const [review, setReview] = useState(false);
  const valid = FUNDING_AMOUNT.test(amount) && Number(amount) > 0;
  const over = Number.isFinite(cash) && valid && Number(amount) > cash;
  const receipt = action.data;

  if (receipt !== undefined) {
    return (
      <Done
        title={receipt.status === "confirmed" ? "USDC transfer confirmed" : "USDC transfer submitted"}
        body={
          receipt.status === "confirmed"
            ? "The transfer is on Solana. Glider may hold it as USDC until the next rebalance buys the target assets."
            : "The transfer is pending on Solana. Check Activity before sending again; positions aren't confirmed yet."
        }
      >
        <Button label="Done" onPress={onClose} />
      </Done>
    );
  }

  const confirm = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    action.mutate(
      { amountUsd: amount, portfolio },
      {
        onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        onError: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      },
    );
  };

  return (
    <>
      <PanelHeader
        title={review ? "Review USDC transfer" : `Add USDC to ${name}`}
        sub={
          review
            ? "Your wallet signs this transfer when you confirm."
            : "From your cash to your Glider portfolio."
        }
        onClose={onClose}
      />
      <View style={s.body}>
        {review ? (
          <View style={s.panel}>
            <Fact k="Amount" v={`${amount} USDC`} />
            <Fact k="From" v={short(tail(portfolio.ownerAccountId))} />
            <Fact k="To your smart account" v={short(tail(fundingDestination(portfolio) ?? undefined))} />
            <Fact k="Network" v="Solana" />
            <Fact k="Network fee" v="A little SOL, from your wallet" />
          </View>
        ) : (
          <>
            <AmountWell
              label="Amount"
              value={amount}
              onChange={setAmount}
              max={Number.isFinite(cash) && cash > 0 ? cash : undefined}
              note={Number.isFinite(cash) ? `${usd(cash)} cash available` : undefined}
              invalid={over}
            />
            <View style={s.chips}>
              {PRESETS.map((p) => (
                <Chip
                  key={p}
                  label={`$${p}`}
                  selected={amount === String(p)}
                  onPress={() => setAmount(String(p))}
                />
              ))}
            </View>
            {over && <Note tone="warn">{`That is more than your ${usd(cash)} cash.`}</Note>}
          </>
        )}
        <RNText style={s.note}>
          Adding USDC doesn&apos;t buy the target assets straight away; Glider invests it at the next
          rebalance.
        </RNText>
        <Failure error={action.error} />
      </View>
      <View style={[s.footer, s.row]}>
        {review && (
          <View style={s.fill}>
            <Button
              label="Back"
              variant="secondary"
              disabled={action.isPending}
              onPress={() => setReview(false)}
            />
          </View>
        )}
        <View style={s.wide}>
          <Button
            label={
              !action.walletReady
                ? "Getting your wallet ready"
                : review
                  ? `Send ${usd(Number(amount))}`
                  : "Review transfer"
            }
            busy={action.isPending}
            disabled={!valid || over || !action.walletReady}
            onPress={review ? confirm : () => setReview(true)}
          />
        </View>
      </View>
    </>
  );
};

/* ── rebalance ───────────────────────────────────────────────────────────── */

const Rebalance = ({
  slug,
  name,
  assets,
  portfolioId,
  onClose,
}: {
  slug: string;
  name: string;
  assets: number;
  portfolioId: string | undefined;
  onClose: () => void;
}) => {
  const action = useBasketRebalanceAction(slug);
  const confirm = () => {
    if (portfolioId === undefined) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    action.mutate(undefined, {
      onSuccess: (triggered) => {
        trackOperation(portfolioId, { operationId: triggered.operationId, kind: "rebalance" });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      },
      onError: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    });
  };
  return (
    <>
      <PanelHeader
        title={`Rebalance ${name}`}
        sub="Glider trades your smart account back toward the target weights."
        onClose={onClose}
      />
      <View style={s.body}>
        <View style={s.panel}>
          <Fact k="Target assets" v={String(assets)} />
          <Fact k="Execution" v="Starts in the background" />
        </View>
        <RNText style={s.note}>
          This can trade assets and costs network and swap fees. Holdings can differ from the targets until it
          completes, and a short cooldown may follow.
        </RNText>
        <Failure error={action.error} />
      </View>
      <View style={s.footer}>
        <Button
          label="Confirm rebalance"
          busy={action.isPending}
          disabled={portfolioId === undefined}
          onPress={confirm}
        />
      </View>
    </>
  );
};

/* ── exit ────────────────────────────────────────────────────────────────── */

const MODES: readonly { key: BasketExitMode; label: string }[] = [
  { key: "in_kind", label: "Assets in kind" },
  { key: "liquidate_usdc", label: "Convert to USDC" },
];

const Exit = ({
  slug,
  name,
  value,
  assetCount,
  portfolioId,
  onClose,
}: {
  slug: string;
  name: string;
  value: string | undefined;
  assetCount: number;
  portfolioId: string | undefined;
  onClose: () => void;
}) => {
  const action = useBasketExitAction(slug);
  const [mode, setMode] = useState<BasketExitMode>("in_kind");
  const prepared = action.prepare.data;
  const error = action.submit.error ?? action.prepare.error;

  const prepare = () => action.prepare.mutate(mode);
  const submit = () => {
    if (prepared === undefined || portfolioId === undefined) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    action.submit.mutate(prepared, {
      onSuccess: (done) => {
        trackOperation(portfolioId, { operationId: done.operationId, kind: "exit", mode: done.mode });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
      },
      onError: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    });
  };

  return (
    <>
      <PanelHeader
        title={prepared ? "Review withdrawal" : `Withdraw from ${name}`}
        sub={
          prepared
            ? "Check exactly what moves before your wallet signs."
            : "Choose how your portfolio comes back to your wallet."
        }
        onClose={onClose}
      />
      <View style={s.body}>
        {prepared === undefined && <Segmented options={MODES} value={mode} onChange={setMode} fill />}
        <View style={s.panel}>
          <Fact k="Current value" v={value === undefined ? "—" : usd(value)} />
          <Fact k="Assets in account" v={String(assetCount)} />
          <Fact k="To your wallet" v={short(tail(prepared?.recipientAccountId))} />
          {prepared !== undefined && (
            <Fact
              k={prepared.mode === "in_kind" ? "Assets to receive" : "Assets to convert"}
              v={String(prepared.message.assets.length)}
            />
          )}
        </View>
        <RNText style={s.note}>
          {mode === "in_kind"
            ? "The tokens move to your wallet without a sale. Their value can change while it settles."
            : "Glider swaps what it can into USDC and sends it to your wallet. Prices can move, and small or illiquid balances may stay behind."}
        </RNText>
        {error !== null && action.submit.error !== null && (
          <Note tone="warn">
            If you're unsure whether it went through, retry this same withdrawal rather than starting a new
            one.
          </Note>
        )}
        <Failure error={error} />
      </View>
      <View style={[s.footer, s.row]}>
        {prepared !== undefined && (
          <View style={s.fill}>
            <Button
              label="Back"
              variant="secondary"
              disabled={action.submit.isPending}
              onPress={() => {
                action.prepare.reset();
                action.submit.reset();
              }}
            />
          </View>
        )}
        <View style={s.wide}>
          <Button
            label={
              !action.walletReady
                ? "Getting your wallet ready"
                : prepared
                  ? "Sign and withdraw"
                  : "Review withdrawal"
            }
            busy={action.prepare.isPending || action.submit.isPending}
            disabled={!action.walletReady || portfolioId === undefined}
            onPress={prepared ? submit : prepare}
          />
        </View>
      </View>
    </>
  );
};

const s = StyleSheet.create({
  root: { backgroundColor: color.surface, paddingTop: space.md },
  body: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  panel: { borderRadius: radius.md, backgroundColor: color.tile, padding: space.md, gap: space.sm },
  note: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 18, color: color.muted },
  chips: { flexDirection: "row", gap: 6 },
  footer: { paddingHorizontal: space.lg, paddingTop: space.lg },
  row: { flexDirection: "row", gap: space.sm },
  fill: { flex: 1 },
  wide: { flex: 1.6 },
  done: { alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.sm },
  tick: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.upChip,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTitle: {
    marginTop: space.sm,
    fontFamily: font.medium,
    fontSize: 20,
    letterSpacing: -0.4,
    color: color.ink,
  },
  doneBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: color.muted,
    textAlign: "center",
  },
  doneActions: { alignSelf: "stretch", gap: space.sm, marginTop: space.lg },
});
