import { Link, NavLink, useLocation } from 'react-router-dom';

export function AppHeader() {
  const { pathname } = useLocation();
  const compact = pathname.startsWith('/book/');

  return (
    <header
      className={`sticky top-0 z-30 backdrop-blur-md bg-white/60 border-b border-black/5 ${
        compact ? 'py-2' : 'py-3'
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose to-peach flex items-center justify-center text-white text-lg">
            🐣
          </div>
          <div>
            <div className="font-display text-lg leading-none">BabyBook</div>
            <div className="text-[10px] tracking-[0.3em] text-neutral-500">宝宝画册</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <NavItem to="/">首页</NavItem>
          <NavItem to="/templates">模板</NavItem>
          <NavItem to="/create">创建画册</NavItem>
          <NavItem to="/my">我的画册</NavItem>
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
        `px-3 py-1.5 rounded-full transition ${
          isActive
            ? 'bg-neutral-900 text-white'
            : 'text-neutral-600 hover:bg-neutral-900/5'
        }`
      }
    >
      {children}
    </NavLink>
  );
}
