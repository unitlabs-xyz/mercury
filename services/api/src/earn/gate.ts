/**
 * Read Earn only for an account that has used it.
 *
 * Everyone else holds nothing there, and reading them cost a Kamino and a node
 * call on every portfolio and money request, and tied their hourly snapshot to
 * Kamino's API: down at boot, and every account's reading was skipped. Shares
 * bought outside the app, by an account that never used Earn here, are not
 * counted; every move made in the app is recorded, by the send path if not by
 * the confirm.
 */
export const onlyIfUsed =
  <T>(used: (wallet: string) => Promise<boolean>, read: (wallet: string) => Promise<T>, none: T) =>
  async (wallet: string): Promise<T> =>
    (await used(wallet)) ? read(wallet) : none;
