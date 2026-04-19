import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TEMPLATES } from '../templates';
import { TemplatePreviewModal } from '../components/TemplatePreviewModal';
import type { Template } from '../types';

export function HomePage() {
  const navigate = useNavigate();
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-peach via-cream to-sky p-8 sm:p-14">
        <div className="pattern-dot absolute inset-0 opacity-30" />
        <div className="relative flex flex-col sm:flex-row items-center gap-8">
          <div className="flex-1 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 backdrop-blur text-xs tracking-widest">
              <span>🐣</span>
              <span>BABYBOOK · 让每一张照片成为回忆</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight font-bold text-neutral-800">
              一键把宝宝照片
              <br />
              变成<span className="text-rose">精美画册</span>
            </h1>
            <p className="text-neutral-700 max-w-md leading-relaxed">
              挑选一组宝宝照片，选择你喜欢的模板，几秒钟内就能得到一本温馨精致的电子画册，
              可翻阅、可分享、可留存。
            </p>
            <div className="flex gap-3 pt-2">
              <Link
                to="/create"
                className="px-6 py-3 rounded-full bg-neutral-900 text-white hover:opacity-90 transition shadow-lg shadow-rose/20"
              >
                立即创建
              </Link>
              <Link
                to="/my"
                className="px-6 py-3 rounded-full bg-white/70 backdrop-blur border border-white hover:bg-white transition"
              >
                我的画册
              </Link>
            </div>
          </div>
          <div className="flex-1 relative h-[280px] sm:h-[320px] w-full">
            <FakeBookPreview />
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
          <h2 className="font-display text-2xl font-bold">热门模板</h2>
          <Link to="/templates" className="text-sm text-neutral-600 hover:text-neutral-900">
            查看全部 →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {TEMPLATES.slice(0, 8).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPreviewTpl(t)}
              className="group block text-left rounded-xl overflow-hidden border border-black/5 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition focus:outline-none focus:ring-2 focus:ring-rose/50"
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
              <div className="px-3 py-2 text-xs flex items-center justify-between">
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

      <footer className="mt-16 text-center text-xs text-neutral-500">
        © {new Date().getFullYear()} BabyBook · 用心记录宝宝的每一个瞬间
      </footer>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-black/5 shadow-sm">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-bold mb-1">{title}</div>
      <div className="text-sm text-neutral-600 leading-relaxed">{text}</div>
    </div>
  );
}

function FakeBookPreview() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative">
        <div className="w-44 h-56 sm:w-52 sm:h-64 rounded-md shadow-book bg-white rotate-[-8deg] absolute left-0 top-3 flex items-center justify-center text-4xl">
          🌸
        </div>
        <div className="w-44 h-56 sm:w-52 sm:h-64 rounded-md shadow-book bg-gradient-to-br from-peach to-rose rotate-[3deg] absolute left-8 top-0 flex items-center justify-center text-5xl">
          👶
        </div>
        <div className="w-44 h-56 sm:w-52 sm:h-64 rounded-md shadow-book bg-white rotate-[10deg] absolute left-20 top-4 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl">✿</div>
            <div className="font-display font-bold text-lg mt-2">Sweet</div>
            <div className="font-display italic text-sm">Moments</div>
          </div>
        </div>
      </div>
    </div>
  );
}
