export type AuthMethod = 'privateKey' | 'password' | 'agent';

export interface HostRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  privateKeyPath?: string;
  password?: string;
  passphrase?: string;
  codexCommand: string;
  expectedFingerprint?: string;
  defaultCwd?: string;
  createdAt: number;
  updatedAt: number;
}

export type StoredHostRecord = Omit<HostRecord, 'password' | 'passphrase'> & {
  encryptedPassword?: string;
  encryptedPassphrase?: string;
};

export interface PublicHostRecord extends Omit<HostRecord, 'password' | 'passphrase'> {
  hasPassword: boolean;
  hasPassphrase: boolean;
}

export interface ConnectionStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  hostId?: string;
  message?: string;
  platform?: string;
}

export interface JsonRpcRequest {
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export interface ServerEvent {
  method: string;
  params?: any;
  requestId?: number;
}

export interface CodexHarborApi {
  hosts: {
    list(): Promise<PublicHostRecord[]>;
    save(host: Partial<HostRecord> & Pick<HostRecord, 'name' | 'host' | 'username' | 'authMethod'>): Promise<PublicHostRecord>;
    remove(id: string): Promise<void>;
    pickPrivateKey(): Promise<string | null>;
  };
  connection: {
    connect(hostId: string): Promise<ConnectionStatus>;
    disconnect(): Promise<void>;
    status(): Promise<ConnectionStatus>;
    onStatus(listener: (status: ConnectionStatus) => void): () => void;
  };
  codex: {
    request<T = any>(method: string, params?: unknown): Promise<T>;
    respond(requestId: number, result?: unknown, error?: { code: number; message: string; data?: unknown }): Promise<void>;
    onEvent(listener: (event: ServerEvent) => void): () => void;
  };
  system: {
    openExternal(url: string): Promise<void>;
    platform(): Promise<string>;
  };
}
