export interface ThreadSummary {
  id: string;
  sessionId?: string;
  name?: string | null;
  preview?: string;
  cwd?: string;
  createdAt?: number;
  updatedAt?: number;
  recencyAt?: number;
  modelProvider?: string;
  status?: { type?: string; activeFlags?: string[] } | string;
  turns?: Array<{ id?: string; status?: string; items?: CodexItem[] }>;
}

export interface ModelInfo {
  id: string;
  model?: string;
  displayName?: string;
  hidden?: boolean;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: Array<{ reasoningEffort: string; description?: string }>;
  isDefault?: boolean;
}

export interface CodexItem {
  id: string;
  type: string;
  status?: string;
  text?: unknown;
  phase?: string;
  content?: unknown;
  summary?: unknown;
  command?: unknown;
  cwd?: unknown;
  commandActions?: unknown[];
  aggregatedOutput?: unknown;
  output?: unknown;
  streamedOutput?: unknown;
  exitCode?: number | null;
  durationMs?: number;
  changes?: Array<{ path?: unknown; kind?: unknown; diff?: unknown }>;
  server?: unknown;
  tool?: unknown;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
  query?: unknown;
  action?: any;
  path?: unknown;
  review?: unknown;
  turnId?: string;
  [key: string]: any;
}

export interface AccountInfo {
  type?: string;
  email?: string | null;
  planType?: string | null;
  credentialSource?: string;
}

export interface PendingRequest {
  requestId: number;
  method: string;
  params: any;
}

/**
 * Convert App Server values from both current and historical schemas into
 * render-safe text. JSON-RPC data is untrusted at the UI boundary: older
 * threads can contain structured objects where newer releases return strings.
 */
export function displayText(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    const parts = value.map((entry) => displayText(entry)).filter(Boolean);
    return parts.length ? parts.join('\n') : fallback;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'content', 'message', 'value', 'label', 'name', 'path', 'query', 'review']) {
      if (record[key] !== undefined) {
        const nested = displayText(record[key]);
        if (nested) return nested;
      }
    }

    // Historical protocol variants occasionally use tagged objects with only
    // a `type` field. Returning the tag is less pretty than losing the window.
    if (typeof record.type === 'string') return record.type;

    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

export function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!content) return '';
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return displayText(part);
        const record = part as Record<string, unknown>;
        const partType = displayText(record.type);
        if (partType === 'image' || partType === 'localImage' || partType === 'inputImage') {
          return `[Image: ${displayText(record.path ?? record.url, 'attached')}]`;
        }
        return displayText(record.text ?? record.content ?? record.value);
      })
      .filter(Boolean)
      .join('\n');
  }
  return displayText(content);
}

export function commandText(command: unknown): string {
  if (Array.isArray(command)) return command.map((part) => displayText(part)).filter(Boolean).join(' ');
  return displayText(command);
}

export function itemPrimaryText(item: CodexItem): string {
  switch (item.type) {
    case 'userMessage':
      return textFromContent(item.content ?? item.text);
    case 'agentMessage':
    case 'plan':
      return textFromContent(item.text ?? item.content);
    case 'reasoning':
      return textFromContent(item.summary) || textFromContent(item.content) || textFromContent(item.text);
    case 'commandExecution':
      return commandText(item.command);
    case 'fileChange':
      return (item.changes ?? []).map((change) => `${displayText(change.kind, 'edit')} ${displayText(change.path)}`.trim()).join('\n');
    case 'mcpToolCall':
      return `${displayText(item.server, 'MCP')} · ${displayText(item.tool, 'tool')}`;
    case 'dynamicToolCall':
    case 'collabToolCall':
      return displayText(item.tool, item.type);
    case 'webSearch':
      return displayText(item.query ?? item.action?.query, 'Web search');
    case 'imageView':
      return displayText(item.path, 'Image');
    case 'enteredReviewMode':
      return displayText(item.review, 'Review started');
    case 'exitedReviewMode':
      return displayText(item.review, 'Review completed');
    case 'contextCompaction':
      return 'Context compacted';
    default:
      return textFromContent(item.text ?? item.content ?? item.review);
  }
}

export function normalizeStatus(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const type = displayText((value as Record<string, unknown>).type);
    return type || undefined;
  }
  return undefined;
}

export function normalizeCodexItem(value: unknown, fallbackId = 'item'): CodexItem {
  const raw = value && typeof value === 'object' ? value as Record<string, any> : {};
  return {
    ...raw,
    id: displayText(raw.id, fallbackId),
    type: displayText(raw.type, 'unknown'),
    status: normalizeStatus(raw.status),
    turnId: displayText(raw.turnId) || undefined,
  } as CodexItem;
}

export function normalizeThread(value: unknown, fallbackId = 'thread'): ThreadSummary {
  const raw = value && typeof value === 'object' ? value as Record<string, any> : {};
  const turns = Array.isArray(raw.turns)
    ? raw.turns.map((turn: any, turnIndex: number) => {
        const turnRecord = turn && typeof turn === 'object' ? turn : {};
        const turnId = displayText(turnRecord.id, `${fallbackId}-turn-${turnIndex}`);
        return {
          ...turnRecord,
          id: turnId,
          status: normalizeStatus(turnRecord.status),
          items: Array.isArray(turnRecord.items)
            ? turnRecord.items.map((item: unknown, itemIndex: number) => normalizeCodexItem(item, `${turnId}-item-${itemIndex}`))
            : [],
        };
      })
    : undefined;

  return {
    ...raw,
    id: displayText(raw.id ?? raw.threadId ?? raw.sessionId, fallbackId),
    sessionId: displayText(raw.sessionId) || undefined,
    name: displayText(raw.name) || null,
    preview: displayText(raw.preview) || undefined,
    cwd: displayText(raw.cwd) || undefined,
    modelProvider: displayText(raw.modelProvider) || undefined,
    status: normalizeStatus(raw.status),
    turns,
  } as ThreadSummary;
}

export function flattenTurns(thread: ThreadSummary | undefined): CodexItem[] {
  if (!thread?.turns) return [];
  return thread.turns.flatMap((turn, turnIndex) => (turn.items ?? []).map((item, itemIndex) => normalizeCodexItem({ ...item, turnId: turn.id }, `${thread.id}-turn-${turnIndex}-item-${itemIndex}`)));
}

export function formatRelativeTime(epochSeconds?: number): string {
  if (!epochSeconds || typeof epochSeconds !== 'number') return '';
  const ms = epochSeconds > 10_000_000_000 ? epochSeconds : epochSeconds * 1000;
  const delta = Date.now() - ms;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function statusLabel(status: ThreadSummary['status']): string {
  return normalizeStatus(status) ?? 'idle';
}
