import type { Notice, Notifier } from "./ports.js";

/**
 * Email, through Resend's HTTP API.
 *
 * Written against `fetch` rather than their SDK: this is one POST, and the
 * dependency would be larger than the code it replaced. Node 24 has fetch.
 */
export const resendNotifier = (opts: { apiKey: string; from: string }): Notifier => ({
  async send(notice: Notice): Promise<boolean> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: opts.from,
          to: [notice.to],
          subject: notice.subject,
          text: notice.body,
          ...(notice.html === undefined ? {} : { html: notice.html }),
          ...(notice.attachments === undefined
            ? {}
            : {
                attachments: notice.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content.toString("base64"),
                  ...(a.contentId === undefined ? {} : { content_id: a.contentId }),
                })),
              }),
        }),
      });
      if (!res.ok) {
        // The status and nothing else. A provider's error body can quote the
        // message back, and the message names what somebody owes.
        console.error(`notify: Resend refused a message (${res.status})`);
        return false;
      }
      return true;
    } catch (error: unknown) {
      console.error("notify: could not reach Resend", error);
      return false;
    }
  },
});

/**
 * Where a message goes when no provider is configured.
 *
 * Deliberately not a silent no-op. The alternative to seeing these in the log
 * is a deployment that believes it is warning people and is not — the exact
 * failure this watcher exists to prevent, one level up.
 */
export const loggingNotifier = (): Notifier => ({
  async send(notice: Notice): Promise<boolean> {
    // The subject, never the body: the body says what somebody owes and how
    // close they are to losing their shares, which does not belong in a log.
    console.warn(`notify: no mail provider configured; would have sent "${notice.subject}"`);
    return false;
  },
});
