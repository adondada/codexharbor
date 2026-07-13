import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HostRecord, PublicHostRecord, StoredHostRecord } from '../shared';

function assertSecureStorage(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure OS credential storage is unavailable on this system.');
  }
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error('Linux secret storage is using the insecure basic_text backend. Configure a desktop keyring or use an SSH agent/unprotected key.');
  }
}

function encrypt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  assertSecureStorage();
  return safeStorage.encryptString(value).toString('base64');
}

function decrypt(value: string | undefined): string | undefined {
  if (!value) return undefined;
  assertSecureStorage();
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

function toPublic(host: StoredHostRecord): PublicHostRecord {
  const { encryptedPassword, encryptedPassphrase, ...safe } = host;
  return {
    ...safe,
    hasPassword: Boolean(encryptedPassword),
    hasPassphrase: Boolean(encryptedPassphrase),
  };
}

export class HostStore {
  private readonly filePath = path.join(app.getPath('userData'), 'hosts.json');

  private async readAll(): Promise<StoredHostRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') return [];
      throw new Error(`Could not read saved hosts: ${error?.message ?? String(error)}`);
    }
  }

  private async writeAll(hosts: StoredHostRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(hosts, null, 2), { mode: 0o600 });
    await fs.rename(temporary, this.filePath);
  }

  async list(): Promise<PublicHostRecord[]> {
    const hosts = await this.readAll();
    return hosts.map(toPublic).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<HostRecord> {
    const hosts = await this.readAll();
    const host = hosts.find((entry) => entry.id === id);
    if (!host) throw new Error('Saved host not found.');

    const { encryptedPassword, encryptedPassphrase, ...safe } = host;
    return {
      ...safe,
      password: decrypt(encryptedPassword),
      passphrase: decrypt(encryptedPassphrase),
    };
  }

  async save(input: Partial<HostRecord> & Pick<HostRecord, 'name' | 'host' | 'username' | 'authMethod'>): Promise<PublicHostRecord> {
    const hosts = await this.readAll();
    const now = Date.now();
    const existingIndex = input.id ? hosts.findIndex((entry) => entry.id === input.id) : -1;
    const existing = existingIndex >= 0 ? hosts[existingIndex] : undefined;

    const name = input.name.trim();
    const hostname = input.host.trim();
    const username = input.username.trim();
    if (!name || !hostname || !username) throw new Error('Name, host, and username are required.');

    const codexCommand =
      input.codexCommand !== undefined
        ? input.codexCommand.trim() || 'codex'
        : existing?.codexCommand || 'codex';
    if (!/^(?:~\/|\/)?[A-Za-z0-9_./-]+$/.test(codexCommand)) {
      throw new Error('Codex command must be a single executable name or path, without shell arguments.');
    }

    const sameAuthMethod = existing?.authMethod === input.authMethod;
    const record: StoredHostRecord = {
      id: existing?.id ?? input.id ?? randomUUID(),
      name,
      host: hostname,
      port: Number(input.port ?? existing?.port ?? 22),
      username,
      authMethod: input.authMethod,
      privateKeyPath:
        input.authMethod === 'privateKey'
          ? input.privateKeyPath?.trim() || (sameAuthMethod ? existing?.privateKeyPath : undefined)
          : undefined,
      codexCommand,
      expectedFingerprint:
        input.expectedFingerprint !== undefined
          ? input.expectedFingerprint.trim() || undefined
          : existing?.expectedFingerprint,
      defaultCwd:
        input.defaultCwd !== undefined
          ? input.defaultCwd.trim() || undefined
          : existing?.defaultCwd,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      encryptedPassword:
        input.authMethod === 'password'
          ? input.password
            ? encrypt(input.password)
            : sameAuthMethod
              ? existing?.encryptedPassword
              : undefined
          : undefined,
      encryptedPassphrase:
        input.authMethod === 'privateKey'
          ? input.passphrase
            ? encrypt(input.passphrase)
            : sameAuthMethod
              ? existing?.encryptedPassphrase
              : undefined
          : undefined,
    };

    if (!Number.isInteger(record.port) || record.port < 1 || record.port > 65535) {
      throw new Error('SSH port must be between 1 and 65535.');
    }
    if (record.authMethod === 'privateKey' && !record.privateKeyPath) {
      throw new Error('Choose a private key file.');
    }
    if (record.authMethod === 'password' && !record.encryptedPassword) {
      throw new Error('Enter the SSH password.');
    }

    if (existingIndex >= 0) hosts[existingIndex] = record;
    else hosts.push(record);
    await this.writeAll(hosts);
    return toPublic(record);
  }

  async remove(id: string): Promise<void> {
    const hosts = await this.readAll();
    await this.writeAll(hosts.filter((entry) => entry.id !== id));
  }
}
