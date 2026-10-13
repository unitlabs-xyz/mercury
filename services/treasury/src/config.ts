import { evmAddressFrom } from "@mercury/keys/evm";
import { svmAddressFrom } from "@mercury/keys/svm";
import { bvmAddressFrom } from "@mercury/keys/bvm";

export interface TreasuryAddresses {
  readonly evm: string;
  readonly svm: string;
  readonly bvm: string;
}

export interface TreasuryConfig {
  readonly secret: string;
  readonly addresses: TreasuryAddresses;
}

const required = (env: Record<string, string | undefined>, name: string): string => {
  const value = env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is not set. The treasury cannot start without it.`);
  }
  return value;
};

/**
 * Keys in, addresses out, and the keys are not kept.
 *
 * There is no degraded mode worth having. A treasury that starts without a key
 * reports an address it cannot spend from, or no address at all — and the API
 * hides funding either way, so a quiet half-start buys nothing and hides the
 * cause. It fails here, loudly, naming the variable.
 *
 * The derivations are wrapped because a curve library's own error can carry
 * the input it was handed, and the input is a private key. What comes out
 * names the variable and nothing else.
 */
export const readTreasuryConfig = async (
  env: Record<string, string | undefined>,
): Promise<TreasuryConfig> => {
  const secret = required(env, "TREASURY_SECRET");

  const derive = async <T>(name: string, from: (raw: string, label: string) => T): Promise<T> => {
    const raw = required(env, name);
    try {
      return await from(raw, name);
    } catch (error: unknown) {
      /* Our own parser's message is safe to pass on — it names the variable and
         never the value — so that one keeps its cause. */
      if (error instanceof Error && error.message.startsWith(`The ${name} `)) {
        throw new Error(error.message, { cause: error });
      }
      /*
       * And anything else is replaced wholesale, cause included.
       *
       * This is the one place in this repo where dropping the cause is the
       * point: a curve library's error can carry the bytes it was handed, and
       * those bytes are a private key. `cause` would carry them into every log
       * line, crash report and error tracker that ever sees this throw. The
       * variable's name is the whole of what is safe to pass on.
       */
      // eslint-disable-next-line preserve-caught-error -- see above: the cause would carry the key
      throw new Error(`${name} is not a key this service can read.`);
    }
  };

  return {
    secret,
    addresses: {
      evm: await derive("TREASURY_KEY_EVM", evmAddressFrom),
      svm: await derive("TREASURY_KEY_SVM", svmAddressFrom),
      bvm: await derive("TREASURY_KEY_BVM", bvmAddressFrom),
    },
  };
};
