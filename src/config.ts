import { alwaysMatch, neverMatch, toArray, toInt } from "./utils";

export type PublicKey = string;

type Host = ({
  host: string;
} | {
  hostname: string;
  port?: number;
});
export type ServerConfig = Host & {
  label?: string;
  publicKey: PublicKey;
}

export interface AllowPatternRecord { allowPattern: string }
export interface BlockPatternRecord { blockPattern: string }
export type IdSuffix = 'rsa';
export interface XverConfig {
  openssh?: {
    trustKnownHosts?: boolean | AllowPatternRecord | BlockPatternRecord | (AllowPatternRecord & BlockPatternRecord);
    useId?: boolean | IdSuffix | IdSuffix[];
  },
  servers?: ServerConfig[]
}

const defaultPort = 4096;
export function loadConfig(from: XverConfig) {
  return {
    openssh: ((from = {}) => {
      return {
        trustKnownHosts: ((from = false) => {
          if (from === true)
            return { allowPattern: alwaysMatch, blockPattern: neverMatch };
          else if (from === false)
            return { allowPattern: neverMatch, blockPattern: alwaysMatch };
          else
            return {
              allowPattern: 'allowPattern' in from ? new RegExp(from.allowPattern) : alwaysMatch,
              blockPattern: 'blockPattern' in from ? new RegExp(from.blockPattern) : neverMatch
            };
        })(from.trustKnownHosts),
        useId: ((from = false) => {
          if (from === true)
            return alwaysMatch;
          else if (from === false)
            return neverMatch;
          else
            return new RegExp(`^id_(${toArray(from).join('|')})$`);
        })(from.useId)
      }
    })(from.openssh),
    servers: ((from = []) => {
      return from.map((from, index) => {
        if ('host' in from) {
          const parts = from.host.split(':');
          return { hostname: parts[0], port: toInt(parts[1], defaultPort), label: from.label ?? `#${index}` };
        } else
          return { hostname: from.hostname, port: toInt(from.port, defaultPort), label: from.label ?? `#${index}` };
      });
    })(from.servers)
  };
}
export type InternalConfig = ReturnType<typeof loadConfig>;