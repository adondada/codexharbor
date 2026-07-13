import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Braces, CheckCircle2, ChevronDown, ChevronRight, CircleEllipsis, FileDiff, GitPullRequest, Globe2, Image, Search, TerminalSquare, UserRound, XCircle } from 'lucide-react';
import type { CodexItem } from '../lib/codex';
import { commandText, itemPrimaryText } from '../lib/codex';

function StatusIcon({ status }: { status?: string }) {
  if (status === 'failed' || status === 'declined') return <XCircle size={14} />;
  if (status === 'completed') return <CheckCircle2 size={14} />;
  return <CircleEllipsis size={14} className="spin-soft" />;
}

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children: label }) => (
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault();
              if (href && /^https?:\/\//i.test(href)) void window.codexBridge.system.openExternal(href);
            }}
          >
            {label}
          </a>
        ),
        img: ({ src, alt }) => <span className="blocked-image">[Remote image blocked: {alt || src || 'image'}]</span>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export function CodexItemView({ item }: { item: CodexItem }) {
  const [expanded, setExpanded] = useState(item.type === 'fileChange');
  const primary = itemPrimaryText(item);

  if (item.type === 'userMessage') {
    return (
      <div className="message-row user-message">
        <div className="message-avatar"><UserRound size={16} /></div>
        <div className="message-bubble"><Markdown>{primary}</Markdown></div>
      </div>
    );
  }

  if (item.type === 'agentMessage') {
    if (!primary && item.status !== 'completed') return null;
    return (
      <div className="message-row agent-message">
        <div className="message-avatar"><Bot size={17} /></div>
        <div className="message-content"><Markdown>{primary || ' '}</Markdown>{item.status === 'inProgress' && <span className="typing-caret" />}</div>
      </div>
    );
  }

  if (item.type === 'reasoning' || item.type === 'plan') {
    return (
      <div className="activity-card muted-card">
        <button className="activity-header" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Braces size={15} /><span>{item.type === 'plan' ? 'Plan' : 'Reasoning summary'}</span>
        </button>
        {expanded && <div className="activity-body markdown-small"><Markdown>{primary || 'No readable summary.'}</Markdown></div>}
      </div>
    );
  }

  if (item.type === 'commandExecution') {
    const output = item.aggregatedOutput ?? item.streamedOutput ?? item.output ?? '';
    return (
      <div className={`activity-card command-card status-${item.status ?? 'running'}`}>
        <button className="activity-header" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <TerminalSquare size={15} />
          <code>{commandText(item.command) || 'Command'}</code>
          <span className="spacer" />
          <StatusIcon status={item.status} />
          {typeof item.exitCode === 'number' && <span className="status-pill">exit {item.exitCode}</span>}
        </button>
        {expanded && (
          <div className="activity-body">
            {item.cwd && <div className="cwd-line">in {item.cwd}</div>}
            <pre>{output || (item.status === 'inProgress' ? 'Running…' : 'No output')}</pre>
          </div>
        )}
      </div>
    );
  }

  if (item.type === 'fileChange') {
    return (
      <div className={`activity-card diff-card status-${item.status ?? 'running'}`}>
        <button className="activity-header" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <FileDiff size={15} /><span>{item.changes?.length ?? 0} file change{item.changes?.length === 1 ? '' : 's'}</span>
          <span className="spacer" /><StatusIcon status={item.status} />
        </button>
        {expanded && (
          <div className="activity-body change-list">
            {(item.changes ?? []).map((change, index) => (
              <details key={`${change.path}-${index}`} open={item.changes?.length === 1}>
                <summary><span className={`change-kind ${change.kind ?? 'edit'}`}>{change.kind ?? 'edit'}</span><code>{change.path ?? 'unknown file'}</code></summary>
                {change.diff && <pre className="diff-output">{change.diff}</pre>}
              </details>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (item.type === 'mcpToolCall' || item.type === 'dynamicToolCall' || item.type === 'collabToolCall') {
    return (
      <div className="activity-card tool-card">
        <button className="activity-header" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <GitPullRequest size={15} /><span>{item.server ? `${item.server} · ` : ''}{item.tool ?? 'Tool call'}</span>
          <span className="spacer" /><StatusIcon status={item.status} />
        </button>
        {expanded && <div className="activity-body"><pre>{JSON.stringify({ arguments: item.arguments, result: item.result, error: item.error }, null, 2)}</pre></div>}
      </div>
    );
  }

  if (item.type === 'webSearch') {
    return <div className="inline-event"><Search size={14} /><span>{primary}</span></div>;
  }
  if (item.type === 'imageView') {
    return <div className="inline-event"><Image size={14} /><span>{primary}</span></div>;
  }
  if (item.type === 'enteredReviewMode' || item.type === 'exitedReviewMode') {
    return <div className="activity-card review-card"><div className="activity-header"><GitPullRequest size={15} /><span>{item.type === 'enteredReviewMode' ? 'Review started' : 'Review completed'}</span></div>{primary && <div className="activity-body markdown-small"><Markdown>{primary}</Markdown></div>}</div>;
  }
  if (item.type === 'contextCompaction') {
    return <div className="inline-event"><Braces size={14} /><span>Context compacted</span></div>;
  }

  return (
    <div className="activity-card muted-card">
      <button className="activity-header" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <Globe2 size={15} /><span>{item.type}</span>
      </button>
      {expanded && <div className="activity-body"><pre>{JSON.stringify(item, null, 2)}</pre></div>}
    </div>
  );
}
