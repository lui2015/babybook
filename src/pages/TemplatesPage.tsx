import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TemplatePreviewModal } from '../components/TemplatePreviewModal';
import { useTemplateRegistry } from '../TemplateRegistry';
import { deleteUserTemplate, isUserTemplateId } from '../userTemplates';
import type { Template, TemplateCategory, TemplateStyle } from '../types';

type PriceFilter = 'all' | 'free' | 'vip';
type SourceFilter = 'all' | 'builtin' | 'mine';

const CATEGORIES: { key: TemplateCategory | 'all'; label: string; emoji: string }[] = [
  { key: 'all', label: '全部', emoji: '✨' },
  { key: '温馨手绘', label: '温馨手绘', emoji: '🎨' },
  { key: '萌趣卡通', label: '萌趣卡通', emoji: '🧸' },
  { key: '清新文艺', label: '清新文艺', emoji: '🌿' },
  { key: '复古胶片', label: '复古胶片', emoji: '📷' },
  { key: '节日主题', label: '节日主题', emoji: '🎉' },
];

const STYLES: { key: TemplateStyle | 'all'; label: string }[] = [
  { key: 'all', label: '全部风格' },
  { key: 'watercolor', label: '水彩手绘' },
  { key: 'cartoon', label: '萌趣卡通' },
  { key: 'minimal', label: '清新极简' },
  { key: 'vintage', label: '复古胶片' },
  { key: 'festival-cn', label: '中国风' },
  { key: 'festival-xmas', label: '圣诞' },
];

const PRICES: { key: PriceFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'free', label: '免费' },
  { key: 'vip', label: 'VIP' },
];

const SOURCES: { key: SourceFilter; label: string; emoji: string }[] = [
  { key: 'all', label: '全部', emoji: '📚' },
  { key: 'builtin', label: '官方模板', emoji: '✨' },
  { key: 'mine', label: '我的模板', emoji: '🎨' },
];

export function TemplatesPage() {
  const navigate = useNavigate();
  const { allTemplates, userTemplates, builtinTemplates, refresh } =
    useTemplateRegistry();
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);

  const [source, setSource] = useState<SourceFilter>('all');
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all');
  const [styleKey, setStyleKey] = useState<TemplateStyle | 'all'>('all');
  const [price, setPrice] = useState<PriceFilter>('all');
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const pool =
      source === 'mine'
        ? userTemplates
        : source === 'builtin'
          ? builtinTemplates
          : allTemplates;
    return pool.filter((t) => {
      if (category !== 'all' && t.category !== category) return false;
      if (styleKey !== 'all' && t.style !== styleKey) return false;
      if (price === 'free' && !t.isFree) return false;
      if (price === 'vip' && t.isFree) return false;
      if (kw) {
        const hay = `${t.name} ${t.description} ${t.defaultTitle} ${t.defaultSubtitle} ${t.category}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [source, allTemplates, builtinTemplates, userTemplates, category, styleKey, price, keyword]);

  const resetFilters = () => {
    setSource('all');
    setCategory('all');
    setStyleKey('all');
    setPrice('all');
    setKeyword('');
  };

  const hasActiveFilter =
    source !== 'all' ||
    category !== 'all' ||
    styleKey !== 'all' ||
    price !== 'all' ||
    keyword.trim().length > 0;

  async function handleDelete(tpl: Template) {
    if (!isUserTemplateId(tpl.id)) return;
    if (!confirm(`确认删除模板「${tpl.name}」？此操作不可撤销。`)) return;
    await deleteUserTemplate(tpl.id);
    await refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* 标题 */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold">全部模板</h1>
          <p className="text-sm text-neutral-600 mt-1">
            共 <span className="font-semibold text-neutral-900">{allTemplates.length}</span> 套模板
            （官方 {builtinTemplates.length} · 自定义 {userTemplates.length}），按分类、风格、价格任意筛选
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索模板名、描述…"
            className="px-4 py-2 rounded-full bg-white border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-rose/50 w-full sm:w-60"
          />
          {hasActiveFilter && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 text-xs rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 whitespace-nowrap"
            >
              清除筛选
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/templates/new')}
            className="px-4 py-2 text-sm rounded-full bg-gradient-to-r from-rose to-peach text-white shadow hover:opacity-90 whitespace-nowrap"
          >
            + 创建自定义模板
          </button>
        </div>
      </div>

      {/* 筛选条 */}
      <div className="space-y-3 mb-6">
        <FilterRow label="来源">
          {SOURCES.map((s) => (
            <Chip key={s.key} active={source === s.key} onClick={() => setSource(s.key)}>
              <span className="mr-1">{s.emoji}</span>
              {s.label}
              {s.key === 'mine' && userTemplates.length > 0 && (
                <span className="ml-1 text-[10px] opacity-70">{userTemplates.length}</span>
              )}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="分类">
          {CATEGORIES.map((c) => (
            <Chip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)}>
              <span className="mr-1">{c.emoji}</span>
              {c.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="风格">
          {STYLES.map((s) => (
            <Chip key={s.key} active={styleKey === s.key} onClick={() => setStyleKey(s.key)}>
              {s.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="价格">
          {PRICES.map((p) => (
            <Chip key={p.key} active={price === p.key} onClick={() => setPrice(p.key)}>
              {p.label}
            </Chip>
          ))}
        </FilterRow>
      </div>

      {/* 结果条数 */}
      <div className="flex items-center justify-between mb-3 text-xs text-neutral-500">
        <div>
          匹配到 <span className="font-semibold text-neutral-900">{filtered.length}</span> 套模板
        </div>
        <div className="hidden sm:block">点击模板预览，满意后即可用它创建画册</div>
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <EmptyState
          source={source}
          onReset={resetFilters}
          onCreate={() => navigate('/templates/new')}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((t) => {
            const isMine = isUserTemplateId(t.id);
            return (
              <article
                key={t.id}
                className="group rounded-xl overflow-hidden border border-black/5 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
              >
                <button
                  type="button"
                  onClick={() => setPreviewTpl(t)}
                  className="block w-full text-left focus:outline-none"
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
                    <div className="absolute top-2 right-2 flex gap-1">
                      {isMine && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                          我的
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          t.isFree
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {t.isFree ? '免费' : 'VIP'}
                      </span>
                    </div>
                  </div>
                </button>
                <div className="px-3 py-2.5 border-t border-black/5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{t.name}</div>
                      <div className="text-[11px] text-neutral-500 truncate">{t.category}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/create?templateId=${encodeURIComponent(t.id)}`)
                      }
                      className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-neutral-900 text-white hover:opacity-90"
                    >
                      使用
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1.5 line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>
                  {isMine && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-black/5">
                      <button
                        type="button"
                        onClick={() => navigate(`/templates/edit/${encodeURIComponent(t.id)}`)}
                        className="flex-1 text-[11px] py-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        className="flex-1 text-[11px] py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <TemplatePreviewModal
        template={previewTpl}
        onClose={() => setPreviewTpl(null)}
        onUse={(tpl) => {
          setPreviewTpl(null);
          navigate(`/create?templateId=${encodeURIComponent(tpl.id)}`);
        }}
      />
    </div>
  );
}

function EmptyState({
  source,
  onReset,
  onCreate,
}: {
  source: SourceFilter;
  onReset: () => void;
  onCreate: () => void;
}) {
  if (source === 'mine') {
    return (
      <div className="mt-10 text-center py-20 rounded-2xl bg-neutral-50 border border-dashed border-neutral-300">
        <div className="text-4xl mb-3">🎨</div>
        <div className="text-neutral-700 font-medium">还没有自定义模板</div>
        <div className="text-sm text-neutral-500 mt-1">
          自己动手设计配色、字体、装饰，打造独一无二的画册模板
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 px-5 py-2 rounded-full bg-gradient-to-r from-rose to-peach text-white text-sm shadow"
        >
          + 创建自定义模板
        </button>
      </div>
    );
  }
  return (
    <div className="mt-10 text-center py-20 rounded-2xl bg-neutral-50 border border-dashed border-neutral-300">
      <div className="text-4xl mb-3">🔍</div>
      <div className="text-neutral-700 font-medium">没有符合条件的模板</div>
      <div className="text-sm text-neutral-500 mt-1">试试更换分类或清除筛选条件</div>
      <button
        type="button"
        onClick={onReset}
        className="mt-4 px-4 py-2 rounded-full bg-neutral-900 text-white text-sm"
      >
        清除筛选
      </button>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 pt-1.5 w-12 text-xs text-neutral-500">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs transition border ${
        active
          ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
          : 'bg-white text-neutral-700 border-black/10 hover:border-neutral-400'
      }`}
    >
      {children}
    </button>
  );
}
