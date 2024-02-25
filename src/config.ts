import { throwErr } from "./error";
import { ElementOf, alwaysMatch, isEmpty, neverMatch, removeProps, toArray, toInt } from "./utils";

export type PublicKey = string;

type Host = ({
  host: string;
} | {
  hostname: string;
  port?: number;
});
export type ServerConfig = Host & {
  username?: string;
  sshPort?: number;
  default?: boolean;
  label?: string;
  publicKey?: PublicKey;
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
            return true;
          else if (from === false || isEmpty(from))
            return false;
          else
            return toArray(from);
        })(from.useId)
      }
    })(from.openssh),
    servers: ((from = []) => {
      return from.map((from, index) => {
        if ('host' in from) {
          const parts = from.host.split(':');
          return { ...removeProps(from, ['host']), hostname: parts[0], port: toInt(parts[1], defaultPort), label: from.label ?? `#${index}` };
        } else
          return { ...from, hostname: from.hostname, port: toInt(from.port, defaultPort), label: from.label ?? `#${index}` };
      });
    })(from.servers)
  };
}
export type InternalConfig = ReturnType<typeof loadConfig>;
export type InternalServerConfig = ElementOf<InternalConfig['servers']>;

export function findDefault(servers: InternalConfig['servers']): InternalServerConfig {
  const result = servers.find(server => server.default) ?? servers[0];
  if (!result)
    throwErr('No server provided');
  return result;
}