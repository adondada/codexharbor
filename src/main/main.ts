import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HostStore } from './host-store';
import { ConnectionManager } from './connection-manager';
import type { HostRecord } from '../shared';

let mainWindow: BrowserWindow | null = null;
let hostStore: HostStore;
let connection: ConnectionManager;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#080a0d',
    icon: path.join(app.getAppPath(), 'assets/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const productionEntry = pathToFileURL(path.join(__dirname, '../../dist/index.html')).toString();

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith(productionEntry);
    if (!allowed) event.preventDefault();
  });

  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('hosts:list', () => hostStore.list());
  ipcMain.handle('hosts:save', (_event, host: Partial<HostRecord> & Pick<HostRecord, 'name' | 'host' | 'username' | 'authMethod'>) => hostStore.save(host));
  ipcMain.handle('hosts:remove', async (_event, id: string) => {
    if (connection.getStatus().hostId === id) await connection.disconnect();
    await hostStore.remove(id);
  });
  ipcMain.handle('hosts:pickPrivateKey', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose an SSH private key',
      properties: ['openFile'],
      filters: [
        { name: 'SSH private keys', extensions: ['pem', 'key'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('connection:connect', async (_event, hostId: string) => connection.connect(await hostStore.get(hostId)));
  ipcMain.handle('connection:disconnect', () => connection.disconnect());
  ipcMain.handle('connection:status', () => connection.getStatus());

  ipcMain.handle('codex:request', (_event, method: string, params?: unknown) => connection.request(method, params));
  ipcMain.handle('codex:respond', (_event, requestId: number, result?: unknown, error?: { code: number; message: string; data?: unknown }) =>
    connection.respond(requestId, result, error),
  );

  ipcMain.handle('system:openExternal', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only HTTP(S) links can be opened.');
    await shell.openExternal(url);
  });
  ipcMain.handle('system:platform', () => process.platform);
}

app.whenReady().then(() => {
  hostStore = new HostStore();
  connection = new ConnectionManager(
    () => mainWindow,
    async (host, fingerprint) => {
      const result = await dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        title: 'Verify SSH host key',
        message: `CodexHarbor has not seen ${host.host}:${host.port} before.`,
        detail: `Server fingerprint:\n${fingerprint}\n\nVerify this fingerprint through your VPS provider or another trusted connection before accepting it.`,
        buttons: ['Cancel', 'Trust once', 'Trust and save'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });

      if (result.response === 2) {
        await hostStore.save({ ...host, expectedFingerprint: fingerprint });
      }
      return result.response === 1 || result.response === 2;
    },
  );
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  void connection?.disconnect();
  if (process.platform !== 'darwin') app.quit();
});
