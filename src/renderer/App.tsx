import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Blocks,
  Bot,
  ChevronDown,
  CirclePlus,
  CloudCog,
  ExternalLink,
  FolderGit2,
  Gauge,
  GitFork,
  KeyRound,
  LogOut,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Play,
  PlugZap,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { ConnectionStatus, PublicHostRecord, ServerEvent } from '../shared';
import { HostDialog } from './components/HostDialog';
import { ApprovalCard } from './components/ApprovalCard';
import { CodexItemView } from './components/CodexItemView';
import {
  type AccountInfo,
  type CodexItem,
  type ModelInfo,
  type PendingRequest,
  type ThreadSummary,
  flattenTurns,
  formatRelativeTime,
  statusLabel,
} from './lib/codex';

const sourceKinds = [
  'cli',
  'vscode',
  'exec',
  'appServer',
  'subAgent',
  'subAgentReview',
  'subAgentCompact',
  'subAgentThreadSpawn',
  'subAgentOther',
  'unknown',
];

type Toast = { id: number; kind: 'error' | 'info'; text: string };

function upsertItem(items: CodexItem[], next: CodexItem): CodexItem[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) return [...items, next];
  const copy = [...items];
  copy[index] = { ...items[index], ...next, streamedOutput: next.streamedOutput ?? items[index].streamedOutput };
  return copy;
}

function appendItemDelta(items: CodexItem[], itemId: string, type: string, field: 'text' | 'streamedOutput' | 'summary', delta: string): CodexItem[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return [...items, { id: itemId, type, [field]: delta, status: 'inProgress' }];
  const copy = [...items];
  const item = copy[index];
  if (field === 'summary') {
    const previous = typeof item.summary === 'string' ? item.summary : '';
    copy[index] = { ...item, summary: previous + delta };
  } else {
    copy[index] = { ...item, [field]: String(item[field] ?? '') + delta };
  }
  return copy;
}

export default function App() {
  const [hosts, setHosts] = useState<PublicHostRecord[]>([]);
  const [selectedHostId, setSelectedHostId] = useState<string>('');
  const [hostDialogOpen, setHostDialogOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<PublicHostRecord | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>({ state: 'disconnected' });
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadSearch, setThreadSearch] = useState('');
  const [activeThread, setActiveThread] = useState<ThreadSummary | null>(null);
  const [items, setItems] = useState<CodexItem[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [effort, setEffort] = useState('medium');
  const [approvalPolicy, setApprovalPolicy] = useState('onRequest');
  const [sandboxMode, setSandboxMode] = useState('workspaceWrite');
  const [cwd, setCwd] = useState('');
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string>('');
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [deviceLogin, setDeviceLogin] = useState<{ verificationUrl: string; userCode: string } | null>(null);
  const [usage, setUsage] = useState<any>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState('');

  const activeThreadIdRef = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const toastCounter = useRef(1);

  const selectedHost = useMemo(() => hosts.find((host) => host.id === selectedHostId) ?? null, [hosts, selectedHostId]);
  const filteredThreads = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter((thread) => `${thread.name ?? ''} ${thread.preview ?? ''} ${thread.cwd ?? ''}`.toLowerCase().includes(query));
  }, [threads, threadSearch]);
  const selectedModelInfo = useMemo(() => models.find((model) => model.id === selectedModel || model.model === selectedModel), [models, selectedModel]);
  const supportedEfforts = selectedModelInfo?.supportedReasoningEfforts?.map((entry) => entry.reasoningEffort) ?? ['low', 'medium', 'high', 'xhigh'];

  const notify = useCallback((text: string, kind: Toast['kind'] = 'error') => {
    const id = toastCounter.current++;
    setToasts((current) => [...current, { id, kind, text }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5500);
  }, []);

  const refreshHosts = useCallback(async () => {
    const next = await window.codexBridge.hosts.list();
    setHosts(next);
    setSelectedHostId((current) => current || next[0]?.id || '');
  }, []);

  const refreshThreads = useCallback(async (): Promise<ThreadSummary[]> => {
    if (connection.state !== 'connected') return [];

    const requestHistory = (kinds: string[]) => window.codexBridge.codex.request<{ data: ThreadSummary[] }>('thread/list', {
      limit: 100,
      sortKey: 'recency_at',
      sortDirection: 'desc',
      modelProviders: [],
      sourceKinds: kinds,
      archived: false,
      useStateDbOnly: false,
    });

    try {
      let result: { data: ThreadSummary[] };
      try {
        result = await requestHistory(sourceKinds);
      } catch (modernError: any) {
        setDiagnostics((current) => [...current.slice(-79), `Full source list rejected; retrying compatibility mode: ${modernError?.message ?? String(modernError)}`]);
        result = await requestHistory(['cli', 'vscode', 'exec', 'appServer']);
      }
      const nextThreads = result.data ?? [];
      setThreads(nextThreads);
      setDiagnostics((current) => [...current.slice(-79), `Thread history: ${nextThreads.length} thread(s) returned.`]);
      setBootstrapError('');
      return nextThreads;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      setBootstrapError(`Thread history failed: ${message}`);
      setDiagnostics((current) => [...current.slice(-79), `Thread history failed: ${message}`]);
      notify(message);
      return [];
    }
  }, [connection.state, notify]);

  const loadAccount = useCallback(async () => {
    try {
      const result = await window.codexBridge.codex.request<{ account: AccountInfo | null; requiresOpenaiAuth: boolean }>('account/read', { refreshToken: false });
      setAccount(result.account);
      setRequiresAuth(Boolean(result.requiresOpenaiAuth && !result.account));
    } catch (error: any) {
      setDiagnostics((current) => [...current.slice(-39), `Account check: ${error?.message ?? String(error)}`]);
    }
  }, []);

  const loadBootstrap = useCallback(async () => {
    setBootstrapLoading(true);
    setBootstrapError('');

    const threadPromise = refreshThreads();
    const accountPromise = loadAccount();
    const modelPromise = window.codexBridge.codex
      .request<{ data: ModelInfo[] }>('model/list', { limit: 100, includeHidden: false })
      .then((modelResult) => {
        const nextModels = modelResult.data ?? [];
        setModels(nextModels);
        const preferred = nextModels.find((model) => model.isDefault) ?? nextModels[0];
        if (preferred) {
          setSelectedModel(preferred.id ?? preferred.model ?? '');
          setEffort(preferred.defaultReasoningEffort ?? 'medium');
        }
        setDiagnostics((current) => [...current.slice(-79), `Models: ${nextModels.length} available.`]);
      })
      .catch((error: any) => {
        const message = error?.message ?? String(error);
        setModels([]);
        setSelectedModel('');
        setDiagnostics((current) => [...current.slice(-79), `Model list failed; server defaults remain usable: ${message}`]);
      });

    const usagePromise = window.codexBridge.codex
      .request('account/rateLimits/read', {})
      .then(setUsage)
      .catch((error: any) => {
        setUsage(null);
        setDiagnostics((current) => [...current.slice(-79), `Rate limits unavailable: ${error?.message ?? String(error)}`]);
      });

    const [nextThreads] = await Promise.all([threadPromise, accountPromise, modelPromise, usagePromise]);
    setCwd((current) => current || nextThreads[0]?.cwd || '');
    setBootstrapLoading(false);
  }, [loadAccount, refreshThreads]);

  useEffect(() => {
    void refreshHosts();
    void window.codexBridge.connection.status().then(setConnection);
    const offStatus = window.codexBridge.connection.onStatus((status) => setConnection(status));
    return offStatus;
  }, [refreshHosts]);

  useEffect(() => {
    if (connection.state !== 'connected') {
      setThreads([]);
      activeThreadIdRef.current = '';
      setActiveThread(null);
      setItems([]);
      setRunning(false);
      setPendingRequests([]);
      setAccount(null);
      setBootstrapLoading(false);
      setBootstrapError('');
      return;
    }
    const host = hosts.find((entry) => entry.id === connection.hostId);
    if (host) {
      setSelectedHostId(host.id);
      setCwd(host.defaultCwd ?? '');
    }
    void loadBootstrap().catch((error: any) => {
      const message = error?.message ?? String(error);
      setBootstrapLoading(false);
      setBootstrapError(message);
      setDiagnostics((current) => [...current.slice(-79), `Bootstrap failed: ${message}`]);
      notify(message);
    });
  }, [connection.state, connection.hostId, hosts, loadBootstrap, notify]);

  useEffect(() => {
    activeThreadIdRef.current = activeThread?.id ?? '';
  }, [activeThread]);

  useEffect(() => {
    const off = window.codexBridge.codex.onEvent((event: ServerEvent) => {
      const params: any = event.params ?? {};
      if (event.requestId !== undefined) {
        setPendingRequests((current) => [...current, { requestId: event.requestId!, method: event.method, params }]);
        return;
      }

      if (event.method === 'bridge/diagnostic') {
        setDiagnostics((current) => [...current.slice(-79), params.text ?? JSON.stringify(params)]);
        return;
      }
      if (event.method === 'serverRequest/resolved') {
        setPendingRequests((current) => current.filter((request) => request.requestId !== params.requestId));
        return;
      }
      if (event.method === 'account/updated' || event.method === 'account/login/completed') {
        if (event.method === 'account/login/completed') {
          if (params.success) setDeviceLogin(null);
          else if (params.error) notify(String(params.error));
        }
        void loadAccount();
        return;
      }
      if (event.method === 'account/rateLimits/updated') {
        setUsage(params);
        return;
      }
      if (event.method === 'thread/started' || event.method === 'thread/archived' || event.method === 'thread/unarchived') {
        void refreshThreads();
      }

      const eventThreadId = params.threadId ?? params.thread?.id;
      if (eventThreadId && eventThreadId !== activeThreadIdRef.current) return;

      if (event.method === 'thread/status/changed') {
        const state = typeof params.status === 'object' ? params.status?.type : params.status;
        setRunning(state === 'active');
        setActiveThread((current) => current ? { ...current, status: params.status } : current);
        return;
      }
      if (event.method === 'turn/started') {
        setRunning(true);
        setActiveTurnId(params.turn?.id ?? params.turnId ?? '');
        return;
      }
      if (event.method === 'turn/completed') {
        setRunning(false);
        setActiveTurnId('');
        void refreshThreads();
        return;
      }
      if (event.method === 'error') {
        notify(params.error?.message ?? params.message ?? 'Codex turn failed.');
        return;
      }
      if (event.method === 'item/started' || event.method === 'item/completed') {
        if (params.item) setItems((current) => upsertItem(current, { ...params.item, turnId: params.turnId }));
        return;
      }
      if (event.method === 'item/agentMessage/delta') {
        setItems((current) => appendItemDelta(current, params.itemId, 'agentMessage', 'text', params.delta ?? ''));
        return;
      }
      if (event.method === 'item/plan/delta') {
        setItems((current) => appendItemDelta(current, params.itemId, 'plan', 'text', params.delta ?? ''));
        return;
      }
      if (event.method === 'item/reasoning/summaryTextDelta') {
        setItems((current) => appendItemDelta(current, params.itemId, 'reasoning', 'summary', params.delta ?? ''));
        return;
      }
      if (event.method === 'item/reasoning/textDelta') {
        setItems((current) => appendItemDelta(current, params.itemId, 'reasoning', 'text', params.delta ?? ''));
        return;
      }
      if (event.method === 'item/commandExecution/outputDelta') {
        setItems((current) => appendItemDelta(current, params.itemId, 'commandExecution', 'streamedOutput', params.delta ?? ''));
      }
    });
    return off;
  }, [loadAccount, notify, refreshThreads]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [items, pendingRequests]);

  const connect = async () => {
    if (!selectedHostId) return;
    try {
      await window.codexBridge.connection.connect(selectedHostId);
    } catch (error: any) {
      notify(error?.message ?? String(error));
    }
  };

  const disconnect = async () => {
    await window.codexBridge.connection.disconnect();
  };

  const saveHost = async (host: PublicHostRecord) => {
    await refreshHosts();
    setSelectedHostId(host.id);
  };

  const deleteHost = async (host: PublicHostRecord) => {
    if (!window.confirm(`Delete “${host.name}”? Credentials stored for this host will also be removed.`)) return;
    await window.codexBridge.hosts.remove(host.id);
    await refreshHosts();
  };

  const openThread = async (thread: ThreadSummary) => {
    setLoadingThread(true);
    setPendingRequests([]);
    try {
      const read = await window.codexBridge.codex.request<{ thread: ThreadSummary }>('thread/read', { threadId: thread.id, includeTurns: true });
      const resumed = await window.codexBridge.codex.request<{ thread: ThreadSummary }>('thread/resume', { threadId: thread.id });
      const hydrated = { ...read.thread, ...resumed.thread, turns: resumed.thread.turns?.length ? resumed.thread.turns : read.thread.turns };
      activeThreadIdRef.current = hydrated.id;
      setActiveThread(hydrated);
      setItems(flattenTurns(hydrated));
      setCwd(hydrated.cwd ?? cwd);
      const state = typeof hydrated.status === 'object' ? hydrated.status?.type : hydrated.status;
      const activeTurn = [...(hydrated.turns ?? [])].reverse().find((turn) => turn.status === 'inProgress');
      setActiveTurnId(activeTurn?.id ?? '');
      setRunning(state === 'active');
    } catch (error: any) {
      notify(error?.message ?? String(error));
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    if (!(window as any).__CODEXHARBOR_DEMO__ || activeThread || loadingThread || threads.length === 0) return;
    void openThread(threads[0]);
  }, [activeThread, loadingThread, threads]);

  const startThread = async (): Promise<ThreadSummary | null> => {
    if (!cwd.trim()) {
      notify('Enter an absolute project directory on the VPS.');
      return null;
    }
    try {
      const result = await window.codexBridge.codex.request<{ thread: ThreadSummary }>('thread/start', {
        cwd: cwd.trim(),
        model: selectedModel || undefined,
        approvalPolicy,
        sandbox: sandboxMode,
        serviceName: 'codexharbor',
      });
      activeThreadIdRef.current = result.thread.id;
      setActiveThread(result.thread);
      setItems([]);
      setPendingRequests([]);
      await refreshThreads();
      return result.thread;
    } catch (error: any) {
      notify(error?.message ?? String(error));
      return null;
    }
  };

  const sendPrompt = async () => {
    const text = prompt.trim();
    if (!text) return;
    setPrompt('');

    if (running) {
      if (!activeThread || !activeTurnId) {
        setPrompt(text);
        notify('The active turn id is not available yet. Wait for the turn-start event or interrupt the task.');
        return;
      }
      try {
        await window.codexBridge.codex.request('turn/steer', {
          threadId: activeThread.id,
          expectedTurnId: activeTurnId,
          input: [{ type: 'text', text }],
        });
        notify('Steering instruction sent to the active turn.', 'info');
      } catch (error: any) {
        setPrompt(text);
        notify(error?.message ?? String(error));
      }
      return;
    }

    let thread = activeThread;
    if (!thread) thread = await startThread();
    if (!thread) {
      setPrompt(text);
      return;
    }
    try {
      const result = await window.codexBridge.codex.request<{ turn: { id: string } }>('turn/start', {
        threadId: thread.id,
        input: [{ type: 'text', text }],
        cwd: cwd.trim() || undefined,
        model: selectedModel || undefined,
        effort,
        approvalPolicy,
        sandboxPolicy:
          sandboxMode === 'workspaceWrite'
            ? { type: 'workspaceWrite', writableRoots: [cwd.trim()], networkAccess: true }
            : sandboxMode === 'readOnly'
              ? { type: 'readOnly' }
              : { type: 'dangerFullAccess' },
      });
      setRunning(true);
      setActiveTurnId(result.turn?.id ?? '');
    } catch (error: any) {
      setPrompt(text);
      notify(error?.message ?? String(error));
    }
  };

  const interrupt = async () => {
    if (!activeThread || !activeTurnId) return;
    try {
      await window.codexBridge.codex.request('turn/interrupt', { threadId: activeThread.id, turnId: activeTurnId });
    } catch (error: any) {
      notify(error?.message ?? String(error));
    }
  };

  const archiveThread = async () => {
    if (!activeThread) return;
    try {
      await window.codexBridge.codex.request('thread/archive', { threadId: activeThread.id });
      activeThreadIdRef.current = '';
      setActiveThread(null);
      setItems([]);
      await refreshThreads();
    } catch (error: any) {
      notify(error?.message ?? String(error));
    }
  };

  const beginDeviceLogin = async () => {
    try {
      const result = await window.codexBridge.codex.request<{ verificationUrl: string; userCode: string }>('account/login/start', { type: 'chatgptDeviceCode' });
      setDeviceLogin(result);
      await window.codexBridge.system.openExternal(result.verificationUrl);
    } catch (error: any) {
      notify(error?.message ?? String(error));
    }
  };

  const resolveRequest = async (requestId: number, result: unknown) => {
    await window.codexBridge.codex.respond(requestId, result);
    setPendingRequests((current) => current.filter((request) => request.requestId !== requestId));
  };

  const rejectRequest = async (requestId: number, message = 'Request rejected by CodexHarbor') => {
    await window.codexBridge.codex.respond(requestId, undefined, { code: -32601, message });
    setPendingRequests((current) => current.filter((request) => request.requestId !== requestId));
  };

  const onComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void sendPrompt();
    }
  };

  if (connection.state !== 'connected') {
    return (
      <div className="connect-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <header className="brand-header">
          <div className="brand-mark"><Blocks size={20} /></div>
          <div><strong>CodexHarbor</strong><span>Unofficial remote client</span></div>
          <a className="github-link" href="#" onClick={(event) => { event.preventDefault(); void window.codexBridge.system.openExternal('https://github.com/adondada/codexharbor'); }}><GitFork size={17} /> GitHub</a>
        </header>

        <main className="connect-main">
          <section className="connect-copy">
            <div className="eyebrow"><span className="live-dot" /> SSH-NATIVE · LOCAL-FIRST</div>
            <h1>Your Codex VPS,<br /><span>finally manageable.</span></h1>
            <p>Run the official Codex App Server on your remote machine and control threads, approvals, commands, and changes from a proper Windows desktop client.</p>
            <div className="feature-row">
              <span><ShieldCheck size={16} /> No public daemon</span>
              <span><MessageSquareText size={16} /> Native thread history</span>
              <span><PlugZap size={16} /> Live approvals</span>
            </div>
          </section>

          <section className="connection-card">
            <div className="connection-card-top">
              <div><span className="eyebrow">REMOTE HOST</span><h2>Connect to your workspace</h2></div>
              <button className="icon-button" onClick={() => { setEditingHost(null); setHostDialogOpen(true); }} title="Add host"><CirclePlus size={19} /></button>
            </div>

            {hosts.length === 0 ? (
              <button className="empty-host" onClick={() => { setEditingHost(null); setHostDialogOpen(true); }}>
                <div className="empty-host-icon"><Server size={24} /></div>
                <strong>Add your first VPS</strong>
                <span>SSH key, password, or local agent</span>
              </button>
            ) : (
              <div className="host-list">
                {hosts.map((host) => (
                  <div key={host.id} className={`host-option ${selectedHostId === host.id ? 'selected' : ''}`} onClick={() => setSelectedHostId(host.id)}>
                    <div className="server-icon"><Server size={18} /></div>
                    <div className="host-copy"><strong>{host.name}</strong><span>{host.username}@{host.host}:{host.port}</span></div>
                    <div className="host-tools">
                      <button className="mini-icon" onClick={(event) => { event.stopPropagation(); setEditingHost(host); setHostDialogOpen(true); }}><Pencil size={14} /></button>
                      <button className="mini-icon danger" onClick={(event) => { event.stopPropagation(); void deleteHost(host); }}><Trash2 size={14} /></button>
                    </div>
                    {selectedHostId === host.id && <div className="selected-check"><ShieldCheck size={15} /></div>}
                  </div>
                ))}
              </div>
            )}

            {connection.state === 'error' && <div className="error-banner">{connection.message}</div>}
            <button className="connect-button" disabled={!selectedHostId || connection.state === 'connecting'} onClick={connect}>
              {connection.state === 'connecting' ? <RefreshCw size={17} className="spin" /> : <Wifi size={17} />}
              {connection.state === 'connecting' ? connection.message ?? 'Connecting…' : 'Connect securely'}
            </button>
            <p className="connection-footnote"><KeyRound size={13} /> Secrets are encrypted using your operating system’s secure storage.</p>
          </section>
        </main>

        <HostDialog open={hostDialogOpen} host={editingHost} onClose={() => setHostDialogOpen(false)} onSaved={saveHost} />
        <ToastStack toasts={toasts} dismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      </div>
    );
  }

  return (
    <div className={`app-shell ${rightPanelOpen ? 'with-inspector' : ''} ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small"><Blocks size={17} /></div>
          <div><strong>CodexHarbor</strong><span>remote workspace</span></div>
          <button className="mini-icon sidebar-toggle" onClick={() => setSidebarOpen(false)}><X size={15} /></button>
        </div>

        <div className="host-status-card">
          <div className="server-icon online"><CloudCog size={17} /></div>
          <div><strong>{selectedHost?.name ?? 'Remote host'}</strong><span><i /> {selectedHost?.username}@{selectedHost?.host}</span></div>
          <button className="mini-icon" onClick={disconnect} title="Disconnect"><LogOut size={14} /></button>
        </div>

        <button className="new-thread-button" onClick={() => { activeThreadIdRef.current = ''; setActiveThread(null); setItems([]); setPendingRequests([]); setRunning(false); setActiveTurnId(''); }}><CirclePlus size={17} /> New task</button>

        <div className="thread-search"><Search size={14} /><input value={threadSearch} onChange={(event) => setThreadSearch(event.target.value)} placeholder="Search threads" /></div>

        <div className="thread-list">
          <div className="section-label"><span>RECENT THREADS</span><button className="mini-icon" onClick={refreshThreads}><RefreshCw size={13} /></button></div>
          {filteredThreads.map((thread) => (
            <button key={thread.id} className={`thread-row ${activeThread?.id === thread.id ? 'active' : ''}`} onClick={() => void openThread(thread)}>
              <MessageSquareText size={15} />
              <div><strong>{thread.name || thread.preview || 'Untitled task'}</strong><span>{thread.cwd || 'Remote workspace'}</span></div>
              <time>{formatRelativeTime(thread.recencyAt ?? thread.updatedAt ?? thread.createdAt)}</time>
              {statusLabel(thread.status) === 'active' && <i className="thread-running" />}
            </button>
          ))}
          {filteredThreads.length === 0 && <div className="empty-list">No matching threads.</div>}
        </div>

        <div className="sidebar-footer">
          <button onClick={() => { setEditingHost(selectedHost); setHostDialogOpen(true); }}><Settings2 size={15} /> Connection settings</button>
          <button onClick={() => window.codexBridge.system.openExternal('https://developers.openai.com/codex/app-server/')}><ExternalLink size={15} /> App Server docs</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          {!sidebarOpen && <button className="icon-button" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>}
          <div className="workspace-title">
            <span>{activeThread ? 'ACTIVE THREAD' : 'NEW REMOTE TASK'}</span>
            <h2>{activeThread?.name || activeThread?.preview || (activeThread ? 'Untitled task' : 'What should Codex build?')}</h2>
          </div>
          <div className="workspace-actions">
            {activeThread && <button className="secondary-button compact" onClick={archiveThread}><Archive size={15} /> Archive</button>}
            <button className="icon-button" onClick={() => setRightPanelOpen((open) => !open)}>{rightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button>
          </div>
        </header>

        <div className="control-bar">
          <label className="path-control"><FolderGit2 size={15} /><input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="/absolute/path/on/vps" disabled={running} /></label>
          <label className="select-control"><Bot size={14} /><select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={running}><option value="">Server default</option>{models.map((model) => <option key={model.id} value={model.id}>{model.displayName ?? model.model ?? model.id}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-control"><Gauge size={14} /><select value={effort} onChange={(event) => setEffort(event.target.value)} disabled={running}>{supportedEfforts.map((value) => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={13} /></label>
          <label className="select-control"><ShieldCheck size={14} /><select value={sandboxMode} onChange={(event) => setSandboxMode(event.target.value)} disabled={running}><option value="workspaceWrite">Workspace write</option><option value="readOnly">Read only</option><option value="dangerFullAccess">Full access</option></select><ChevronDown size={13} /></label>
          <label className="select-control"><Play size={14} /><select value={approvalPolicy} onChange={(event) => setApprovalPolicy(event.target.value)} disabled={running}><option value="onRequest">Ask when needed</option><option value="unlessTrusted">Unless trusted</option><option value="never">Never ask</option></select><ChevronDown size={13} /></label>
        </div>

        {requiresAuth && (
          <div className="auth-banner">
            <div><KeyRound size={18} /><span><strong>Codex is not signed in on this VPS.</strong> Authenticate the remote CLI using your ChatGPT plan.</span></div>
            {deviceLogin ? (
              <div className="device-code"><code>{deviceLogin.userCode}</code><button className="primary-button compact" onClick={() => window.codexBridge.system.openExternal(deviceLogin.verificationUrl)}><ExternalLink size={14} /> Open sign-in</button></div>
            ) : <button className="primary-button compact" onClick={beginDeviceLogin}>Sign in</button>}
          </div>
        )}

        {!cwd && !activeThread && !bootstrapLoading && (
          <div className="setup-banner">
            <div><FolderGit2 size={18} /><span><strong>No VPS project directory is selected.</strong> Add an absolute path such as <code>/root/invisib</code> above or save it in the host profile.</span></div>
            <button className="secondary-button compact" onClick={() => { setEditingHost(selectedHost); setHostDialogOpen(true); }}><Settings2 size={14} /> Edit host</button>
          </div>
        )}

        <div className="conversation" ref={scrollRef}>
          {bootstrapLoading ? (
            <div className="center-loader"><RefreshCw className="spin" size={22} /><span>Loading Codex models, account, and thread history…</span></div>
          ) : loadingThread ? (
            <div className="center-loader"><RefreshCw className="spin" size={22} /><span>Loading remote thread…</span></div>
          ) : bootstrapError ? (
            <div className="empty-conversation error-state">
              <WifiOff size={34} />
              <span className="eyebrow">CONNECTED, BUT BOOTSTRAP FAILED</span>
              <h1>SSH works. Codex data does not.</h1>
              <p>{bootstrapError}</p>
              <button className="primary-button" onClick={loadBootstrap}><RefreshCw size={15} /> Retry bootstrap</button>
            </div>
          ) : items.length === 0 && pendingRequests.length === 0 ? (
            <div className="empty-conversation">
              <div className="empty-orbit"><div><Bot size={29} /></div></div>
              <span className="eyebrow">CODEX APP SERVER · {connection.platform?.toUpperCase() ?? 'REMOTE'}</span>
              <h1>{activeThread ? 'This thread has no visible items.' : 'Delegate the work. Keep the control.'}</h1>
              <p>{cwd ? <>Describe a concrete task. Codex runs inside <code>{cwd}</code>, streams every meaningful action, and pauses here for approvals.</> : <>Set an absolute VPS project path above before sending a task. The connection is alive, but Codex cannot guess which repository humanity intended.</>}</p>
              <div className="suggestion-grid">
                <button onClick={() => setPrompt('Inspect this repository, explain its architecture, and identify the three highest-impact improvements.')}><strong>Understand the repo</strong><span>Architecture, risks, next steps</span></button>
                <button onClick={() => setPrompt('Run the test suite, diagnose every failure, fix the root causes, and summarize the changes.')}><strong>Fix failing tests</strong><span>Execute, patch, verify</span></button>
                <button onClick={() => setPrompt('Review the current uncommitted changes for bugs, security issues, and maintainability problems.')}><strong>Review changes</strong><span>Find defects before Git does</span></button>
              </div>
            </div>
          ) : (
            <div className="conversation-stream">
              {items.map((item) => <CodexItemView key={item.id} item={item} />)}
              {pendingRequests.filter((request) => !request.params?.threadId || request.params.threadId === activeThread?.id).map((request) => (
                <ApprovalCard key={request.requestId} request={request} onResolve={resolveRequest} onReject={rejectRequest} />
              ))}
              {running && !items.some((item) => item.type === 'agentMessage' && item.status === 'inProgress') && <div className="thinking-row"><span /><span /><span /><em>Codex is working</em></div>}
            </div>
          )}
        </div>

        <footer className="composer-wrap">
          {sandboxMode === 'dangerFullAccess' && <div className="danger-strip">Full access disables the safety boundary for this turn. That is power, not a personality trait.</div>}
          <div className={`composer ${running ? 'running' : ''}`}>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={onComposerKeyDown} placeholder={running ? 'Steer the active turn…' : 'Message Codex on the VPS…'} disabled={requiresAuth} rows={3} />
            <div className="composer-footer">
              <span><kbd>Ctrl</kbd><kbd>Enter</kbd> {running ? 'steer' : 'send'}</span>
              <div className="composer-actions">
                <button className="send-button" onClick={sendPrompt} disabled={!prompt.trim() || requiresAuth || (running && !activeTurnId)}><Send size={16} /> {running ? 'Steer' : 'Send'}</button>
                {running && <button className="stop-button" onClick={interrupt} disabled={!activeTurnId}><Square size={14} fill="currentColor" /> Stop</button>}
              </div>
            </div>
          </div>
        </footer>
      </main>

      {rightPanelOpen && (
        <aside className="inspector">
          <div className="inspector-header"><div><span className="eyebrow">SESSION</span><h3>Remote inspector</h3></div><button className="mini-icon" onClick={() => setRightPanelOpen(false)}><X size={15} /></button></div>
          <section className="inspector-section">
            <h4>Connection</h4>
            <dl>
              <div><dt>Status</dt><dd className="online-text"><Wifi size={13} /> Connected</dd></div>
              <div><dt>Host</dt><dd>{selectedHost?.host}</dd></div>
              <div><dt>User</dt><dd>{selectedHost?.username}</dd></div>
              <div><dt>Runtime</dt><dd>{connection.platform ?? 'remote'}</dd></div>
              <div><dt>Models</dt><dd>{models.length || 'server default'}</dd></div>
              <div><dt>Threads</dt><dd>{threads.length}</dd></div>
            </dl>
          </section>
          <section className="inspector-section">
            <h4>Account</h4>
            <dl>
              <div><dt>Auth</dt><dd>{account?.type ?? (requiresAuth ? 'Sign-in required' : 'Server-managed / not required')}</dd></div>
              <div><dt>Plan</dt><dd>{account?.planType ?? '—'}</dd></div>
              <div><dt>Email</dt><dd className="truncate">{account?.email ?? '—'}</dd></div>
            </dl>
          </section>
          <section className="inspector-section">
            <h4>Thread</h4>
            <dl>
              <div><dt>ID</dt><dd className="mono truncate">{activeThread?.id ?? 'New'}</dd></div>
              <div><dt>State</dt><dd>{running ? 'Active' : statusLabel(activeThread?.status)}</dd></div>
              <div><dt>Items</dt><dd>{items.length}</dd></div>
              <div><dt>Approvals</dt><dd>{pendingRequests.length}</dd></div>
            </dl>
          </section>
          {usage && <section className="inspector-section"><h4>Rate limits</h4><pre className="usage-json">{JSON.stringify(usage, null, 2)}</pre></section>}
          <section className="inspector-section diagnostics-section">
            <div className="section-heading"><h4>Diagnostics</h4><button className="mini-icon" onClick={() => setDiagnostics([])}><Trash2 size={13} /></button></div>
            {diagnostics.length ? diagnostics.slice(-20).map((line, index) => <code key={`${index}-${line.slice(0, 10)}`}>{line}</code>) : <p>No diagnostics. Suspiciously civilized.</p>}
          </section>
        </aside>
      )}

      <HostDialog open={hostDialogOpen} host={editingHost} onClose={() => setHostDialogOpen(false)} onSaved={saveHost} />
      <ToastStack toasts={toasts} dismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  );
}

function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss(id: number): void }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <button key={toast.id} className={`toast ${toast.kind}`} onClick={() => dismiss(toast.id)}>
          {toast.kind === 'error' ? <WifiOff size={16} /> : <Wifi size={16} />}<span>{toast.text}</span><X size={14} />
        </button>
      ))}
    </div>
  );
}
