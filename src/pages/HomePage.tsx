import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TEMPLATES } from '../templates';
import { TemplatePreviewModal } from '../components/TemplatePreviewModal';
import { SITE_THEMES, useSiteTheme, type SiteThemeId } from '../siteTheme';
import type { Template } from '../types';

export function HomePage() {
  const navigate = useNavigate();
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);
  const { theme, setTheme } = useSiteTheme();
  const isCyberpunk = theme === 'cyberpunk';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* 站点风格挑选条 */}
      <section className="mb-6">
        <div
          className="rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 bb-card"
        >
          <div className="flex-shrink-0">
            <div
              className="text-[10px] tracking-[0.3em]"
              style={{ color: 'var(--bb-fg-muted)' }}
            >
              SITE STYLE · 选择你喜欢的整站风格
            </div>
            <div
              className="font-display text-base sm:text-lg"
              style={{ color: 'var(--bb-fg)' }}
            >
              当前风格：
              <span
                className={isCyberpunk ? 'bb-neon-text font-bold' : 'font-bold'}
                style={
                  isCyberpunk
                    ? undefined
                    : { color: 'var(--bb-primary)' }
                }
              >
                {SITE_THEMES.find((t) => t.id === theme)?.name}
              </span>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {SITE_THEMES.map((t) => (
              <ThemePickerChip
                key={t.id}
                id={t.id}
                name={t.name}
                emoji={t.emoji}
                swatch={t.swatch}
                active={t.id === theme}
                onPick={setTheme}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-3xl p-8 sm:p-14"
        style={{
          background: `linear-gradient(135deg, var(--bb-hero-from) 0%, var(--bb-hero-via) 50%, var(--bb-hero-to) 100%)`,
          border: '1px solid var(--bb-border)',
          boxShadow: isCyberpunk
            ? '0 0 0 1px rgba(255,43,214,0.35), 0 25px 80px -30px rgba(34,211,238,0.6)'
            : undefined,
        }}
      >
        <div className="pattern-dot absolute inset-0 opacity-20" />
        <div className="relative flex flex-col sm:flex-row items-center gap-8">
          <div className="flex-1 space-y-5">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs tracking-widest bb-pill"
            >
              <span>{isCyberpunk ? '⚡' : '🐣'}</span>
              <span>
                {isCyberpunk
                  ? 'BABYBOOK.EXE · 让每一帧回忆都有霓虹'
                  : 'BABYBOOK · 让每一张照片成为回忆'}
              </span>
            </div>
            <h1
              className="font-display text-4xl sm:text-5xl leading-tight font-bold"
              style={{ color: 'var(--bb-fg)' }}
            >
              {isCyberpunk ? (
                <>
                  <span className="bb-neon-text-cyan">一键</span>把宝宝照片
                  <br />
                  变成
                  <span className="bb-neon-text">赛博画册</span>
                </>
              ) : (
                <>
                  一键把宝宝照片
                  <br />
                  变成
                  <span style={{ color: 'var(--bb-primary)' }}>精美画册</span>
                </>
              )}
            </h1>
            <p
              className="max-w-md leading-relaxed"
              style={{ color: 'var(--bb-fg-muted)' }}
            >
              {isCyberpunk
                ? '挑选一组宝宝照片，选择喜欢的模板，几秒钟便得一本未来感十足的电子画册 —— 可翻阅、可分享、可留存。'
                : '挑选一组宝宝照片，选择你喜欢的模板，几秒钟内就能得到一本温馨精致的电子画册，可翻阅、可分享、可留存。'}
            </p>
            <div className="flex gap-3 pt-2">
              <Link
                to="/create"
                className="px-6 py-3 rounded-full transition bb-btn-primary hover:opacity-90"
              >
                立即创建
              </Link>
              <Link
                to="/my"
                className="px-6 py-3 rounded-full transition bb-btn-ghost"
              >
                我的画册
              </Link>
            </div>
          </div>
          <div className="flex-1 relative h-[280px] sm:h-[320px] w-full">
            <FakeBookPreview neon={isCyberpunk} />
          </div>
        </div>
      </section>

      {/* 特性 */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
        <Feature
          icon="🖼️"
          title="10+ 精美模板"
          text="温馨手绘、萌趣卡通、清新文艺、复古胶片、节日主题全覆盖"
        />
        <Feature
          icon="✨"
          title="智能自动排版"
          text="根据照片横竖与数量，自动匹配单图、拼贴、九宫格版式"
        />
        <Feature
          icon="🔒"
          title="本地隐私保护"
          text="照片在你的浏览器内处理，不上传服务器，宝宝肖像更安心"
        />
      </section>

      {/* 模板预览 */}
      <section className="mt-10">
        <div className="flex items-end justify-between mb-4">
          <h2
            className="font-display text-2xl font-bold"
            style={{ color: 'var(--bb-fg)' }}
          >
            热门模板
          </h2>
          <Link
            to="/templates"
            className="text-sm hover:underline"
            style={{ color: 'var(--bb-link)' }}
          >
            查看全部 →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {TEMPLATES.slice(0, 8).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPreviewTpl(t)}
              className="group block text-left rounded-xl overflow-hidden bb-card hover:-translate-y-0.5 transition focus:outline-none"
              title={`预览模板「${t.name}」`}
            >
              <div
                className="relative aspect-[3/4] flex flex-col items-center justify-center p-4 text-center"
                style={{
                  background: t.backgroundPattern
                    ? `${t.backgroundPattern}, ${t.colors.paper}`
                    : t.colors.paper,
                  color: t.colors.text,
                }}
              >
                <div className="text-3xl mb-2" style={{ color: t.colors.primary }}>
                  {t.decorations[0]}
                </div>
                <div
                  className="font-bold text-sm"
                  style={{ color: t.colors.primary, fontFamily: t.fontFamily.title }}
                >
                  {t.defaultTitle}
                </div>
                <div className="text-[10px] mt-1 opacity-70">{t.defaultSubtitle}</div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition">
                  <span className="opacity-0 group-hover:opacity-100 transition px-3 py-1.5 rounded-full bg-white/90 text-neutral-900 text-xs font-medium shadow">
                    预览效果 →
                  </span>
                </div>
              </div>
              <div
                className="px-3 py-2 text-xs flex items-center justify-between"
                style={{ color: 'var(--bb-fg)' }}
              >
                <span className="font-medium">{t.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    t.isFree ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {t.isFree ? '免费' : 'VIP'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <TemplatePreviewModal
        template={previewTpl}
        onClose={() => setPreviewTpl(null)}
        onUse={(tpl) => {
          setPreviewTpl(null);
          navigate(`/create?templateId=${encodeURIComponent(tpl.id)}`);
        }}
      />

      <footer
        className="mt-16 text-center text-xs"
        style={{ color: 'var(--bb-fg-muted)' }}
      >
        © {new Date().getFullYear()} BabyBook · 用心记录宝宝的每一个瞬间
      </footer>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl p-5 bb-card">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-bold mb-1" style={{ color: 'var(--bb-fg)' }}>
        {title}
      </div>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--bb-fg-muted)' }}>
        {text}
      </div>
    </div>
  );
}

function ThemePickerChip({
  id,
  name,
  emoji,
  swatch,
  active,
  onPick,
}: {
  id: SiteThemeId;
  name: string;
  emoji: string;
  swatch: [string, string, string];
  active: boolean;
  onPick: (id: SiteThemeId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(id)}
      className="flex items-center gap-2 px-3 py-2 rounded-full border transition whitespace-nowrap"
      style={{
        borderColor: active ? 'var(--bb-primary)' : 'var(--bb-border)',
        background: active ? 'var(--bb-pill-bg)' : 'var(--bb-surface)',
        color: 'var(--bb-fg)',
        boxShadow: active ? '0 0 0 2px var(--bb-primary) inset' : undefined,
      }}
      title={`切换为「${name}」`}
    >
      <span
        className="w-5 h-5 rounded-full border"
        style={{
          background: `linear-gradient(135deg, ${swatch[0]} 0%, ${swatch[1]} 50%, ${swatch[2]} 100%)`,
          borderColor: 'var(--bb-border)',
        }}
      />
      <span className="text-xs">{emoji}</span>
      <span className="text-xs font-medium">{name}</span>
    </button>
  );
}

function FakeBookPreview({ neon = false }: { neon?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative">
        <div
          className="w-44 h-56 sm:w-52 sm:h-64 rounded-md shadow-book rotate-[-8deg] absolute left-0 top-3 flex items-center justify-center text-4xl"
          style={{
            background: neon
              ? 'linear-gradient(135deg, #0b0420 0%, #1a0730 100%)'
              : '#fff',
            boxShadow: neon
              ? '0 0 0 1px rgba(34,211,238,0.45), 0 20px 50px -20px rgba(34,211,238,0.6)'
              : undefined,
            color: neon ? '#22d3ee' : undefined,
          }}
        >
          {neon ? '◬' : '🌸'}
        </div>
        <div
          className="w-44 h-56 sm:w-52 sm:h-64 rounded-md shadow-book rotate-[3deg] absolute left-8 top-0 flex items-center justify-center text-5xl"
          style={{
            background: neon
              ? 'linear-gradient(135deg, #ff2bd6 0%, #7c3aed 100%)'
              : 'linear-gradient(135deg, #F8D5C2 0%, #E8A4A0 100%)',
            boxShadow: neon
              ? '0 0 0 1px rgba(255,43,214,0.7), 0 25px 60px -20px rgba(255,43,214,0.65)'
              : undefined,
          }}
        >
          👶
        </div>
        <div
          className="w-44 h-56 sm:w-52 sm:h-64 rounded-md shadow-book rotate-[10deg] absolute left-20 top-4 flex items-center justify-center"
          style={{
            background: neon ? '#08131c' : '#fff',
            boxShadow: neon
              ? '0 0 0 1px rgba(255,43,214,0.35), 0 20px 50px -20px rgba(255,43,214,0.45)'
              : undefined,
            color: neon ? '#f4f6ff' : undefined,
          }}
        >
          <div className="text-center">
            <div className="text-3xl" style={neon ? { color: '#ff2bd6' } : undefined}>
              {neon ? '⌁' : '✿'}
            </div>
            <div
              className={`font-display font-bold text-lg mt-2 ${neon ? 'bb-neon-text-cyan' : ''}`}
            >
              {neon ? 'NEON' : 'Sweet'}
            </div>
            <div
              className={`font-display italic text-sm ${neon ? 'bb-neon-text' : ''}`}
            >
              {neon ? 'Baby.exe' : 'Moments'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
