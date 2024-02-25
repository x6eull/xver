import { Client, NoAuthMethod, PasswordAuthMethod, PublicKeyAuthMethod, ServerHostKeyAlgorithm } from 'ssh2';
import { InternalConfig, findDefault } from './config';
import { ElementOf, alwaysMatch, neverMatch, subStringUntil } from './utils';
import { open } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

function getOpensshPath(filename: string): string {
  return join(homedir(), '.ssh', filename);
}

function parseSSHPublicKey(from: Buffer, maxCount?: number): Buffer[] {
  maxCount ??= 255;
  const length = from.byteLength;
  let curIndex = 0, count = 0;
  const result: Buffer[] = [];
  while (curIndex < length && count++ < maxCount) {
    const eleLength = from.readUInt32BE(curIndex);
    curIndex += 4;
    result.push(from.subarray(curIndex, curIndex += eleLength));
  }
  return result;
}

function getSSHPublicKeyAlg(from: Buffer | string) {
  if (typeof from === 'string')
    from = Buffer.from(from, 'base64');
  const [parsed] = parseSSHPublicKey(from, 1);
  return parsed.toString('utf8');
}

function parseSSHFormat(line: string): [string, string] | undefined {
  line = subStringUntil(line, '#');
  if (line.isWhitespace()) return undefined;
  const [alg, value] = line.split(' ');
  return [alg, value];
}

export class XverClient {
  private readonly config: InternalConfig;
  private readonly ssh2Client: Client;
  constructor(config: InternalConfig) {
    this.config = config;
    this.ssh2Client = new Client({ captureRejections: false });
    this.ssh2Client.on('error', (err) => console.error(err.message));
  }

  async connect(server?: ElementOf<InternalConfig['servers']>) {
    server ??= findDefault(this.config.servers);
    const { openssh: { useId, trustKnownHosts: { allowPattern, blockPattern } } } = this.config;
    const hostkeys: Map<string, string> = new Map();
    if (server.publicKey) {
      const parts = server.publicKey.split(' ');
      if (parts.length === 1)
        hostkeys.set(getSSHPublicKeyAlg(parts[0]), parts[0]);
      else
        hostkeys.set(parts[0], parts[1]);
    }
    if (allowPattern !== neverMatch && blockPattern !== alwaysMatch) {
      const kHostFile = await open(getOpensshPath('known_hosts'));
      for await (let line of kHostFile.readLines({ autoClose: true })) {
        const result = parseSSHFormat(line);
        if (result)
          hostkeys.set(result[0], result[1]);
      }
    }
    if (useId) {
      //TODO
    }
    const triedMethods: Set<string> = new Set();
    const username = server.username ?? 'root';
    function tried(method: Omit<NoAuthMethod, 'username'> | Omit<PublicKeyAuthMethod, 'username'> | Omit<PasswordAuthMethod, 'username'>) {
      triedMethods.add(method.type);
      return method;
    }
    const supportedHostkeyAlg: ServerHostKeyAlgorithm[] = ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'];
    const hostkeyAlgList = supportedHostkeyAlg.sortLike([...hostkeys.keys()] as any);
    this.ssh2Client.connect({
      host: server.hostname,
      port: server.sshPort ?? 22,
      tryKeyboard: false,
      username,
      algorithms: {
        serverHostKey: hostkeyAlgList
      },
      hostVerifier(fingerprint: Buffer) {
        const usingAlg = getSSHPublicKeyAlg(fingerprint);
        const trustedKey = hostkeys.get(usingAlg);
        if (!trustedKey) {
          //TODO prompt whether to trust this key
          return false;
        }
        else {
          const usingKey = fingerprint.toString('base64');
          if (trustedKey === usingKey)
            return true;
          else {
            console.error('Unmatched key. Provided:', usingKey, 'wanted:', trustedKey);
            return false;
          }
        }
      },
      authHandler(methodsLeft, partialSuccess, next) {
        methodsLeft = methodsLeft?.filter(m => !triedMethods.has(m)) ?? [];
        if (!methodsLeft.length)
          if (triedMethods.has('none')) return false;
          else return tried({ type: 'none' });
        else {
          //TODO use id_* in .ssh or provided values in config
          if (methodsLeft.includes('publickey')) {
            return tried({ type: 'publickey', key: '' });
          }
          if (methodsLeft.includes('password'))
            return tried({ type: 'password', password: '' });
        }
      }
    });
  }
}