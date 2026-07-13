import { EventEmitter } from 'node:events';
import type { ClientChannel } from 'ssh2';
import type { JsonRpcMessage, JsonRpcResponse, ServerEvent } from '../shared';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: NodeJS.Timeout;
}

export class RpcClient extends EventEmitter {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private buffer = '';
  private closed = false;

  constructor(private readonly stream: ClientChannel) {
    super();
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => this.onData(chunk));
    stream.on('close', () => this.close(new Error('Remote Codex App Server closed the connection.')));
    stream.on('error', (error: Error) => this.close(error));
  }

  async initialize(): Promise<any> {
    const result = await this.request('initialize', {
      clientInfo: {
        name: 'codexharbor',
        title: 'CodexHarbor',
        version: '0.1.0',
      },
      capabilities: { mcpServerOpenaiFormElicitation: true },
    });
    this.notify('initialized', {});
    return result;
  }

  request<T = any>(method: string, params?: unknown, timeoutMs = 60_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Codex connection is closed.'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return;
    this.write({ method, params });
  }

  respond(id: number, result?: unknown, error?: JsonRpcResponse['error']): void {
    if (this.closed) return;
    this.write(error ? { id, error } : { id, result: result ?? {} });
  }

  private write(message: JsonRpcMessage): void {
    this.stream.write(`${JSON.stringify(message)}\n`);
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.handleLine(line);
      newline = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit('diagnostic', `Ignored non-JSON app-server output: ${line}`);
      return;
    }

    if (typeof message.id === 'number' && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        const error = new Error(message.error.message || 'Codex request failed.');
        Object.assign(error, { code: message.error.code, data: message.error.data });
        pending.reject(error);
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      const event: ServerEvent = {
        method: message.method,
        params: message.params,
        requestId: typeof message.id === 'number' ? message.id : undefined,
      };
      this.emit('event', event);
    }
  }

  close(reason = new Error('Codex connection closed.')): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.pending.clear();
    this.emit('closed', reason);
  }
}
