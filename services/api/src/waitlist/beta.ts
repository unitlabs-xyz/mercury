import type { Notice } from "../notify/ports.js";
import { SITE } from "./share.js";

/**
 * The "Mercury is live" email to the waitlist.
 * Same build as the welcome email (share.ts): tables, inline colours with a
 * dark-mode override, the wordmark as an inline attachment, one button.
 */
export const BETA_URL = "https://beta.trymercury.xyz";

/** Who it goes to. */
export interface BetaRecipient {
  readonly email: string;
  readonly position: number;
  readonly name: string | null;
}

interface Copy {
  readonly subject: string;
  readonly preheader: string;
  readonly headline: string;
  readonly paragraphs: readonly string[];
  /** Short feature lines, shown as a list. */
  readonly points?: readonly string[];
  readonly button: string;
}

const copyFor = (r: BetaRecipient): Copy => {
  const first = r.name ? r.name.split(/\s+/)[0]! : null;
  return {
    subject: "Mercury is live. Your access is ready",
    preheader: "The beta is open, and your spot on the waitlist gets you straight in.",
    headline: "Mercury is live in beta.",
    paragraphs: [
      `${first ? `${first}, you` : "You"} joined the waitlist, and your access is now open. Sign in with ${r.email}, the address you joined with, and you're in.`,
      "Here is what you can do from day one:",
    ],
    points: [
      "Buy tokenized stocks, from Apple to the S&P 500, in any amount.",
      "Borrow against your stocks without selling them.",
      "Invest in curated baskets, by theme or by strategy.",
    ],
    button: "Open Mercury",
  };
};

const escape = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** The email for one person. `wordmark` is the PNG from `renderWordmark()`. */
export function betaNotice(r: BetaRecipient, wordmark: Buffer, appUrl = BETA_URL): Notice {
  const copy = copyFor(r);
  const why = "You're receiving this because you joined the Mercury waitlist.";
  const host = appUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const body = [
    copy.headline,
    "",
    ...copy.paragraphs.flatMap((p) => [p, ""]),
    ...(copy.points ? [...copy.points.map((p) => `- ${p}`), ""] : []),
    `${copy.button}: ${appUrl}`,
    "",
    "Mercury",
    SITE,
    "",
    why,
  ].join("\n");

  const c = {
    bg: "#ffffff",
    fg: "#141614",
    muted: "#4f554d",
    line: "#e4e7e1",
    fine: "#7f867c",
    btnBg: "#141614",
    btnFg: "#ffffff",
  };
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const para = (p: string) =>
    `<tr><td class="mx-muted" style="padding:20px 20px 0;font-family:${font};font-size:15px;line-height:1.7;color:${c.muted}">${escape(p)}</td></tr>`;
  const points = copy.points
    ? `<tr><td style="padding:20px 20px 0">
<table role="presentation" class="mx-line" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${c.line}">
${copy.points
  .map(
    (p) =>
      `<tr><td class="mx-line mx-fg" style="padding:16px 0;border-bottom:1px solid ${c.line};font-family:${font};font-size:15px;line-height:1.55;color:${c.fg}">${escape(p)}</td></tr>`,
  )
  .join("\n")}
</table></td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escape(copy.subject)}</title>
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .mx-bg { background: #0f120f !important; }
    .mx-fg { color: #f1f3ef !important; }
    .mx-muted { color: #b5bbb2 !important; }
    .mx-fine, .mx-fine a { color: #7f867c !important; }
    .mx-fine a.mx-fg { color: #f1f3ef !important; }
    .mx-line { border-color: #262b25 !important; }
    .mx-btn { background: #ffffff !important; color: #0f120f !important; }
  }
</style>
</head>
<body class="mx-bg" style="margin:0;padding:0;background:${c.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(copy.preheader)}</div>
<table role="presentation" class="mx-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.bg}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="mx-bg" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${c.bg}">
<tr><td style="padding:12px 20px 0">
<a href="${SITE}" style="text-decoration:none;border:0"><img src="cid:wordmark" width="99" height="30" alt="Mercury" style="display:block;border:0;width:99px;height:30px;border-radius:8px"></a>
</td></tr>
<tr><td class="mx-fg" style="padding:32px 20px 4px;font-family:${font};font-size:30px;line-height:1.15;font-weight:500;letter-spacing:-0.03em;color:${c.fg}">${escape(copy.headline)}</td></tr>
${copy.paragraphs.map(para).join("\n")}
${points}
<tr><td style="padding:34px 20px 0">
<a class="mx-btn" href="${escape(appUrl)}" style="display:inline-block;background:${c.btnBg};color:${c.btnFg};font-family:${font};font-size:15px;font-weight:500;text-decoration:none;padding:13px 22px;border-radius:999px">${escape(copy.button)}</a>
</td></tr>
<tr><td class="mx-muted" style="padding:16px 20px 0;font-family:${font};font-size:13px;color:${c.muted}">or go to <a href="${escape(appUrl)}" class="mx-fg" style="color:${c.fg};text-decoration:underline">${escape(host)}</a></td></tr>
<tr><td style="padding:40px 20px 0"><div class="mx-line" style="border-top:1px solid ${c.line};font-size:0;line-height:0">&nbsp;</div></td></tr>
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
    to: r.email,
    subject: copy.subject,
    body,
    html,
    attachments: [{ filename: "mercury.png", content: wordmark, contentId: "wordmark" }],
  };
}
