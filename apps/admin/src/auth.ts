import { usePrivy } from "@privy-io/react-auth";

/**
 * Whether Privy has decided who is calling.
 *
 * The same question the product's `useSignedIn` answers, without its
 * sample-data branch: this app has no sample mode, so there is no path on
 * which it believes somebody is signed in when nobody is.
 *
 * Being signed in is not being an admin. The API decides that, from
 * `ADMIN_PRIVY_USER_IDS`, and answers 404 to everybody else — so the most a
 * signed-in stranger reaching this app achieves is five 404s.
 */
export const useSignedIn = (): boolean => {
  const { ready, authenticated } = usePrivy();
  return ready && authenticated;
};
