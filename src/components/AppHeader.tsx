import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SITE_THEMES, useSiteTheme, type SiteThemeId } from '../siteTheme';
import { useAuth } from '../AuthContext';
import { AccountDialog } from './AccountDialog';

export function AppHeader() {
  const { pathname } = useLocation();
  const compact = pathname.startsWith('/book/');

  return (
    <header
      className={`sticky top-0 z-30 backdrop-blur-md border-b ${
        compact ? 'py-2' : 'py-3'
      }`}
      style={{
        background: 'var(--bb-header-bg)',
        borderColor: 'var(--bb-header-border)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg"
            style={{ background: 'var(--bb-btn-bg)' }}
          >
            🐣
          </div>
          <div>
            <div
              className="font-display text-lg leading-none"
              style={{ color: 'var(--bb-fg)' }}
            >
              BabyBook
            </div>
            <div
              className="text-[10px] tracking-[0.3em]"
              style={{ color: 'var(--bb-fg-muted)' }}
            >
              宝宝画册
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavItem to="/">首页</NavItem>
          <NavItem to="/templates">模板</NavItem>
          <NavItem to="/create">创建画册</NavItem>
          <NavItem to="/my">我的画册</NavItem>
          <ThemeSwitcher />
          <UserMenu />
        </nav>
      </div>
    </header>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-full transition ${isActive ? 'bb-btn-primary' : ''}`
      }
      style={({ isActive }) =>
        isActive
          ? undefined
          : { color: 'var(--bb-fg-muted)' }
      }
    >
      {children}
    </NavLink>
  );
}

/**
 * 站点风格切换器（Header 右侧下拉）
 * - 点击打开面板，展示 4 个预设预览 swatch + 名称
 * - 选中即时生效（CSS 变量切换），同时持久化
 */
function ThemeSwitcher() {
  const { theme, meta, setTheme } = useSiteTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(id: SiteThemeId) {
    setTheme(id);
    setOpen(false);
  }

  return (
    <div className="relative ml-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 bb-pill"
        title="切换站点风格"
      >
        <span>{meta.emoji}</span>
        <span className="hidden sm:inline">{meta.name}</span>
        <span className="opacity-60">▾</span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-2xl p-2 bb-card z-40"
          role="menu"
        >
          <div
            className="px-3 pt-2 pb-1 text-[10px] tracking-[0.25em]"
            style={{ color: 'var(--bb-fg-muted)' }}
          >
            站点风格
          </div>
          {SITE_THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => choose(t.id)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition"
                style={{
                  background: active ? 'var(--bb-pill-bg)' : 'transparent',
                  color: 'var(--bb-fg)',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--bb-pill-bg)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex-shrink-0 border"
                  style={{
                    background: `linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[1]} 50%, ${t.swatch[2]} 100%)`,
                    borderColor: 'var(--bb-border)',
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <span>{t.emoji}</span>
                    <span>{t.name}</span>
                  </div>
                  <div
                    className="text-[11px] truncate"
                    style={{ color: 'var(--bb-fg-muted)' }}
                  >
                    {t.tagline}
                  </div>
                </div>
                {active && (
                  <span
                    className="text-xs"
                    style={{ color: 'var(--bb-primary)' }}
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 用户菜单（匿名 + 正式账号 双形态）
 * - 匿名：展示"云端账户 #xxxx"，菜单里有【升级为正式账号】【登录已有账号】【重置账户】
 * - 正式：展示用户名/昵称，菜单里有【我的画册】【退出登录】
 */
function UserMenu() {
  const { user, loading, resetAccount, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'upgrade' | 'signin' | null>(
    null,
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 加载中：占位避免抖动
  if (loading || !user) {
    return (
      <span
        className="ml-1 px-3 py-1.5 rounded-full text-xs opacity-50"
        style={{ color: 'var(--bb-fg-muted)' }}
      >
        ···
      </span>
    );
  }

  const displayName = user.displayName;
  const initial =
    (user.username?.[0] || displayName).replace(/[^A-Za-z0-9#\u4e00-\u9fa5]/g, '').slice(0, 1) ||
    (user.isAnonymous ? '☁' : '👤');

  async function onReset() {
    setOpen(false);
    const ok = window.confirm(
      '重置云端账户后，当前浏览器会换一个全新的云端身份，' +
        '之前保存的画册在这个浏览器里将不再可见（云端数据不会被立即删除）。\n\n' +
        '确定继续？',
    );
    if (!ok) return;
    await resetAccount();
  }

  async function onSignOut() {
    setOpen(false);
    const ok = window.confirm(
      '退出登录后，当前浏览器会回到匿名状态，看不到这个账号下的画册。\n下次仍可用同一用户名/密码登录回来。\n\n确定退出？',
    );
    if (!ok) return;
    await signOut();
  }

  function openDialog(mode: 'upgrade' | 'signin') {
    setOpen(false);
    setDialogMode(mode);
  }

  return (
    <>
      <div className="relative ml-1" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bb-pill text-xs"
          title={displayName}
        >
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold"
            style={{ background: 'var(--bb-btn-bg)' }}
          >
            {initial}
          </span>
          <span className="hidden sm:inline max-w-[8rem] truncate">
            {displayName}
          </span>
          <span className="opacity-60">▾</span>
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-64 rounded-2xl p-2 bb-card z-40">
            <div
              className="px-3 pt-2 pb-1 text-[10px] tracking-[0.25em]"
              style={{ color: 'var(--bb-fg-muted)' }}
            >
              {user.isAnonymous ? '云端账户（匿名）' : '当前账号'}
            </div>
            <div
              className="px-3 pb-1 text-sm truncate"
              style={{ color: 'var(--bb-fg)' }}
            >
              {displayName}
            </div>
            <div
              className="px-3 pb-2 text-[11px] leading-relaxed"
              style={{ color: 'var(--bb-fg-muted)' }}
            >
              {user.isAnonymous ? (
                <>
                  画册自动保存在云端，
                  <br />
                  下次用同一浏览器打开仍可见。
                  <br />
                  <span style={{ color: 'var(--bb-primary)' }}>
                    升级为正式账号后，可在其他设备登录。
                  </span>
                </>
              ) : (
                <>已登录，画册在所有设备同步。</>
              )}
            </div>
            <div
              className="my-1 h-px"
              style={{ background: 'var(--bb-border)' }}
            />

            <MenuButton
              onClick={() => {
                setOpen(false);
                navigate('/my');
              }}
            >
              我的画册
            </MenuButton>

            {user.isAnonymous ? (
              <>
                <MenuButton
                  onClick={() => openDialog('upgrade')}
                  highlight
                >
                  升级为正式账号
                </MenuButton>
                <MenuButton onClick={() => openDialog('signin')}>
                  登录已有账号
                </MenuButton>
                <MenuButton onClick={onReset} danger>
                  重置账户
                </MenuButton>
              </>
            ) : (
              <MenuButton onClick={onSignOut} danger>
                退出登录
              </MenuButton>
            )}
          </div>
        )}
      </div>
      <AccountDialog
        initialMode={dialogMode}
        onClose={() => setDialogMode(null)}
      />
    </>
  );
}

function MenuButton({
  children,
  onClick,
  danger,
  highlight,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  highlight?: boolean;
}) {
  const color = danger
    ? '#dc2626'
    : highlight
      ? 'var(--bb-primary, var(--bb-fg))'
      : 'var(--bb-fg)';
  const hoverBg = danger ? 'rgba(239,68,68,0.08)' : 'var(--bb-pill-bg)';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-xl text-sm transition"
      style={{
        color,
        fontWeight: highlight ? 600 : undefined,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}
