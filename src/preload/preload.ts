import { contextBridge, ipcRenderer } from 'electron';
import type { CodexHarborApi, ConnectionStatus, HostRecord, ServerEvent } from '../shared';

const api: CodexHarborApi = {
  hosts: {
    list: () => ipcRenderer.invoke('hosts:list'),
    save: (host: Partial<HostRecord> & Pick<HostRecord, 'name' | 'host' | 'username' | 'authMethod'>) => ipcRenderer.invoke('hosts:save', host),
    remove: (id: string) => ipcRenderer.invoke('hosts:remove', id),
    pickPrivateKey: () => ipcRenderer.invoke('hosts:pickPrivateKey'),
  },
  connection: {
    connect: (hostId: string) => ipcRenderer.invoke('connection:connect', hostId),
    disconnect: () => ipcRenderer.invoke('connection:disconnect'),
    status: () => ipcRenderer.invoke('connection:status'),
    onStatus: (listener: (status: ConnectionStatus) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: ConnectionStatus) => listener(status);
      ipcRenderer.on('connection:status', handler);
      return () => ipcRenderer.removeListener('connection:status', handler);
    },
  },
  codex: {
    request: (method: string, params?: unknown) => ipcRenderer.invoke('codex:request', method, params),
    respond: (requestId: number, result?: unknown, error?: { code: number; message: string; data?: unknown }) =>
      ipcRenderer.invoke('codex:respond', requestId, result, error),
    onEvent: (listener: (event: ServerEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, event: ServerEvent) => listener(event);
      ipcRenderer.on('codex:event', handler);
      return () => ipcRenderer.removeListener('codex:event', handler);
    },
  },
  system: {
    openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
    platform: () => ipcRenderer.invoke('system:platform'),
  },
};

contextBridge.exposeInMainWorld('codexBridge', api);
