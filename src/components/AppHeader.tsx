import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { SITE_THEMES, useSiteTheme, type SiteThemeId } from '../siteTheme';

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
