// 自定义模板编辑器
// - /templates/new          新建
// - /templates/edit/:id     编辑已有自定义模板
//
// 左侧：表单（分组配置：基础信息 / 风格骨架 / 配色 / 字体 / 背景 / 装饰 / 默认文案）
// 右侧：实时效果预览（直接复用 PageView + 内置示例照片）
// 底部：保存 / 取消
//
// 所有字段都直接映射到 Template 接口，保存时写入 IndexedDB，
// 不需要修改 PageView 的任何渲染代码。

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  BookPage,
  Template,
  TemplateCategory,
  TemplateStyle,
} from '../types';
import { PageView } from '../components/PageView';
import { SAMPLE_PHOTOS } from '../samplePhotos';
import {
  createUserTemplateId,
  getUserTemplate,
  saveUserTemplate,
  type UserTemplate,
} from '../userTemplates';
import { useTemplateRegistry } from '../TemplateRegistry';

// —————————— 选项常量 ——————————

const CATEGORIES: TemplateCategory[] = [
  '温馨手绘',
  '萌趣卡通',
  '清新文艺',
  '复古胶片',
  '节日主题',
];

const STYLE_OPTIONS: { key: TemplateStyle; label: string; hint: string }[] = [
  { key: 'watercolor', label: '水彩手绘', hint: '手写斜贴标签，柔和圆角相框' },
  { key: 'cartoon', label: '萌趣卡通', hint: '气泡对话框，糖果圆角边' },
  { key: 'minimal', label: '清新极简', hint: '杂志排版，大留白细分割线' },
  { key: 'vintage', label: '复古胶片', hint: 'Polaroid 白边，打字机体' },
  { key: 'festival-cn', label: '中国风', hint: '红边框，竖排标题，印章' },
  { key: 'festival-xmas', label: '圣诞风', hint: '雪花边，松枝丝带' },
];

const FONT_TITLE_OPTIONS: { label: string; value: string }[] = [
  { label: '手写体（Caveat）', value: 'Caveat, cursive' },
  { label: '优雅衬线（Playfair）', value: 'Playfair Display, serif' },
  { label: '打字机（Courier）', value: 'Courier New, Courier, monospace' },
  { label: '楷体（中文）', value: 'STKaiti, KaiTi, serif' },
  { label: '宋体（中文）', value: 'STSong, SimSun, serif' },
  { label: '默认系统字体', value: 'PingFang SC, sans-serif' },
];

const FONT_BODY_OPTIONS: { label: string; value: string }[] = [
  { label: '苹方 / 系统默认', value: 'PingFang SC, sans-serif' },
  { label: '黑体（中文）', value: 'STHeiti, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: '衬线正文（Georgia）', value: 'Georgia, serif' },
];

// 6 种预设背景底纹（用户可直接点选，也可自己编辑 CSS）
const BG_PRESETS: { label: string; make: (c1: string, c2: string) => string }[] = [
  {
    label: '柔光圆斑',
    make: (c1, c2) =>
      `radial-gradient(ellipse at 15% 10%, ${c1} 0 140px, transparent 140px), radial-gradient(ellipse at 85% 90%, ${c2} 0 140px, transparent 140px)`,
  },
  {
    label: '斜纹条纹',
    make: (c1, _c2) =>
      `repeating-linear-gradient(45deg, transparent 0 20px, ${c1} 20px 22px)`,
  },
  {
    label: '上下双渐变',
    make: (c1, c2) => `linear-gradient(180deg, ${c1} 0%, ${c2} 60%)`,
  },
  {
    label: '格纹笔记',
    make: (c1, _c2) =>
      `repeating-linear-gradient(90deg, ${c1} 0 40px, transparent 40px 80px), repeating-linear-gradient(0deg, ${c1} 0 40px, transparent 40px 80px)`,
  },
  {
    label: '双色圆点',
    make: (c1, c2) =>
      `radial-gradient(circle at 20% 30%, ${c1} 0 80px, transparent 80px), radial-gradient(circle at 80% 75%, ${c2} 0 100px, transparent 100px)`,
  },
  {
    label: '纯色（无纹）',
    make: () => '',
  },
];

// 色带：转成含透明度的版本，用于底纹
function withAlpha(hex: string, alpha: number): string {
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// —————————— 默认值 ——————————

function defaultDraft(): UserTemplate {
  return {
    id: createUserTemplateId(),
    name: '我的自定义模板',
    category: '温馨手绘',
    style: 'watercolor',
    description: '自由配色 + 手写标题，独一无二',
    isFree: true,
    colors: {
      bg: '#FFF1E6',
      paper: '#FFF8F0',
      primary: '#E76F51',
      accent: '#F4A261',
      text: '#4A2C1E',
    },
    fontFamily: {
      title: 'Caveat, cursive',
      body: 'PingFang SC, sans-serif',
    },
    backgroundPattern:
      'radial-gradient(ellipse at 10% 0%, rgba(231,111,81,0.18) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(244,162,97,0.18) 0%, transparent 55%)',
    decorations: ['🌸', '🍃', '✿'],
    defaultTitle: '宝贝的时光',
    defaultSubtitle: 'Sweet Moments',
    isUser: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// 预览用的 3 页样板：封面 + 双图页 + 三图页，足够让用户判断配色/字体效果
function buildPreviewPages(draft: UserTemplate): BookPage[] {
  return [
    {
      id: 'pv-cover',
      layout: 'cover',
      photoIds: [SAMPLE_PHOTOS[0].id],
      title: draft.defaultTitle || '宝贝的时光',
      subtitle: draft.defaultSubtitle || 'Sweet Moments',
    },
    {
      id: 'pv-d1',
      layout: 'double',
      photoIds: [SAMPLE_PHOTOS[1].id, SAMPLE_PHOTOS[2].id],
      caption: '第一次学会笑，第一次牵手…',
    },
    {
      id: 'pv-t1',
      layout: 'triple',
      photoIds: [SAMPLE_PHOTOS[3].id, SAMPLE_PHOTOS[4].id, SAMPLE_PHOTOS[5].id],
      caption: '吃、笑、睡 —— 每一刻都可爱',
    },
  ];
}

// —————————— 组件 ——————————

export function TemplateEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { refresh } = useTemplateRegistry();
  const isEditMode = Boolean(id);

  const [draft, setDraft] = useState<UserTemplate | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);

  // 加载（编辑时）或初始化
  useEffect(() => {
    if (!id) {
      setDraft(defaultDraft());
      return;
    }
    (async () => {
      const existing = await getUserTemplate(id);
      if (!existing) {
        setLoadError('找不到该模板，可能已被删除。');
        return;
      }
      setDraft(existing);
    })();
  }, [id]);

  const previewPages = useMemo(
    () => (draft ? buildPreviewPages(draft) : []),
    [draft?.defaultTitle, draft?.defaultSubtitle],
  );

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="text-5xl mb-3">😢</div>
        <div className="text-lg font-medium mb-2">{loadError}</div>
        <button
          onClick={() => navigate('/templates')}
          className="mt-4 px-5 py-2 rounded-full bg-neutral-900 text-white text-sm"
        >
          返回模板列表
        </button>
      </div>
    );
  }

  if (!draft) {
    return <div className="py-20 text-center text-neutral-500">加载中…</div>;
  }

  // —— 修改器 —— 浅合并，避免重复写 setter
  const update = (patch: Partial<UserTemplate>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  const updateColors = (patch: Partial<Template['colors']>) =>
    setDraft((prev) => (prev ? { ...prev, colors: { ...prev.colors, ...patch } } : prev));
  const updateFont = (patch: Partial<Template['fontFamily']>) =>
    setDraft((prev) =>
      prev ? { ...prev, fontFamily: { ...prev.fontFamily, ...patch } } : prev,
    );

  const handleApplyBgPreset = (
    make: (c1: string, c2: string) => string,
  ) => {
    const c1 = withAlpha(draft.colors.primary, 0.18);
    const c2 = withAlpha(draft.colors.accent, 0.18);
    update({ backgroundPattern: make(c1, c2) });
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      alert('请先填写模板名称');
      return;
    }
    setSaving(true);
    try {
      const toSave: UserTemplate = {
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        defaultTitle: draft.defaultTitle.trim() || '宝贝的时光',
        defaultSubtitle: draft.defaultSubtitle.trim() || 'Sweet Moments',
        decorations: draft.decorations.filter((s) => s.trim().length > 0),
        updatedAt: Date.now(),
      };
      await saveUserTemplate(toSave);
      await refresh();
      navigate('/templates');
    } finally {
      setSaving(false);
    }
  };

  const previewPage = previewPages[previewPageIndex] ?? previewPages[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">
            {isEditMode ? '编辑模板' : '创建自定义模板'}
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            自由配置配色、字体、装饰与背景，右侧即时预览
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/templates')}
            className="px-4 py-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-sm"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-full bg-neutral-900 text-white text-sm shadow hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '保存中…' : isEditMode ? '保存修改' : '保存模板'}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-5">
        {/* ——— 左：表单 ——— */}
        <div className="space-y-4 min-w-0">
          <Section title="基础信息">
            <Field label="模板名称">
              <input
                type="text"
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="如：奶油拿铁、森系日记…"
                className="input"
                maxLength={20}
              />
            </Field>
            <Field label="简短描述">
              <input
                type="text"
                value={draft.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="一句话描述这个模板的特色"
                className="input"
                maxLength={50}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="分类">
                <select
                  value={draft.category}
                  onChange={(e) =>
                    update({ category: e.target.value as TemplateCategory })
                  }
                  className="input"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="标记">
                <label className="flex items-center gap-2 text-sm h-[38px] px-3 rounded-lg border border-neutral-200 bg-white">
                  <input
                    type="checkbox"
                    checked={draft.isFree}
                    onChange={(e) => update({ isFree: e.target.checked })}
                  />
                  <span>免费模板</span>
                </label>
              </Field>
            </div>
          </Section>

          <Section title="视觉风格骨架">
            <p className="text-[11px] text-neutral-500 mb-2">
              选择一种风格骨架，决定照片相框和排版的样式（装饰细节）
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STYLE_OPTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => update({ style: s.key })}
                  className={`text-left p-2.5 rounded-lg border transition ${
                    draft.style === s.key
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-white hover:border-neutral-400'
                  }`}
                >
                  <div className="text-sm font-medium">{s.label}</div>
                  <div
                    className={`text-[10px] leading-tight mt-0.5 ${
                      draft.style === s.key ? 'text-white/70' : 'text-neutral-500'
                    }`}
                  >
                    {s.hint}
                  </div>
                </button>
              ))}
            </div>
          </Section>

          <Section title="配色方案">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <ColorField
                label="页面底色"
                hint="整页背景"
                value={draft.colors.bg}
                onChange={(v) => updateColors({ bg: v })}
              />
              <ColorField
                label="纸张底色"
                hint="单页纸"
                value={draft.colors.paper}
                onChange={(v) => updateColors({ paper: v })}
              />
              <ColorField
                label="主色"
                hint="标题/装饰"
                value={draft.colors.primary}
                onChange={(v) => updateColors({ primary: v })}
              />
              <ColorField
                label="强调色"
                hint="次要装饰"
                value={draft.colors.accent}
                onChange={(v) => updateColors({ accent: v })}
              />
              <ColorField
                label="正文色"
                hint="文字颜色"
                value={draft.colors.text}
                onChange={(v) => updateColors({ text: v })}
              />
            </div>
          </Section>

          <Section title="字体">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="标题字体">
                <select
                  value={draft.fontFamily.title}
                  onChange={(e) => updateFont({ title: e.target.value })}
                  className="input"
                  style={{ fontFamily: draft.fontFamily.title }}
                >
                  {FONT_TITLE_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="正文字体">
                <select
                  value={draft.fontFamily.body}
                  onChange={(e) => updateFont({ body: e.target.value })}
                  className="input"
                  style={{ fontFamily: draft.fontFamily.body }}
                >
                  {FONT_BODY_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="背景底纹">
            <p className="text-[11px] text-neutral-500 mb-2">
              点击任一预设快速应用（会基于当前「主色/强调色」生成）
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {BG_PRESETS.map((p) => {
                const c1 = withAlpha(draft.colors.primary, 0.18);
                const c2 = withAlpha(draft.colors.accent, 0.18);
                const css = p.make(c1, c2);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleApplyBgPreset(p.make)}
                    className="rounded-lg border border-neutral-200 hover:border-neutral-400 overflow-hidden text-left"
                  >
                    <div
                      className="h-16"
                      style={{
                        background: css
                          ? `${css}, ${draft.colors.paper}`
                          : draft.colors.paper,
                      }}
                    />
                    <div className="text-[11px] px-2 py-1">{p.label}</div>
                  </button>
                );
              })}
            </div>
            <Field label="或直接编辑 CSS background">
              <textarea
                value={draft.backgroundPattern ?? ''}
                onChange={(e) => update({ backgroundPattern: e.target.value })}
                placeholder="linear-gradient(...) / radial-gradient(...) / 留空表示纯色"
                className="input font-mono text-[11px] h-16 resize-none"
              />
            </Field>
          </Section>

          <Section title="装饰元素">
            <p className="text-[11px] text-neutral-500 mb-2">
              最多 6 个 emoji 或符号，用于页面点缀（逗号分隔）
            </p>
            <input
              type="text"
              value={draft.decorations.join(',')}
              onChange={(e) =>
                update({
                  decorations: e.target.value
                    .split(/[,，]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 6),
                })
              }
              placeholder="🌸,🍃,✿"
              className="input"
            />
            <div className="mt-2 flex gap-2 text-2xl">
              {draft.decorations.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
          </Section>

          <Section title="默认文案">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="默认标题">
                <input
                  type="text"
                  value={draft.defaultTitle}
                  onChange={(e) => update({ defaultTitle: e.target.value })}
                  placeholder="宝贝的时光"
                  className="input"
                  maxLength={16}
                />
              </Field>
              <Field label="默认副标题">
                <input
                  type="text"
                  value={draft.defaultSubtitle}
                  onChange={(e) => update({ defaultSubtitle: e.target.value })}
                  placeholder="Sweet Moments"
                  className="input"
                  maxLength={20}
                />
              </Field>
            </div>
          </Section>
        </div>

        {/* ——— 右：实时预览 ——— */}
        <div className="lg:sticky lg:top-20 self-start">
          <div className="rounded-2xl border border-black/5 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/5 bg-neutral-50">
              <div className="text-sm font-medium">实时预览</div>
              <div className="flex gap-1">
                {previewPages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPreviewPageIndex(i)}
                    className={`px-2 py-0.5 text-[11px] rounded transition ${
                      i === previewPageIndex
                        ? 'bg-neutral-900 text-white'
                        : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    {['封面', '双图', '三图'][i] ?? `第${i + 1}页`}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4" style={{ background: draft.colors.bg }}>
              <div className="mx-auto aspect-[3/4] max-w-[360px] w-full rounded-md overflow-hidden shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]">
                {previewPage && (
                  <PageView
                    page={previewPage}
                    photos={SAMPLE_PHOTOS}
                    template={draft}
                    babyName="小满"
                    dateRange="2024.03 – 2024.12"
                  />
                )}
              </div>
              <p className="text-center text-[11px] text-neutral-500 mt-3">
                预览使用内置示例照片。真正用此模板创建画册时，会渲染你上传的照片。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 局部样式：表单通用 */}
      <style>{`
        .input {
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #e5e5e5;
          background: #fff;
          font-size: 13px;
          outline: none;
          transition: border-color .15s;
        }
        .input:focus { border-color: #525252; }
        textarea.input { line-height: 1.4; }
      `}</style>
    </div>
  );
}

// —————————— 通用子组件 ——————————

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-black/5 shadow-sm p-4">
      <h2 className="text-sm font-semibold mb-3 text-neutral-800">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] text-neutral-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="text-[11px] text-neutral-600 font-medium">{label}</div>
      <div className="text-[10px] text-neutral-400 mb-1.5">{hint}</div>
      <div className="flex items-center gap-2 p-1.5 rounded-lg border border-neutral-200 bg-white">
        <input
          type="color"
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-neutral-200"
          style={{ padding: 0 }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent text-[11px] font-mono outline-none"
        />
      </div>
    </div>
  );
}

/** color input 只接受 #rrggbb，非法时返回黑色，避免控件报错 */
function normalizeHex(v: string): string {
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const h = v.slice(1);
    return '#' + h.split('').map((c) => c + c).join('');
  }
  return '#000000';
}
