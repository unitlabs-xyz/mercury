import type { Notice } from "../notify/ports.js";
import { FOUNDING_SEATS, waveFor } from "./card.js";

/** Where replies and unsubscribe requests go. */
const REPLY_TO = "hello@trymercury.xyz";

/** One signup's card, as everything outside the database sees it. */
export interface CardView {
  readonly position: number;
  readonly handle: string | null;
  readonly founding: boolean;
  /** "Wave 3" for a signup since the beta opened; see waveFor. */
  readonly wave: string;
  /** The PNG. */
  readonly image: string;
  /** The page that unfurls into the card on X, and sends a person on to the site. */
  readonly page: string;
  /** X's compose window, with the post already written and the page attached. */
  readonly intent: string;
}

export const SITE = "https://trymercury.xyz";
export const X_ACCOUNT = "trymercury_";

/**
 * The post written for them. Theirs to change before they send it; this is
 * only what the compose window opens with.
 */
export function shareText(position: number): string {
  return position <= FOUNDING_SEATS
    ? `Just claimed spot #${position} of ${FOUNDING_SEATS} on @${X_ACCOUNT}. Money that stays invested and spendable, and only ${FOUNDING_SEATS} get in first. Grab yours 👇`
    : `Just claimed spot #${position} on @${X_ACCOUNT}. Money that stays invested and spendable. Get in line 👇`;
}

/**
 * X attaches no image from an intent link. It unfurls the URL, so the URL is
 * the card page, whose tags name the PNG.
 */
export function intentUrl(position: number, page: string): string {
  const params = new URLSearchParams({ text: shareText(position), url: page });
  return `https://x.com/intent/post?${params.toString()}`;
}

export function cardView(
  row: { position: number; handle: string | null; slug: string; joinedAt?: Date },
  base: string,
): CardView {
  const page = `${base}/f/${row.slug}`;
  return {
    position: row.position,
    handle: row.handle,
    founding: row.position <= FOUNDING_SEATS,
    wave: waveFor(row.position, row.joinedAt),
    image: `${base}/waitlist/cards/${row.slug}.png`,
    page,
    intent: intentUrl(row.position, page),
  };
}

const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/**
 * What unfurls on X. Crawlers read the tags and stop; a person is sent on to
 * the site straight away, with the slug as the referral.
 */
export function cardPage(card: CardView, slug: string, preview = false): string {
  const title = card.founding
    ? `Spot #${card.position} of ${FOUNDING_SEATS} · Mercury`
    : `Spot #${card.position} · Mercury`;
  const description = "Money that stays invested and spendable. Join the Mercury waitlist.";
  const onward = `${SITE}/?ref=${encodeURIComponent(slug)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="${escape(card.image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${escape(card.page)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@${X_ACCOUNT}">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${escape(card.image)}">
${preview ? "" : `<meta http-equiv="refresh" content="0;url=${escape(onward)}">`}
</head>
<body${preview ? ' style="margin:0;padding:24px;background:#111;color:#fff;font-family:sans-serif"' : ""}>${
    preview
      ? `<p>What X shows when this link is posted:</p><img src="${escape(card.image)}" width="600" style="border-radius:12px;max-width:100%;height:auto"><p><a style="color:#fff" href="${escape(onward)}">Continue to Mercury</a></p>`
      : `<a href="${escape(onward)}">Continue to Mercury</a>`
  }</body>
</html>`;
}

/**
 * The welcome email: headline, the spot's details, the card, one line about
 * Mercury, and one button.
 *
 * Light by default, dark where the reader's mail app is in dark mode and
 * honours `prefers-color-scheme` (Apple Mail, iOS, Outlook.com). Gmail ignores
 * the media query and shows the light one. Every colour is inline, with a class
 * the dark block overrides, because inline is all some clients read.
 *
 * Laid out in tables, which is all most mail clients honour. The card rides
 * along as an inline attachment, so nothing is fetched when it opens. It is
 * the only image: the logo that used to sit above the headline was a second
 * attachment and a spam signal for no gain, so the email opens on the headline.
 */
export function welcomeNotice(to: string, card: CardView, png: Buffer): Notice {
  /* Signed up since the beta opened: a numbered wave, and access by wave. */
  const waved = card.wave.startsWith("Wave ");
  const headline = card.founding
    ? `Spot #${card.position} of ${FOUNDING_SEATS} is yours.`
    : `Spot #${card.position} is yours.`;
  const subject = waved
    ? `You're in ${card.wave.toLowerCase()}. Spot #${card.position} is yours`
    : card.founding
      ? `You're in. Spot #${card.position} of ${FOUNDING_SEATS} is yours`
      : `You're in. Spot #${card.position} is yours`;
  const preheader = waved
    ? `Mercury is live in beta. Your wave gets access together, and your card is inside.`
    : card.founding
      ? `You're one of the first ${FOUNDING_SEATS} into Mercury. Your card is inside.`
      : "Your place in line for Mercury is saved. Your card is inside.";
  const pitch = waved
    ? `Mercury is live in beta and opens to the waitlist one wave at a time. You're in ${card.wave.toLowerCase()}: real stocks and dollars in a wallet you own, and money you can grow and spend from the same place. We'll email you the moment your wave opens.`
    : card.founding
      ? `The first ${FOUNDING_SEATS} people get into Mercury before anyone else: real stocks and dollars in a wallet you own, and money you can grow and spend from the same place. You're one of them.`
      : `Mercury opens to the first ${FOUNDING_SEATS}, then to everyone on the list in order: real stocks and dollars in a wallet you own, and money you can grow and spend from the same place. Your spot is saved.`;
  const details: [string, string][] = [
    ...(card.handle ? ([["Held by", `@${card.handle}`]] as [string, string][]) : []),
    ["Wave", waved ? card.wave.slice(5) : card.wave],
    ["Status", "Reserved"],
  ];
  const next = waved
    ? "Nothing to do until then. We'll write when your wave opens, and not before."
    : "We'll write again when your access is ready, and not before.";
  const why = "You're receiving this because you joined the Mercury waitlist.";

  const body = [
    headline,
    "",
    ...details.map(([k, v]) => `${k}: ${v}`),
    "",
    pitch,
    "",
    "Share your card on X:",
    card.intent,
    "",
    next,
    "",
    "Mercury",
    SITE,
    "",
    why,
  ].join("\n");

  // Light first; the same names, darker, in the media query below.
  const c = {
    bg: "#ffffff",
    fg: "#141614",
    muted: "#4f554d",
    label: "#7a8077",
    line: "#e4e7e1",
    fine: "#7f867c",
    btnBg: "#141614",
    btnFg: "#ffffff",
  };
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const cells = details
    .map(
      ([
        k,
        v,
      ]) => `<td valign="top" style="padding:16px 12px 18px 0;width:${Math.floor(100 / details.length)}%">
<div class="mx-label" style="font-family:${font};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${c.label};margin:0 0 4px">${escape(k)}</div>
<div class="mx-fg" style="font-family:${font};font-size:15px;font-weight:500;color:${c.fg};word-break:break-word">${escape(v)}</div>
</td>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escape(subject)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .mx-bg { background: #0f120f !important; }
    .mx-fg { color: #f1f3ef !important; }
    .mx-muted { color: #b5bbb2 !important; }
    .mx-label { color: #848b81 !important; }
    .mx-fine, .mx-fine a { color: #7f867c !important; }
    .mx-fine a.mx-fg { color: #f1f3ef !important; }
    .mx-line { border-color: #262b25 !important; }
    .mx-btn { background: #ffffff !important; color: #0f120f !important; }
  }
</style>
</head>
<body class="mx-bg" style="margin:0;padding:0;background:${c.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(preheader)}</div>
<table role="presentation" class="mx-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.bg}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="mx-bg" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${c.bg}">
<tr><td class="mx-fg" style="padding:12px 20px 20px;font-family:${font};font-size:30px;line-height:1.15;font-weight:500;letter-spacing:-0.03em;color:${c.fg}">${escape(headline)}</td></tr>
<tr><td style="padding:0 20px">
<table role="presentation" class="mx-line" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${c.line};border-bottom:1px solid ${c.line}"><tr>${cells}</tr></table>
</td></tr>
<tr><td style="padding:22px 20px 0"><img src="cid:card" width="560" alt="Your Mercury card, number ${card.position}" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:12px"></td></tr>
<tr><td class="mx-muted" style="padding:22px 20px 0;font-family:${font};font-size:15px;line-height:1.6;color:${c.muted}">${escape(pitch)}</td></tr>
<tr><td style="padding:24px 20px 0">
<a class="mx-btn" href="${escape(card.intent)}" style="display:inline-block;background:${c.btnBg};color:${c.btnFg};font-family:${font};font-size:15px;font-weight:500;text-decoration:none;padding:13px 22px;border-radius:999px">Share your card on X</a>
</td></tr>
<tr><td style="padding:28px 20px 0;font-family:${font};font-size:14px;line-height:1.6;color:${c.muted}" class="mx-muted">${escape(next)}</td></tr>
<tr><td style="padding:32px 20px 0"><div class="mx-line" style="border-top:1px solid ${c.line};font-size:0;line-height:0">&nbsp;</div></td></tr>
<tr><td class="mx-fine" style="padding:18px 20px 12px;font-family:${font};font-size:12px;line-height:1.7;color:${c.fine}">
<a href="${SITE}" class="mx-fg" style="color:${c.fg};font-weight:500;text-decoration:none">Mercury</a><br>
<a href="${SITE}" style="color:${c.fine};text-decoration:underline">${SITE}</a><br>
${escape(why)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return {
    to,
    subject,
    body,
    html,
    attachments: [
      // Inline only: drawn in the body, not offered as a file.
      { filename: `mercury-${card.position}.png`, content: png, contentId: "card" },
    ],
    replyTo: REPLY_TO,
    // Gmail and Yahoo file bulk mail without an unsubscribe header as spam.
    headers: { "List-Unsubscribe": `<mailto:${REPLY_TO}?subject=unsubscribe>` },
  };
}
