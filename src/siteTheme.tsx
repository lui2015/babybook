import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * 站点级主题（整站外壳的视觉风格）
 *
 *  - 与 Book/Template 的「画册级主题」完全独立：它只改 Header / HomePage / MyBooksPage
 *    等框架页面的视觉，不影响每本画册的内页样式（那是 Template + book.theme 管的）。
 *  - 实现方式：在根节点写 `data-site-theme="xxx"`，由 CSS 变量驱动配色/辉光/字体。
 *  - 预设覆盖：cyberpunk（默认）/ soft（原温馨风）/ dark / sakura。
 *  - 选择持久化到 localStorage（key: babybook.siteTheme.v1）。
 */

export type SiteThemeId = 'cyberpunk' | 'soft' | 'dark' | 'sakura';

export interface SiteThemeMeta {
  id: SiteThemeId;
  name: string;
  /** 一句话介绍 */
  tagline: string;
  /** 卡片的三色渐变，用于主题选择器的预览 swatch */
  swatch: [string, string, string];
  /** emoji 标识 */
  emoji: string;
}

export const SITE_THEMES: SiteThemeMeta[] = [
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    tagline: '霓虹夜色 · 电子光晕',
    swatch: ['#0b0420', '#ff2bd6', '#22d3ee'],
    emoji: '🌃',
  },
  {
    id: 'soft',
    name: '温馨奶油',
    tagline: '柔光日系 · 治愈粉橘',
    swatch: ['#fff7ed', '#fef2f2', '#f5f3ff'],
    emoji: '🍼',
  },
  {
    id: 'dark',
    name: '深夜剧场',
    tagline: '极简深色 · 金属描边',
    swatch: ['#0f172a', '#1e293b', '#f59e0b'],
    emoji: '🎬',
  },
  {
    id: 'sakura',
    name: '樱花和风',
    tagline: '春日粉白 · 和纸质感',
    swatch: ['#ffeef3', '#ffd0df', '#c084fc'],
    emoji: '🌸',
  },
];

export const DEFAULT_SITE_THEME: SiteThemeId = 'cyberpunk';

const STORAGE_KEY = 'babybook.siteTheme.v1';

// —————————————————————————————————————————————————————————————
// Context
// —————————————————————————————————————————————————————————————

interface SiteThemeCtx {
  theme: SiteThemeId;
  meta: SiteThemeMeta;
  setTheme: (id: SiteThemeId) => void;
}

const SiteThemeContext = createContext<SiteThemeCtx | null>(null);

function readInitial(): SiteThemeId {
  if (typeof window === 'undefined') return DEFAULT_SITE_THEME;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && SITE_THEMES.some((t) => t.id === v)) return v as SiteThemeId;
  } catch {
    /* ignore */
  }
  return DEFAULT_SITE_THEME;
}

export function SiteThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<SiteThemeId>(() => readInitial());

  // 将主题 id 写到 <html> 和 <body> 上，CSS 端靠 [data-site-theme] 匹配
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-site-theme', theme);
    document.body.setAttribute('data-site-theme', theme);
  }, [theme]);

  const setTheme = useCallback((id: SiteThemeId) => {
    setThemeState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const meta = useMemo(
    () => SITE_THEMES.find((t) => t.id === theme) ?? SITE_THEMES[0],
    [theme],
  );

  const value = useMemo<SiteThemeCtx>(
    () => ({ theme, meta, setTheme }),
    [theme, meta, setTheme],
  );

  return <SiteThemeContext.Provider value={value}>{children}</SiteThemeContext.Provider>;
}

export function useSiteTheme(): SiteThemeCtx {
  const ctx = useContext(SiteThemeContext);
  if (!ctx) throw new Error('useSiteTheme must be used inside <SiteThemeProvider>');
  return ctx;
}
