import type { ReferralSummary } from "@mercury/types";
import { useReferrals } from "../api/referrals";
import { Button } from "../ui/Button";
import { PanelHeader, SidePanel } from "../ui/Dialog";
import { Check, Copy } from "../ui/icons";
import { Skeleton } from "./portfolio/ui";
import { Swap, useFlag } from "./Receive";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/*
 * The friend's side only. What the inviter earns is not on this screen until
 * the lawyer has said it may be paid: see the rewards plan.
 */
const RULES = [
  "Friends who join through your link get 25% off Mercury's fee for 90 days.",
  "A friend counts as funded once they add $50 and make a trade.",
  "Each person can be invited once, and only while their account is new.",
];

const CopyLink = ({ link }: { link: string }) => {
  const [copied, flag] = useFlag();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      flag();
    } catch {
      /* no clipboard permission: nothing to report */
    }
  };
  return (
    <Button variant="primary" onClick={copy} iconSize="md">
      <Swap k={copied ? "copied" : "copy"}>
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy link"}
      </Swap>
    </Button>
  );
};

/** The platform share sheet where there is one; copying where there is not. */
const ShareLink = ({ link }: { link: string }) => {
  const [done, flag] = useFlag();
  const share = async () => {
    const text = `Join me on Mercury: 25% off the trading fee for your first 90 days. ${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Mercury", text, url: link });
        return;
      }
      await navigator.clipboard.writeText(text);
      flag();
    } catch {
      /* dismissed, or no permission: nothing to report */
    }
  };
  return (
    <Button onClick={share}>
      <Swap k={done ? "done" : "share"}>{done ? "Copied to share" : "Share"}</Swap>
    </Button>
  );
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg bg-ds-panel px-4 py-3">
    <dt className="text-[12px] leading-none text-ds-muted">{label}</dt>
    <dd className="mt-2 text-[24px] leading-none font-medium text-ds-ink">{value}</dd>
  </div>
);

const Body = ({ s }: { s: ReferralSummary }) => (
  <>
    <div className="rounded-lg bg-ds-panel p-1">
      <p className="truncate rounded-md bg-white px-4 py-3 font-mono text-[13px] text-ds-ink">{s.link}</p>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <CopyLink link={s.link} />
        <ShareLink link={s.link} />
      </div>
    </div>
    <dl className="grid grid-cols-2 gap-3">
      <Stat label="Invited" value={s.invited} />
      <Stat label="Funded" value={s.funded} />
    </dl>
    <ul className="flex list-disc flex-col gap-2 pl-4 text-[13px] leading-[1.45] text-ds-muted">
      {RULES.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
    {s.discountUntil !== null && (
      <p className="rounded-lg bg-ds-up-chip px-3 py-2.5 text-[12px] leading-[1.45] text-ds-ink">
        You were invited: 25% off Mercury's fee until {day(s.discountUntil)}.
      </p>
    )}
  </>
);

export const Invite = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const q = useReferrals(open);
  return (
    <SidePanel open={open} onClose={onClose} labelledBy="invite-heading">
      <PanelHeader id="invite-heading" title="Invite friends" sub="Share your link" onClose={onClose} />
      <div className="flex flex-col gap-5 px-6 pt-5 pb-6">
        {q.isPending ? (
          <Skeleton className="h-28 w-full" />
        ) : q.data === undefined ? (
          <p className="text-[13px] text-ds-muted">Your invite link didn't load. Close this and try again.</p>
        ) : (
          <Body s={q.data} />
        )}
      </div>
    </SidePanel>
  );
};
