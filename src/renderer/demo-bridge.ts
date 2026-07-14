import type { CodexHarborApi, ConnectionStatus, PublicHostRecord, ServerEvent } from '../shared';

const now = Math.floor(Date.now() / 1000);
const demoHost: PublicHostRecord = {
  id: 'demo-host',
  name: 'Athens build VPS',
  host: '100.88.24.17',
  port: 22,
  username: 'dev',
  authMethod: 'privateKey',
  privateKeyPath: 'C:\\Users\\dev\\.ssh\\id_ed25519',
  codexCommand: 'codex',
  expectedFingerprint: 'SHA256:demo',
  defaultCwd: '/srv/codexharbor',
  createdAt: Date.now() - 8_000_000,
  updatedAt: Date.now(),
  hasPassword: false,
  hasPassphrase: true,
};

const demoThread = {
  id: 'thr_demo_release',
  sessionId: 'thr_demo_release',
  name: 'Prepare v0.1.0 release',
  preview: 'Audit the Electron app, run checks, and prepare the first release.',
  cwd: '/srv/codexharbor',
  createdAt: now - 5_400,
  updatedAt: now - 130,
  recencyAt: now - 130,
  status: { type: 'idle' },
  turns: [
    {
      id: 'turn_demo_1',
      status: 'completed',
      items: [
        {
          id: 'user_demo_1',
          type: 'userMessage',
          content: [{ type: 'text', text: 'Audit the app, run the production build, and prepare the first GitHub release.' }],
          status: 'completed',
        },
        {
          id: 'reason_demo_1',
          type: 'reasoning',
          summary: 'I will verify the security boundaries, build both Electron processes, and inspect the release workflow before changing anything.',
          status: 'completed',
        },
        {
          id: 'cmd_demo_1',
          type: 'commandExecution',
          command: ['npm', 'run', 'check'],
          cwd: '/srv/codexharbor',
          aggregatedOutput: 'TypeScript: passed\nVite renderer: passed\nElectron main/preload: passed\n0 vulnerabilities',
          exitCode: 0,
          durationMs: 2841,
          status: 'completed',
        },
        {
          id: 'files_demo_1',
          type: 'fileChange',
          changes: [
            { path: '.github/workflows/release.yml', kind: 'update' },
            { path: 'README.md', kind: 'update' },
            { path: 'src/main/connection-manager.ts', kind: 'update' },
          ],
          status: 'completed',
        },
        {
          id: 'agent_demo_1',
          type: 'agentMessage',
          text: 'Release checks are clean. I tightened SSH host-key verification, validated the Windows packaging workflow, and updated the publishing guide. The repository is ready for a v0.1.0 tag.',
          status: 'completed',
        },
      ],
    },
  ],
};



const legacyDemoThread = {
  id: 'thr_demo_legacy',
  sessionId: 'thr_demo_legacy',
  name: { type: 'Legacy thread title' },
  preview: { type: 'Historical Codex thread using structured fields' },
  cwd: '/srv/legacy-demo',
  createdAt: now - 90_000,
  updatedAt: now - 60,
  recencyAt: now - 60,
  status: { type: 'idle' },
  turns: [
    {
      id: 'turn_legacy_1',
      status: { type: 'completed' },
      items: [
        {
          id: 'legacy_user',
          type: 'userMessage',
          content: [{ type: 'inputText', text: { type: 'Inspect the historical project format.' } }],
          status: { type: 'completed' },
        },
        {
          id: 'legacy_agent',
          type: 'agentMessage',
          text: { type: 'This old thread now renders without crashing the application.' },
          status: { type: 'completed' },
        },
        {
          id: 'legacy_command',
          type: 'commandExecution',
          command: [{ type: 'npm' }, { type: 'test' }],
          cwd: { type: '/srv/legacy-demo' },
          aggregatedOutput: { type: 'Legacy command output' },
          status: { type: 'completed' },
          exitCode: 0,
        },
      ],
    },
  ],
};

const demoThreads = [
  demoThread,
  {
    id: 'thr_demo_tests',
    name: 'Fix flaky integration tests',
    preview: 'Trace intermittent SSH disconnects and stabilize the suite.',
    cwd: '/srv/codexharbor',
    createdAt: now - 20_000,
    updatedAt: now - 7_200,
    recencyAt: now - 7_200,
    status: { type: 'idle' },
  },
  {
    id: 'thr_demo_review',
    name: 'Review host-key flow',
    preview: 'Check first-connect trust and fingerprint mismatch handling.',
    cwd: '/srv/codexharbor',
    createdAt: now - 80_000,
    updatedAt: now - 31_000,
    recencyAt: now - 31_000,
    status: { type: 'idle' },
  },
];

export function installDemoBridge(): void {
  const search = new URLSearchParams(window.location.search);
  if (!search.has('demo') || window.codexBridge) return;

  const legacyMode = search.get('demo') === 'legacy';
  const visibleThreads = legacyMode ? [legacyDemoThread, ...demoThreads] : demoThreads;
  (window as any).__CODEXHARBOR_DEMO__ = true;
  let status: ConnectionStatus = { state: 'connected', hostId: demoHost.id, message: 'Connected to demo host', platform: 'linux' };
  const statusListeners = new Set<(value: ConnectionStatus) => void>();
  const eventListeners = new Set<(value: ServerEvent) => void>();

  const api: CodexHarborApi = {
    hosts: {
      list: async () => [demoHost],
      save: async () => demoHost,
      remove: async () => undefined,
      pickPrivateKey: async () => null,
    },
    connection: {
      connect: async () => status,
      disconnect: async () => {
        status = { state: 'disconnected' };
        statusListeners.forEach((listener) => listener(status));
      },
      status: async () => status,
      onStatus: (listener) => {
        statusListeners.add(listener);
        return () => statusListeners.delete(listener);
      },
    },
    codex: {
      request: async <T,>(method: string, params?: any): Promise<T> => {
        if (method === 'model/list') {
          return { data: [{ id: 'gpt-5.4', model: 'gpt-5.4', displayName: 'GPT-5.4', defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'high' }, { reasoningEffort: 'xhigh' }], isDefault: true }] } as T;
        }
        if (method === 'account/read') return { account: { type: 'chatgpt', email: 'dev@example.com', planType: 'pro' }, requiresOpenaiAuth: false } as T;
        if (method === 'account/rateLimits/read') return { rateLimits: { primary: { usedPercent: 18, windowDurationMins: 300, resetsAt: now + 9200 } } } as T;
        if (method === 'thread/list') return { data: visibleThreads } as T;
        if (method === 'thread/read' || method === 'thread/resume') {
          const match = visibleThreads.find((thread) => thread.id === params?.threadId) ?? visibleThreads[0];
          return { thread: match } as T;
        }
        if (method === 'thread/start') return { thread: { ...demoThread, id: 'thr_new', name: null, turns: [] } } as T;
        if (method === 'turn/start') return { turn: { id: 'turn_new', status: 'inProgress', items: [] } } as T;
        return {} as T;
      },
      respond: async () => undefined,
      onEvent: (listener) => {
        eventListeners.add(listener);
        return () => eventListeners.delete(listener);
      },
    },
    system: {
      openExternal: async () => undefined,
      platform: async () => 'win32',
    },
  };

  Object.defineProperty(window, 'codexBridge', { value: api, configurable: true });
}
