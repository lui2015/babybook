// 账号对话框：升级为正式账号 / 登录已有账号
// ----------------------------------------------------------------
// 触发场景：
//   - 匿名身份下，从 UserMenu 点击「升级为正式账号」 -> mode='upgrade'
//   - 匿名身份下，从 UserMenu 点击「登录已有账号」     -> mode='signin'
//
// 升级（upgrade）：直接调 AuthContext.upgradeToAccount，
//   把当前匿名 uid 注册成 username/password 账号，云端数据原地继承。
// 登录（signin）：直接调 AuthContext.signInWithUsername，
//   切换到指定账号，看到该账号下的云端画册。
//   ⚠️ 注意：登录会丢弃当前匿名 session 上的本地访问权（对应 uid 的云端数据
//   依然存在，只是这个浏览器再切换不到它了），所以要给用户明确提示。
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';

type Mode = 'upgrade' | 'signin';

interface Props {
  /** 默认初始 tab；undefined 表示不显示 */
  initialMode: Mode | null;
  onClose: () => void;
}

const USERNAME_RE = /^[A-Za-z0-9_]{5,24}$/;

export function AccountDialog({ initialMode, onClose }: Props) {
  const { user, upgradeToAccount, signInWithUsername } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode ?? 'upgrade');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 切换 mode 时清错；外部重新打开时重置
  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
      setError(null);
      setSubmitting(false);
    }
  }, [initialMode]);

  // ESC 关闭
  useEffect(() => {
    if (!initialMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [initialMode, submitting, onClose]);

  if (!initialMode) return null;

  function validate(): string | null {
    if (!USERNAME_RE.test(username.trim())) {
      return '用户名需为 5-24 位字母、数字或下划线';
    }
    if (password.length < 6) {
      return '密码至少 6 位';
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'upgrade') {
        await upgradeToAccount({
          username: username.trim(),
          password,
          nickname: nickname.trim() || undefined,
        });
      } else {
        await signInWithUsername({
          username: username.trim(),
          password,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || (mode === 'upgrade' ? '注册失败' : '登录失败'));
    } finally {
      setSubmitting(false);
    }
  }

  const isUpgrade = mode === 'upgrade';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ background: 'rgba(15,23,42,0.45)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-sm rounded-2xl p-5 bb-card my-auto"
        style={{ background: 'var(--bb-card-bg)' }}
      >
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 p-1 rounded-full bb-pill">
          <button
            type="button"
            onClick={() => {
              setMode('upgrade');
              setError(null);
            }}
            className="flex-1 px-3 py-1.5 rounded-full text-sm transition"
            style={{
              background: isUpgrade ? 'var(--bb-btn-bg)' : 'transparent',
              color: isUpgrade ? '#fff' : 'var(--bb-fg-muted)',
            }}
          >
            升级为正式账号
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
            className="flex-1 px-3 py-1.5 rounded-full text-sm transition"
            style={{
              background: !isUpgrade ? 'var(--bb-btn-bg)' : 'transparent',
              color: !isUpgrade ? '#fff' : 'var(--bb-fg-muted)',
            }}
          >
            登录已有账号
          </button>
        </div>

        {/* Header */}
        <div className="mb-3">
          <h2
            className="font-display text-lg leading-tight"
            style={{ color: 'var(--bb-fg)' }}
          >
            {isUpgrade ? '把当前画册绑定到正式账号' : '登录已有账号'}
          </h2>
          <p
            className="mt-1 text-xs leading-relaxed"
            style={{ color: 'var(--bb-fg-muted)' }}
          >
            {isUpgrade
              ? '设置一个用户名和密码，当前云端画册会无缝继承，可以在其他设备登录访问。'
              : '换一台设备/浏览器，输入注册时设置的用户名和密码，恢复你的云端画册。注意：登录后将不再访问当前浏览器的匿名画册。'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label
              className="block text-[11px] mb-1 tracking-wider"
              style={{ color: 'var(--bb-fg-muted)' }}
            >
              用户名
            </label>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="5-24 位字母/数字/下划线"
              disabled={submitting}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
              style={{
                background: 'var(--bb-input-bg, #fff)',
                borderColor: 'var(--bb-border)',
                color: 'var(--bb-fg)',
              }}
            />
          </div>

          <div>
            <label
              className="block text-[11px] mb-1 tracking-wider"
              style={{ color: 'var(--bb-fg-muted)' }}
            >
              密码
            </label>
            <input
              type="password"
              autoComplete={isUpgrade ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              disabled={submitting}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
              style={{
                background: 'var(--bb-input-bg, #fff)',
                borderColor: 'var(--bb-border)',
                color: 'var(--bb-fg)',
              }}
            />
          </div>

          {isUpgrade && (
            <div>
              <label
                className="block text-[11px] mb-1 tracking-wider"
                style={{ color: 'var(--bb-fg-muted)' }}
              >
                昵称（可选）
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={user?.displayName ?? ''}
                disabled={submitting}
                className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                style={{
                  background: 'var(--bb-input-bg, #fff)',
                  borderColor: 'var(--bb-border)',
                  color: 'var(--bb-fg)',
                }}
              />
            </div>
          )}

          {error && (
            <div
              className="text-xs rounded-lg px-3 py-2"
              style={{
                background: 'rgba(239,68,68,0.08)',
                color: '#dc2626',
              }}
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-3 py-2 rounded-xl text-sm bb-pill"
              style={{ color: 'var(--bb-fg-muted)' }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-3 py-2 rounded-xl text-sm bb-btn-primary"
            >
              {submitting
                ? '处理中…'
                : isUpgrade
                  ? '注册并绑定'
                  : '登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
