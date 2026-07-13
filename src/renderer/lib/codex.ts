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
  text?: string;
  phase?: string;
  content?: any;
  summary?: any;
  command?: string | string[];
  cwd?: string;
  commandActions?: any[];
  aggregatedOutput?: string;
  output?: string;
  streamedOutput?: string;
  exitCode?: number | null;
  durationMs?: number;
  changes?: Array<{ path?: string; kind?: string; diff?: string }>;
  server?: string;
  tool?: string;
  arguments?: any;
  result?: any;
  error?: any;
  query?: string;
  action?: any;
  path?: string;
  review?: string;
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

export function textFromContent(content: any): string {
  if (typeof content === 'string') return content;
  if (!content) return '';
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' || part?.type === 'inputText' || part?.type === 'output_text') return part.text ?? '';
        if (part?.type === 'image' || part?.type === 'localImage') return `[Image: ${part.path ?? part.url ?? 'attached'}]`;
        return part?.text ?? '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return content.text ?? '';
}

export function commandText(command: string | string[] | undefined): string {
  if (Array.isArray(command)) return command.join(' ');
  return command ?? '';
}

export function itemPrimaryText(item: CodexItem): string {
  switch (item.type) {
    case 'userMessage':
      return textFromContent(item.content);
    case 'agentMessage':
    case 'plan':
      return item.text ?? '';
    case 'reasoning':
      return textFromContent(item.summary) || textFromContent(item.content);
    case 'commandExecution':
      return commandText(item.command);
    case 'fileChange':
      return (item.changes ?? []).map((change) => `${change.kind ?? 'edit'} ${change.path ?? ''}`).join('\n');
    case 'mcpToolCall':
      return `${item.server ?? 'MCP'} · ${item.tool ?? 'tool'}`;
    case 'dynamicToolCall':
    case 'collabToolCall':
      return item.tool ?? item.type;
    case 'webSearch':
      return item.query ?? item.action?.query ?? 'Web search';
    case 'imageView':
      return item.path ?? 'Image';
    case 'enteredReviewMode':
      return item.review ?? 'Review started';
    case 'exitedReviewMode':
      return item.review ?? 'Review completed';
    case 'contextCompaction':
      return 'Context compacted';
    default:
      return item.text ?? item.review ?? '';
  }
}

export function flattenTurns(thread: ThreadSummary | undefined): CodexItem[] {
  if (!thread?.turns) return [];
  return thread.turns.flatMap((turn) => (turn.items ?? []).map((item) => ({ ...item, turnId: turn.id })));
}

export function formatRelativeTime(epochSeconds?: number): string {
  if (!epochSeconds) return '';
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
  if (!status) return 'idle';
  if (typeof status === 'string') return status;
  return status.type ?? 'idle';
}
