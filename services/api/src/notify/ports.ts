/** One message to one person. */
export interface Notice {
  readonly to: string;
  readonly subject: string;
  /** Plain text. Always sent, so a client that will not render HTML still reads it. */
  readonly body: string;
  /** Optional HTML alongside the text. */
  readonly html?: string;
  /** Where replies go, when not the sender. */
  readonly replyTo?: string;
  /** Extra mail headers, e.g. List-Unsubscribe. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly attachments?: readonly {
    readonly filename: string;
    readonly content: Buffer;
    /** Set, the attachment is shown in the HTML at `cid:<contentId>` rather than only listed. */
    readonly contentId?: string;
  }[];
}

export interface Notifier {
  /**
   * True when the message was handed to something that will deliver it.
   *
   * False is not an error to throw on: the caller records that this person has
   * *not* been told and tries again next pass. A watcher that fell over because
   * a mail provider was down would stop watching every other loan too.
   */
  send(notice: Notice): Promise<boolean>;
}
