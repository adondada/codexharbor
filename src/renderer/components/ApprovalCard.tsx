import { useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCheck, ExternalLink, FilePenLine, ShieldAlert, TerminalSquare, X } from 'lucide-react';
import type { PendingRequest } from '../lib/codex';
import { commandText } from '../lib/codex';

interface ApprovalCardProps {
  request: PendingRequest;
  onResolve(requestId: number, result: unknown): Promise<void>;
  onReject(requestId: number, message?: string): Promise<void>;
}

function seedFromSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return {};
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'object' || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, value]) => [key, seedFromSchema(value)]),
    );
  }
  if (schema.type === 'array') return [];
  if (schema.type === 'boolean') return false;
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  return '';
}

function normalizeDecision(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>)[0] ?? '';
  return '';
}

export function ApprovalCard({ request, onResolve, onReject }: ApprovalCardProps) {
  const params = request.params ?? {};
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [structuredContent, setStructuredContent] = useState(() => JSON.stringify(seedFromSchema(params.requestedSchema), null, 2));
  const [structuredError, setStructuredError] = useState('');
  const isCommand = request.method === 'item/commandExecution/requestApproval';
  const isFile = request.method === 'item/fileChange/requestApproval';
  const isInput = request.method === 'item/tool/requestUserInput' || request.method === 'tool/requestUserInput';
  const isPermissions = request.method === 'item/permissions/requestApproval';
  const isMcp = request.method === 'mcpServer/elicitation/request';

  const title = isCommand
    ? params.networkApprovalContext
      ? 'Network access requested'
      : 'Command approval required'
    : isFile
      ? 'File changes need approval'
      : isInput
        ? 'Codex needs your input'
        : isPermissions
          ? 'Additional permissions requested'
          : isMcp
            ? 'Connector input required'
            : 'Action required';

  const Icon = isCommand ? TerminalSquare : isFile ? FilePenLine : isPermissions ? ShieldAlert : AlertTriangle;
  const questions = useMemo(() => (Array.isArray(params.questions) ? params.questions : []), [params.questions]);
  const availableDecisions = useMemo(
    () => new Set((Array.isArray(params.availableDecisions) ? params.availableDecisions : []).map(normalizeDecision).filter(Boolean)),
    [params.availableDecisions],
  );
  const allows = (decision: string) => availableDecisions.size === 0 || availableDecisions.has(decision);

  const resolve = async (result: unknown) => {
    setBusy(true);
    try {
      await onResolve(request.requestId, result);
    } finally {
      setBusy(false);
    }
  };

  const decisionButton = (decision: 'decline' | 'cancel' | 'accept' | 'acceptForSession', label: string, className: string) => {
    if (!allows(decision)) return null;
    const DecisionIcon = decision === 'acceptForSession' ? CheckCheck : decision === 'accept' ? Check : X;
    return (
      <button disabled={busy} className={className} onClick={() => resolve({ decision })}>
        <DecisionIcon size={15} /> {label}
      </button>
    );
  };

  const renderCommand = () => {
    const network = params.networkApprovalContext;
    return (
      <>
        {params.reason && <p className="approval-reason">{params.reason}</p>}
        {network ? (
          <div className="approval-command">
            <span className="mono">{network.protocol ?? 'network'}://{network.host ?? 'unknown host'}{network.port ? `:${network.port}` : ''}</span>
          </div>
        ) : (
          <div className="approval-command">
            <code>{commandText(params.command)}</code>
            {params.cwd && <span>{params.cwd}</span>}
          </div>
        )}
        <div className="approval-actions">
          {decisionButton('decline', 'Decline', 'danger-ghost')}
          {decisionButton('cancel', 'Cancel turn', 'danger-ghost')}
          {decisionButton('accept', 'Allow once', 'secondary-button')}
          {decisionButton('acceptForSession', 'Allow for session', 'primary-button')}
        </div>
      </>
    );
  };

  const renderFile = () => (
    <>
      {params.reason && <p className="approval-reason">{params.reason}</p>}
      {params.grantRoot && <div className="approval-command"><span>Requested write root</span><code>{params.grantRoot}</code></div>}
      <div className="approval-actions">
        {decisionButton('decline', 'Decline', 'danger-ghost')}
        {decisionButton('cancel', 'Cancel turn', 'danger-ghost')}
        {decisionButton('accept', 'Apply once', 'secondary-button')}
        {decisionButton('acceptForSession', 'Trust this session', 'primary-button')}
      </div>
    </>
  );

  const renderQuestions = () => (
    <>
      <div className="question-list">
        {questions.map((question: any, index: number) => {
          const id = String(question.id ?? index);
          const options = Array.isArray(question.options) ? question.options : [];
          return (
            <div className="question" key={id}>
              {question.header && <span className="question-header">{question.header}</span>}
              <strong>{question.question ?? question.prompt ?? `Question ${index + 1}`}</strong>
              {options.length > 0 ? (
                <div className="question-options">
                  {options.map((option: any) => {
                    const label = String(option.label ?? option.value ?? option);
                    return (
                      <label key={label} className={answers[id] === label ? 'selected' : ''}>
                        <input type="radio" name={`q-${id}`} checked={answers[id] === label} onChange={() => setAnswers((current) => ({ ...current, [id]: label }))} />
                        <span><b>{label}</b>{option.description && <small>{option.description}</small>}</span>
                      </label>
                    );
                  })}
                  {question.isOther && (
                    <input placeholder="Other answer…" value={options.some((o: any) => String(o.label ?? o.value ?? o) === answers[id]) ? '' : answers[id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [id]: event.target.value }))} />
                  )}
                </div>
              ) : (
                <textarea rows={2} value={answers[id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [id]: event.target.value }))} placeholder="Type your answer" />
              )}
            </div>
          );
        })}
        {questions.length === 0 && <pre className="json-preview">{JSON.stringify(params, null, 2)}</pre>}
      </div>
      <div className="approval-actions">
        <button disabled={busy} className="danger-ghost" onClick={() => resolve({ answers: {} })}><X size={15} /> Skip</button>
        <button
          disabled={busy || questions.some((question: any, index: number) => !answers[String(question.id ?? index)]?.trim())}
          className="primary-button"
          onClick={() => resolve({ answers: Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, { answers: [value] }])) })}
        >
          <Check size={15} /> Submit answers
        </button>
      </div>
    </>
  );

  const renderPermissions = () => (
    <>
      {params.reason && <p className="approval-reason">{params.reason}</p>}
      <pre className="json-preview">{JSON.stringify(params.permissions ?? {}, null, 2)}</pre>
      <div className="approval-actions">
        <button disabled={busy} className="danger-ghost" onClick={() => resolve({ permissions: {} })}><X size={15} /> Deny</button>
        <button disabled={busy} className="secondary-button" onClick={() => resolve({ scope: 'turn', permissions: params.permissions ?? {} })}><Check size={15} /> This turn</button>
        <button disabled={busy} className="primary-button" onClick={() => resolve({ scope: 'session', permissions: params.permissions ?? {} })}><CheckCheck size={15} /> This session</button>
      </div>
    </>
  );

  const submitMcpForm = async () => {
    try {
      const content = JSON.parse(structuredContent);
      setStructuredError('');
      await resolve({ action: 'accept', content });
    } catch (error: any) {
      setStructuredError(`Invalid JSON: ${error?.message ?? String(error)}`);
    }
  };

  const renderMcp = () => {
    if (params.mode === 'url' && params.url) {
      return (
        <>
          <p className="approval-reason">{params.message ?? 'Open the connector authorization page.'}</p>
          <button className="secondary-button" onClick={() => window.codexBridge.system.openExternal(params.url)}><ExternalLink size={15} /> Open page</button>
          <div className="approval-actions">
            <button disabled={busy} className="danger-ghost" onClick={() => resolve({ action: 'decline', content: null })}>Decline</button>
            <button disabled={busy} className="primary-button" onClick={() => resolve({ action: 'accept', content: null })}>Continue</button>
          </div>
        </>
      );
    }
    return (
      <>
        <p className="approval-reason">{params.message ?? 'The connector is requesting structured input.'}</p>
        <details className="schema-details">
          <summary>Requested JSON schema</summary>
          <pre className="json-preview">{JSON.stringify(params.requestedSchema ?? {}, null, 2)}</pre>
        </details>
        <textarea
          className="structured-input"
          rows={8}
          value={structuredContent}
          onChange={(event) => setStructuredContent(event.target.value)}
          spellCheck={false}
          aria-label="Connector response JSON"
        />
        {structuredError && <div className="error-banner">{structuredError}</div>}
        <div className="approval-actions">
          <button disabled={busy} className="danger-ghost" onClick={() => resolve({ action: 'decline', content: null })}>Decline</button>
          <button disabled={busy} className="secondary-button" onClick={() => resolve({ action: 'cancel', content: null })}>Cancel request</button>
          <button disabled={busy} className="primary-button" onClick={submitMcpForm}><Check size={15} /> Submit</button>
        </div>
      </>
    );
  };

  return (
    <section className="approval-card">
      <div className="approval-title"><Icon size={18} /><div><span>WAITING FOR YOU</span><h3>{title}</h3></div></div>
      {isCommand && renderCommand()}
      {isFile && renderFile()}
      {isInput && renderQuestions()}
      {isPermissions && renderPermissions()}
      {isMcp && renderMcp()}
      {!isCommand && !isFile && !isInput && !isPermissions && !isMcp && (
        <>
          <pre className="json-preview">{JSON.stringify(params, null, 2)}</pre>
          <div className="approval-actions">
            <button disabled={busy} className="danger-ghost" onClick={() => onReject(request.requestId, 'Unsupported request type')}>Reject unsupported request</button>
          </div>
        </>
      )}
    </section>
  );
}
