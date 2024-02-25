import { Client, ServerHostKeyAlgorithm } from 'ssh2';
import { InternalConfig, findDefault } from './config';
import { ElementOf, alwaysMatch, neverMatch, subStringUntil } from './utils';
import { open, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

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

function parseSSHFormat(line: string): [string, string, string] | undefined {
  line = subStringUntil(line, '#');
  if (line.isWhitespace()) return undefined;
  const [hostname, alg, value] = line.split(' ');
  return [hostname, alg, value];
}

const supportedIdSuffix = ['ed25519', 'ecdsa', 'rsa'] as const;
export type SupportedIdSuffix = typeof supportedIdSuffix[number];
export class XverClient {
  private readonly config: InternalConfig;
  private readonly ssh2Client: Client;
  constructor(config: InternalConfig) {
    this.config = config;
    this.ssh2Client = new Client({ captureRejections: false });
    this.ssh2Client.on('error', (err) => console.error(err.message));
    this.ssh2Client.on('ready', () => console.log('Connected!'));
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
        if (!result) continue;
        const [hostname, alg, key] = result;
        if (hostname !== server.hostname) continue;
        hostkeys.set(alg, key);
      }
    }
    let idFiles: string[] = [];
    if (useId) {
      if (useId === true) idFiles = supportedIdSuffix.map(s => getOpensshPath(`id_${s}`));
      else if (typeof useId === 'string') idFiles = [getOpensshPath(`id_${useId}`)];
      else idFiles = useId.map(s => getOpensshPath(`id_${s}`));
    }
    const username = server.username ?? 'root';
    const supportedHostkeyAlg: ServerHostKeyAlgorithm[] = ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'];
    const hostkeyAlgList = supportedHostkeyAlg.sortLike([...hostkeys.keys()] as any);
    let pwdTryTimes = 0;
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
        methodsLeft ??= ['publickey', 'password'];
        if (methodsLeft.includes('publickey')) {
          while (idFiles.length) {
            const idPath = idFiles.shift()!;
            if (existsSync(idPath)) {
              readFile(idPath).then((key) => next({ type: 'publickey', key, username }));
              return undefined;
            }
          }
        }
        if (methodsLeft.includes('password') && pwdTryTimes < 3) {
          //TODO prompt for password, disapprove/disable providing password in config
          pwdTryTimes++;
          return { type: 'password' };
        }
      }
    });
  }
}