import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SITE_THEMES, useSiteTheme, type SiteThemeId } from '../siteTheme';
import { useAuth } from '../AuthContext';
import { AccountDialog } from './AccountDialog';

/**
 * 站点顶部导航。
 * - 桌面（>=md, 768px）：完整水平导航 + 主题切换 + 登录/注册 + 用户菜单
 * - 移动（<md）：左侧 Logo + 右侧汉堡按钮，点开抽屉，所有入口纵向陈列
 */
export function AppHeader() {
  const { pathname } = useLocation();
  const compact = pathname.startsWith('/book/');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 切换路由后自动关抽屉，避免用户点了链接还看到抽屉
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

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
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg shrink-0"
            style={{ background: 'var(--bb-btn-bg)' }}
          >
            🐣
          </div>
          <div className="min-w-0">
            <div
              className="font-display text-lg leading-none truncate"
              style={{ color: 'var(--bb-fg)' }}
            >
              BabyBook
            </div>
            <div
              className="text-[10px] tracking-[0.3em] truncate"
              style={{ color: 'var(--bb-fg-muted)' }}
            >
              宝宝画册
            </div>
          </div>
        </Link>

        {/* 桌面导航 */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <NavItem to="/">首页</NavItem>
          <NavItem to="/templates">模板</NavItem>
          <NavItem to="/create">创建画册</NavItem>
          <NavItem to="/my">我的画册</NavItem>
          <ThemeSwitcher />
          <UserMenu />
        </nav>

        {/* 移动端：汉堡按钮 */}
        <button
          type="button"
          aria-label="菜单"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full bb-pill"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M3 6h18M3 12h18M3 18h18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* 移动端抽屉 */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
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
 * 移动端抽屉：覆盖屏幕右侧，纵向陈列所有入口。
 * - 含完整导航、主题切换、登录/注册按钮、用户菜单条目
 * - 关闭方式：点遮罩 / 按 Esc / 点链接（路由变化时自动关）
 */
function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { user, signOut, resetAccount } = useAuth();
  const { theme, setTheme } = useSiteTheme();
  const [dialogMode, setDialogMode] = useState<'upgrade' | 'signin' | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  function go(to: string) {
    onClose();
    navigate(to);
  }

  async function onSignOut() {
    onClose();
    if (
      window.confirm(
        '退出登录后，当前浏览器会回到匿名状态，看不到这个账号下的画册。\n下次仍可用同一用户名/密码登录回来。\n\n确定退出？',
      )
    ) {
      await signOut();
    }
  }

  async function onReset() {
    onClose();
    if (
      window.confirm(
        '重置云端账户后，当前浏览器会换一个全新的云端身份，' +
          '之前保存的画册在这个浏览器里将不再可见（云端数据不会被立即删除）。\n\n确定继续？',
      )
    ) {
      await resetAccount();
    }
  }

  // 把抽屉渲染到 document.body：彻底脱离 <header> 的 stacking context
  // （header 上的 sticky + backdrop-blur 会把内部 z-index 锁在 z-30 这个层），
  // 否则即使 aside 设了 z-50，也只能在 header 内部生效，仍可能被首页 Hero 等
  // 设了较高 z-index 的元素盖住，造成「抽屉看似在那里、却点不到下拉项」。
  const overlay = (
    <>
      <div
        className={`md:hidden fixed inset-0 z-[100] transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`md:hidden fixed right-0 top-0 bottom-0 z-[101] w-[82%] max-w-[340px] flex flex-col transition-transform bb-overlay-safe-top bb-safe-bottom ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          background: 'var(--bb-surface-strong)',
          borderLeft: '1px solid var(--bb-border)',
          color: 'var(--bb-fg)',
        }}
        role="dialog"
        aria-label="主导航"
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--bb-border)' }}
        >
          <span className="font-display text-base">菜单</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="w-9 h-9 rounded-full flex items-center justify-center bb-pill"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {/* 用户区 */}
          <div
            className="rounded-2xl p-3"
            style={{
              background: 'var(--bb-pill-bg)',
              border: '1px solid var(--bb-border)',
            }}
          >
            {!user || user.isAnonymous ? (
              <>
                <div
                  className="text-xs mb-2"
                  style={{ color: 'var(--bb-fg-muted)' }}
                >
                  {user?.isAnonymous
                    ? '当前为匿名云端账户，画册会保存在这个浏览器；登录或注册后可在多设备访问。'
                    : '尚未连接云端账户'}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setDialogMode('signin');
                    }}
                    className="flex-1 px-3 py-2 rounded-full text-sm bb-pill"
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setDialogMode('upgrade');
                    }}
                    className="flex-1 px-3 py-2 rounded-full text-sm bb-btn-primary"
                  >
                    注册
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                  style={{ background: 'var(--bb-btn-bg)' }}
                >
                  {(user.username?.[0] || user.displayName[0] || '👤').toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{user.displayName}</div>
                  <div
                    className="text-[11px] truncate"
                    style={{ color: 'var(--bb-fg-muted)' }}
                  >
                    已登录，画册多设备同步
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ color: '#dc2626' }}
                >
                  退出
                </button>
              </div>
            )}
          </div>

          {/* 主导航 */}
          <nav className="flex flex-col">
            <DrawerLink onClick={() => go('/')}>🏠 首页</DrawerLink>
            <DrawerLink onClick={() => go('/templates')}>🎨 模板</DrawerLink>
            <DrawerLink onClick={() => go('/create')}>✨ 创建画册</DrawerLink>
            <DrawerLink onClick={() => go('/my')}>📖 我的画册</DrawerLink>
          </nav>

          {/* 主题 */}
          <div
            className="rounded-2xl p-3"
            style={{ border: '1px solid var(--bb-border)' }}
          >
            <div
              className="text-[10px] tracking-[0.25em] mb-2"
              style={{ color: 'var(--bb-fg-muted)' }}
            >
              站点风格
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SITE_THEMES.map((t) => {
                const active = t.id === theme;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id as SiteThemeId)}
                    className="flex items-center gap-2 px-2 py-2 rounded-xl text-left text-xs"
                    style={{
                      background: active ? 'var(--bb-pill-bg)' : 'transparent',
                      border: '1px solid var(--bb-border)',
                      color: 'var(--bb-fg)',
                    }}
                  >
                    <span
                      className="w-7 h-7 rounded-md shrink-0 border"
                      style={{
                        background: `linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[1]} 50%, ${t.swatch[2]} 100%)`,
                        borderColor: 'var(--bb-border)',
                      }}
                    />
                    <span className="truncate">
                      {t.emoji} {t.name}
                    </span>
                    {active && (
                      <span
                        className="ml-auto text-[10px]"
                        style={{ color: 'var(--bb-primary)' }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 匿名时的额外操作 */}
          {user?.isAnonymous && (
            <div
              className="rounded-2xl p-2"
              style={{ border: '1px solid var(--bb-border)' }}
            >
              <DrawerLink onClick={onReset} danger>
                重置云端账户
              </DrawerLink>
            </div>
          )}
        </div>
      </aside>

      <AccountDialog
        initialMode={dialogMode}
        onClose={() => setDialogMode(null)}
      />
    </>
  );

  // SSR-safe：浏览器环境才用 portal
  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
}

function DrawerLink({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-3 rounded-xl text-sm transition active:scale-[0.98]"
      style={{
        color: danger ? '#dc2626' : 'var(--bb-fg)',
      }}
    >
      {children}
    </button>
  );
}

/**
 * 站点风格切换器（桌面 Header 右侧下拉）
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
        <span className="hidden lg:inline">{meta.name}</span>
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
 * 用户菜单（仅桌面 Header 右侧使用）
 * - 匿名：直接平铺「登录」「注册」两个按钮 + 头像菜单
 * - 正式：头像 + 用户名 + 下拉菜单（我的画册 / 退出登录）
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

  if (loading) {
    return (
      <span
        className="ml-1 px-3 py-1.5 rounded-full text-xs opacity-50"
        style={{ color: 'var(--bb-fg-muted)' }}
      >
        ···
      </span>
    );
  }

  if (!user) {
    return (
      <>
        <div className="ml-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDialogMode('signin')}
            className="px-3 py-1.5 rounded-full text-xs bb-pill"
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setDialogMode('upgrade')}
            className="px-3 py-1.5 rounded-full text-xs bb-btn-primary"
          >
            注册
          </button>
        </div>
        <AccountDialog
          initialMode={dialogMode}
          onClose={() => setDialogMode(null)}
        />
      </>
    );
  }

  const displayName = user.displayName;
  const initial =
    (user.username?.[0] || displayName).replace(/[^A-Za-z0-9#\u4e00-\u9fa5]/g, '').slice(0, 1) ||
    (user.isAnonymous ? '☁' : '👤');

  async function onResetClick() {
    setOpen(false);
    const ok = window.confirm(
      '重置云端账户后，当前浏览器会换一个全新的云端身份，' +
        '之前保存的画册在这个浏览器里将不再可见（云端数据不会被立即删除）。\n\n' +
        '确定继续？',
    );
    if (!ok) return;
    await resetAccount();
  }

  async function onSignOutClick() {
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
      {user.isAnonymous && (
        <div className="ml-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => openDialog('signin')}
            className="px-3 py-1.5 rounded-full text-xs bb-pill"
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => openDialog('upgrade')}
            className="px-3 py-1.5 rounded-full text-xs bb-btn-primary"
          >
            注册
          </button>
        </div>
      )}
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
          <span className="hidden lg:inline max-w-[8rem] truncate">
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
                <MenuButton onClick={() => openDialog('upgrade')} highlight>
                  升级为正式账号
                </MenuButton>
                <MenuButton onClick={() => openDialog('signin')}>
                  登录已有账号
                </MenuButton>
                <MenuButton onClick={onResetClick} danger>
                  重置账户
                </MenuButton>
              </>
            ) : (
              <MenuButton onClick={onSignOutClick} danger>
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
