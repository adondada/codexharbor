import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { Client, type ConnectConfig, type ClientChannel } from 'ssh2';
import type { BrowserWindow } from 'electron';
import type { ConnectionStatus, HostRecord, ServerEvent } from '../shared';
import { RpcClient } from './rpc-client';

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function normalizeFingerprint(value: string): string {
  return value.trim().replace(/^SHA256:/i, '').replace(/=+$/, '');
}

function fingerprintForKey(key: Buffer): string {
  return createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
}

export class ConnectionManager {
  private ssh?: Client;
  private channel?: ClientChannel;
  private rpc?: RpcClient;
  private status: ConnectionStatus = { state: 'disconnected' };

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly confirmUnknownHostKey: (host: HostRecord, fingerprint: string) => Promise<boolean>,
  ) {}

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.getWindow()?.webContents.send('connection:status', status);
  }

  async connect(host: HostRecord): Promise<ConnectionStatus> {
    await this.disconnect();
    this.setStatus({ state: 'connecting', hostId: host.id, message: `Connecting to ${host.name}…` });

    let hostKeyFailure = '';
    const config: ConnectConfig = {
      host: host.host,
      port: host.port,
      username: host.username,
      readyTimeout: 20_000,
      keepaliveInterval: 10_000,
      keepaliveCountMax: 3,
      tryKeyboard: host.authMethod === 'password',
      hostVerifier: (key: Buffer, verify: (accepted: boolean) => void) => {
        const fingerprint = fingerprintForKey(key);
        if (host.expectedFingerprint) {
          const accepted = fingerprint === normalizeFingerprint(host.expectedFingerprint);
          if (!accepted) hostKeyFailure = `SSH host key mismatch for ${host.host}. Expected SHA256:${normalizeFingerprint(host.expectedFingerprint)}, received SHA256:${fingerprint}.`;
          verify(accepted);
          return;
        }

        void this.confirmUnknownHostKey(host, `SHA256:${fingerprint}`)
          .then((accepted) => {
            if (!accepted) hostKeyFailure = 'SSH host key was not trusted.';
            verify(accepted);
          })
          .catch((error: any) => {
            hostKeyFailure = error?.message ?? 'Could not verify the SSH host key.';
            verify(false);
          });
      },
    };

    if (host.authMethod === 'privateKey') {
      config.privateKey = await fs.readFile(host.privateKeyPath!);
      if (host.passphrase) config.passphrase = host.passphrase;
    } else if (host.authMethod === 'password') {
      config.password = host.password;
    } else if (host.authMethod === 'agent') {
      if (!process.env.SSH_AUTH_SOCK) throw new Error('SSH_AUTH_SOCK is not available. Start an SSH agent first.');
      config.agent = process.env.SSH_AUTH_SOCK;
    }

    const client = new Client();
    this.ssh = client;

    client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
      finish(prompts.map(() => host.password ?? ''));
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const fail = (error: Error) => reject(error);
        client.once('ready', () => resolve());
        client.once('error', fail);
        client.connect(config);
      });

      const appServerCommand = `exec ${host.codexCommand || 'codex'} app-server --listen stdio://`;
      const remoteCommand = `bash -lc ${quoteForShell(appServerCommand)}`;
      const channel = await new Promise<ClientChannel>((resolve, reject) => {
        client.exec(remoteCommand, { pty: false }, (error, stream) => {
          if (error) reject(error);
          else resolve(stream);
        });
      });
      this.channel = channel;

      channel.stderr.setEncoding('utf8');
      channel.stderr.on('data', (chunk: string) => {
        const text = chunk.trim();
        if (text) this.getWindow()?.webContents.send('codex:event', { method: 'bridge/diagnostic', params: { text } });
      });

      const rpc = new RpcClient(channel);
      this.rpc = rpc;
      rpc.on('event', (event: ServerEvent) => this.getWindow()?.webContents.send('codex:event', event));
      rpc.on('diagnostic', (text: string) =>
        this.getWindow()?.webContents.send('codex:event', { method: 'bridge/diagnostic', params: { text } }),
      );
      rpc.on('closed', (error: Error) => {
        if (this.status.state !== 'disconnected' && this.status.state !== 'error') {
          this.setStatus({ state: 'error', hostId: host.id, message: error.message });
        }
      });

      const initialized = await rpc.initialize();
      const platform = initialized?.platformOs || initialized?.platformFamily || 'remote';
      const details = [
        initialized?.codexHome ? `Codex home: ${initialized.codexHome}` : '',
        initialized?.userAgent ? `User agent: ${initialized.userAgent}` : '',
        `Platform: ${platform}`,
      ].filter(Boolean).join(' · ');
      this.getWindow()?.webContents.send('codex:event', {
        method: 'bridge/diagnostic',
        params: { text: `App Server initialized. ${details}` },
      });
      this.setStatus({ state: 'connected', hostId: host.id, message: `Connected to ${host.name}`, platform });
      return this.status;
    } catch (error: any) {
      this.rpc?.close(error instanceof Error ? error : new Error(String(error)));
      this.rpc = undefined;
      try { this.channel?.end(); } catch {}
      this.channel = undefined;
      try { this.ssh?.end(); } catch {}
      this.ssh = undefined;
      const message = hostKeyFailure || error?.message || String(error);
      this.setStatus({ state: 'error', hostId: host.id, message });
      throw error;
    }
  }

  async request<T = any>(method: string, params?: unknown): Promise<T> {
    if (!this.rpc || this.status.state !== 'connected') throw new Error('Connect to a VPS first.');
    return this.rpc.request<T>(method, params, method === 'account/login/start' ? 120_000 : 60_000);
  }

  respond(requestId: number, result?: unknown, error?: { code: number; message: string; data?: unknown }): void {
    if (!this.rpc) throw new Error('Codex is not connected.');
    this.rpc.respond(requestId, result, error);
  }

  async disconnect(): Promise<void> {
    this.rpc?.close(new Error('Disconnected by user.'));
    this.rpc = undefined;
    try {
      this.channel?.end();
    } catch {}
    this.channel = undefined;
    try {
      this.ssh?.end();
    } catch {}
    this.ssh = undefined;
    this.setStatus({ state: 'disconnected' });
  }
}
