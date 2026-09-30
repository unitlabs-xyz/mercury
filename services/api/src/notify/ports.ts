/** One message to one person. */
export interface Notice {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
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
