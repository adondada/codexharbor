import { useEffect, useState } from 'react';
import { FolderKey, KeyRound, LockKeyhole, Network, Server, ShieldCheck, X } from 'lucide-react';
import type { AuthMethod, HostRecord, PublicHostRecord } from '../../shared';

interface HostDialogProps {
  open: boolean;
  host?: PublicHostRecord | null;
  onClose(): void;
  onSaved(host: PublicHostRecord): void;
}

type FormState = {
  name: string;
  host: string;
  port: string;
  username: string;
  authMethod: AuthMethod;
  privateKeyPath: string;
  password: string;
  passphrase: string;
  codexCommand: string;
  expectedFingerprint: string;
  defaultCwd: string;
};

const emptyForm: FormState = {
  name: 'My VPS',
  host: '',
  port: '22',
  username: 'root',
  authMethod: 'privateKey',
  privateKeyPath: '',
  password: '',
  passphrase: '',
  codexCommand: 'codex',
  expectedFingerprint: '',
  defaultCwd: '/root',
};

export function HostDialog({ open, host, onClose, onSaved }: HostDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      host
        ? {
            name: host.name,
            host: host.host,
            port: String(host.port),
            username: host.username,
            authMethod: host.authMethod,
            privateKeyPath: host.privateKeyPath ?? '',
            password: '',
            passphrase: '',
            codexCommand: host.codexCommand || 'codex',
            expectedFingerprint: host.expectedFingerprint ?? '',
            defaultCwd: host.defaultCwd ?? '',
          }
        : emptyForm,
    );
  }, [open, host]);

  if (!open) return null;

  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const chooseKey = async () => {
    const file = await window.codexBridge.hosts.pickPrivateKey();
    if (file) update('privateKeyPath', file);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await window.codexBridge.hosts.save({
        id: host?.id,
        name: form.name,
        host: form.host,
        port: Number(form.port),
        username: form.username,
        authMethod: form.authMethod,
        privateKeyPath: form.privateKeyPath || undefined,
        password: form.password || undefined,
        passphrase: form.passphrase || undefined,
        codexCommand: form.codexCommand,
        expectedFingerprint: form.expectedFingerprint || undefined,
        defaultCwd: form.defaultCwd || undefined,
      } as Partial<HostRecord> & Pick<HostRecord, 'name' | 'host' | 'username' | 'authMethod'>);
      onSaved(saved);
      onClose();
    } catch (caught: any) {
      setError(caught?.message ?? String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal host-dialog" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">SSH CONNECTION</div>
            <h2>{host ? 'Edit remote host' : 'Add a remote host'}</h2>
            <p>CodexHarbor starts App Server through this SSH connection. Nothing is exposed publicly.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid two-columns">
          <label>
            <span><Server size={14} /> Display name</span>
            <input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Production VPS" required />
          </label>
          <label>
            <span><Network size={14} /> Host or Tailscale IP</span>
            <input value={form.host} onChange={(e) => update('host', e.target.value)} placeholder="100.x.y.z or vps.example.com" required />
          </label>
          <label>
            <span>SSH user</span>
            <input value={form.username} onChange={(e) => update('username', e.target.value)} placeholder="root" required />
          </label>
          <label>
            <span>SSH port</span>
            <input value={form.port} onChange={(e) => update('port', e.target.value)} type="number" min="1" max="65535" required />
          </label>
        </div>

        <div className="segmented auth-selector" role="group" aria-label="Authentication method">
          {([
            ['privateKey', KeyRound, 'Private key'],
            ['password', LockKeyhole, 'Password'],
            ['agent', ShieldCheck, 'SSH agent'],
          ] as const).map(([value, Icon, label]) => (
            <button key={value} type="button" className={form.authMethod === value ? 'active' : ''} onClick={() => update('authMethod', value)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {form.authMethod === 'privateKey' && (
          <div className="form-grid two-columns">
            <label className="span-two">
              <span><FolderKey size={14} /> Private key file</span>
              <div className="input-with-button">
                <input value={form.privateKeyPath} onChange={(e) => update('privateKeyPath', e.target.value)} placeholder="C:\\Users\\you\\.ssh\\id_ed25519" required />
                <button type="button" className="secondary-button" onClick={chooseKey}>Browse</button>
              </div>
            </label>
            <label className="span-two">
              <span>Key passphrase <small>{host?.hasPassphrase ? 'leave blank to keep saved value' : 'optional'}</small></span>
              <input type="password" value={form.passphrase} onChange={(e) => update('passphrase', e.target.value)} autoComplete="new-password" />
            </label>
          </div>
        )}

        {form.authMethod === 'password' && (
          <label>
            <span>SSH password <small>{host?.hasPassword ? 'leave blank to keep saved value' : ''}</small></span>
            <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} autoComplete="new-password" required={!host?.hasPassword} />
          </label>
        )}

        <div className="divider" />

        <div className="form-grid two-columns">
          <label>
            <span>Codex command</span>
            <input value={form.codexCommand} onChange={(e) => update('codexCommand', e.target.value)} placeholder="codex" required />
            <small>Use a full path if Codex is not on the login shell PATH.</small>
          </label>
          <label>
            <span>Default project directory</span>
            <input value={form.defaultCwd} onChange={(e) => update('defaultCwd', e.target.value)} placeholder="/root/my-project" required />
            <small>This absolute path exists on the VPS, not your PC. It is required for new tasks.</small>
          </label>
          <label className="span-two">
            <span>Expected SSH SHA-256 fingerprint <small>optional</small></span>
            <input value={form.expectedFingerprint} onChange={(e) => update('expectedFingerprint', e.target.value)} placeholder="SHA256:AbCd…" />
            <small>Leave blank to verify it on first connection, or get it from a trusted VPS console using <code>ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256</code>.</small>
          </label>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : host ? 'Save changes' : 'Add host'}</button>
        </div>
      </form>
    </div>
  );
}
