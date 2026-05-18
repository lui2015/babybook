// 自定义模板编辑器（自由画布版）
// - /templates/new          新建
// - /templates/edit/:id     编辑已有自定义模板
//
// 布局：
//   - 顶部：模板名 + 取消 / 保存
//   - 主区分三栏：
//       左   = 页列表（添加 / 删除 / 重排）
//       中   = 自由画布（PageView，editable=true，直接拖拽元素）
//       右   = 当前页工具栏 + 选中元素属性面板
//   - 底部 = 折叠的"模板外观"（基础信息 / 配色 / 字体 / 背景 / 装饰），作用于整本模板
//
// 数据模型：
//   - 模板自身存配色/字体/装饰等"全局外观"
//   - 模板的页存于 template.pages: TemplatePage[]
//   - 每页固定 layout='free'，元素都用 overlays 描述（百分比坐标 + 旋转）
//   - OverlayPhoto.placeholder=true 表示占位槽位（创建画册时按顺序填入用户照片）

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  BookPage,
  Overlay,
  OverlayPhoto,
  OverlayText,
  Photo,
  PhotoShape,
  Template,
  TemplateCategory,
  TemplatePage,
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

// 6 种预设背景底纹
const BG_PRESETS: { label: string; make: (c1: string, c2: string) => string }[] = [
  {
    label: '柔光圆斑',
    make: (c1, c2) =>
      `radial-gradient(ellipse at 15% 10%, ${c1} 0 140px, transparent 140px), radial-gradient(ellipse at 85% 90%, ${c2} 0 140px, transparent 140px)`,
  },
  {
    label: '斜纹条纹',
    make: (c1) => `repeating-linear-gradient(45deg, transparent 0 20px, ${c1} 20px 22px)`,
  },
  {
    label: '上下双渐变',
    make: (c1, c2) => `linear-gradient(180deg, ${c1} 0%, ${c2} 60%)`,
  },
  {
    label: '格纹笔记',
    make: (c1) =>
      `repeating-linear-gradient(90deg, ${c1} 0 40px, transparent 40px 80px), repeating-linear-gradient(0deg, ${c1} 0 40px, transparent 40px 80px)`,
  },
  {
    label: '双色圆点',
    make: (c1, c2) =>
      `radial-gradient(circle at 20% 30%, ${c1} 0 80px, transparent 80px), radial-gradient(circle at 80% 75%, ${c2} 0 100px, transparent 100px)`,
  },
  { label: '纯色（无纹）', make: () => '' },
];

const PHOTO_SHAPES: { key: PhotoShape; label: string }[] = [
  { key: 'rect', label: '矩形' },
  { key: 'rounded', label: '圆角' },
  { key: 'circle', label: '圆形' },
  { key: 'heart', label: '心形' },
  { key: 'star', label: '星形' },
  { key: 'hexagon', label: '六边形' },
];

// —————————— 工具函数 ——————————

function withAlpha(hex: string, alpha: number): string {
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return hex;
  let h = hex.slice(1);
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeHex(v: string): string {
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const h = v.slice(1);
    return '#' + h.split('').map((c) => c + c).join('');
  }
  return '#000000';
}

// —————————— 默认值 ——————————

function makeDefaultPage(): TemplatePage {
  // 默认每页放 1 张占位图 + 1 个标题
  return {
    id: uid('p'),
    photoSlotCount: 1,
    overlays: [
      {
        id: uid('ov'),
        kind: 'photo',
        x: 12,
        y: 18,
        w: 76,
        h: 60,
        photoId: '',
        placeholder: true,
        shape: 'rounded',
      },
      {
        id: uid('ov'),
        kind: 'text',
        x: 10,
        y: 82,
        w: 80,
        h: 10,
        text: '在这里写下宝宝的成长故事…',
        fontSize: 22,
        align: 'center',
        color: '#3F2A1B',
      },
    ],
  };
}

function defaultDraft(): UserTemplate {
  return {
    id: createUserTemplateId(),
    name: '我的自定义模板',
    category: '温馨手绘',
    style: 'watercolor',
    description: '自由布局 + 自定义页数',
    isFree: true,
    colors: {
      bg: '#FFF1E6',
      paper: '#FFF8F0',
      primary: '#E76F51',
      accent: '#F4A261',
      text: '#4A2C1E',
    },
    fontFamily: { title: 'Caveat, cursive', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(ellipse at 10% 0%, rgba(231,111,81,0.18) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(244,162,97,0.18) 0%, transparent 55%)',
    decorations: ['🌸', '🍃', '✿'],
    defaultTitle: '宝贝的时光',
    defaultSubtitle: 'Sweet Moments',
    pages: [makeDefaultPage()],
    isUser: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** 把 TemplatePage 转成 PageView 能渲染的 BookPage（free 版式 + overlays） */
function pageToBookPage(tp: TemplatePage): BookPage {
  return {
    id: tp.id,
    layout: 'free',
    photoIds: [], // free 版式不依赖 photoIds
    overlays: tp.overlays,
  };
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
  const [pageIdx, setPageIdx] = useState(0);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [showAppearance, setShowAppearance] = useState(false);

  // 模板编辑器内置一组示例图片，用于 OverlayPhoto 槽位"在编辑器中预览图片"模式
  const [previewBoundPhotos, setPreviewBoundPhotos] = useState(false);

  // 模板编辑器同样需要大屏；在窄屏给出友好提示
  const [forceNarrow, setForceNarrow] = useState(false);
  const [isNarrow, setIsNarrow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });
  useEffect(() => {
    function onResize() {
      setIsNarrow(window.innerWidth < 1024);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
      // 老数据兼容：没有 pages 字段则补一页默认
      if (!existing.pages || existing.pages.length === 0) {
        existing.pages = [makeDefaultPage()];
      }
      setDraft(existing);
    })();
  }, [id]);

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

  if (isNarrow && !forceNarrow) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-neutral-50 px-5 py-10 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-soft border border-neutral-200 p-6 text-center">
          <div className="text-4xl mb-3">🖥️</div>
          <h1 className="font-display text-xl font-bold mb-2">建议在大屏上设计模板</h1>
          <p className="text-sm text-neutral-600 leading-relaxed mb-5">
            模板编辑器需要拖拽、对位与精细操作，
            <br />
            建议使用 iPad 横屏 / 平板 / 电脑打开本页面进行设计。
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate('/templates')}
              className="w-full py-2.5 rounded-full bg-rose text-white text-sm font-medium hover:bg-rose-dark transition"
            >
              返回模板列表
            </button>
            <button
              onClick={() => setForceNarrow(true)}
              className="w-full py-2.5 rounded-full border border-neutral-300 text-neutral-600 text-sm hover:border-neutral-500 transition"
            >
              我了解，仍在小屏继续
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pages = draft.pages ?? [];
  const currentPage = pages[pageIdx] ?? pages[0];
  const selectedOverlay =
    currentPage?.overlays.find((o) => o.id === selectedOverlayId) ?? null;

  // —— 修改器（浅合并）——
  const update = (patch: Partial<UserTemplate>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  const updateColors = (patch: Partial<Template['colors']>) =>
    setDraft((prev) => (prev ? { ...prev, colors: { ...prev.colors, ...patch } } : prev));
  const updateFont = (patch: Partial<Template['fontFamily']>) =>
    setDraft((prev) =>
      prev ? { ...prev, fontFamily: { ...prev.fontFamily, ...patch } } : prev,
    );

  const updatePages = (mapper: (pages: TemplatePage[]) => TemplatePage[]) =>
    setDraft((prev) => (prev ? { ...prev, pages: mapper(prev.pages ?? []) } : prev));

  const patchCurrentPage = (patch: Partial<TemplatePage>) => {
    updatePages((all) => all.map((p, i) => (i === pageIdx ? { ...p, ...patch } : p)));
  };

  const patchOverlay = (overlayId: string, patch: Partial<Overlay>) => {
    updatePages((all) =>
      all.map((p, i) => {
        if (i !== pageIdx) return p;
        return {
          ...p,
          overlays: p.overlays.map((o) =>
            o.id === overlayId ? ({ ...o, ...patch } as Overlay) : o,
          ),
        };
      }),
    );
  };

  const removeOverlay = (overlayId: string) => {
    updatePages((all) =>
      all.map((p, i) => {
        if (i !== pageIdx) return p;
        const next = p.overlays.filter((o) => o.id !== overlayId);
        // 重新计算 photoSlotCount
        return {
          ...p,
          overlays: next,
          photoSlotCount: next.filter((o) => o.kind === 'photo').length,
        };
      }),
    );
    if (selectedOverlayId === overlayId) setSelectedOverlayId(null);
  };

  const addPhotoOverlay = () => {
    const overlay: OverlayPhoto = {
      id: uid('ov'),
      kind: 'photo',
      x: 20,
      y: 20,
      w: 50,
      h: 50,
      photoId: '',
      placeholder: true,
      shape: 'rounded',
    };
    updatePages((all) =>
      all.map((p, i) =>
        i === pageIdx
          ? {
              ...p,
              overlays: [...p.overlays, overlay],
              photoSlotCount: p.photoSlotCount + 1,
            }
          : p,
      ),
    );
    setSelectedOverlayId(overlay.id);
  };

  const addTextOverlay = (preset?: 'title' | 'subtitle' | 'caption') => {
    const overlay: OverlayText = {
      id: uid('ov'),
      kind: 'text',
      x: 12,
      y: preset === 'title' ? 8 : preset === 'subtitle' ? 18 : 80,
      w: 76,
      h: preset === 'title' ? 12 : 10,
      text:
        preset === 'title'
          ? draft.defaultTitle || '标题'
          : preset === 'subtitle'
          ? draft.defaultSubtitle || '副标题'
          : '在这里写下文字…',
      fontSize: preset === 'title' ? 36 : preset === 'subtitle' ? 22 : 16,
      align: 'center',
      color: preset === 'title' ? draft.colors.primary : draft.colors.text,
      fontFamily: preset === 'title' ? draft.fontFamily.title : draft.fontFamily.body,
      bold: preset === 'title',
    };
    updatePages((all) =>
      all.map((p, i) =>
        i === pageIdx ? { ...p, overlays: [...p.overlays, overlay] } : p,
      ),
    );
    setSelectedOverlayId(overlay.id);
  };

  const handleOverlaysChange = (next: Overlay[]) => {
    patchCurrentPage({ overlays: next });
  };

  // —— 页操作 ——
  const addPage = () => {
    const np = makeDefaultPage();
    updatePages((all) => [...all, np]);
    setPageIdx(pages.length); // 跳到新页
    setSelectedOverlayId(null);
  };

  const duplicatePage = (i: number) => {
    updatePages((all) => {
      const src = all[i];
      if (!src) return all;
      // 深拷贝 overlays，并重新分配 id
      const cloned: TemplatePage = {
        ...src,
        id: uid('p'),
        overlays: src.overlays.map((o) => ({ ...o, id: uid('ov') })),
      };
      const out = [...all];
      out.splice(i + 1, 0, cloned);
      return out;
    });
    setPageIdx(i + 1);
    setSelectedOverlayId(null);
  };

  const deletePage = (i: number) => {
    if (pages.length <= 1) {
      alert('至少保留 1 页');
      return;
    }
    if (!confirm(`确定删除第 ${i + 1} 页？`)) return;
    updatePages((all) => all.filter((_, idx) => idx !== i));
    setPageIdx((cur) => (cur >= i ? Math.max(0, cur - 1) : cur));
    setSelectedOverlayId(null);
  };

  const movePage = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= pages.length) return;
    updatePages((all) => {
      const out = [...all];
      const [p] = out.splice(i, 1);
      out.splice(j, 0, p);
      return out;
    });
    setPageIdx(j);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      alert('请先填写模板名称');
      return;
    }
    if (!draft.pages || draft.pages.length === 0) {
      alert('至少添加 1 页');
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
        // 保存时同步 photoSlotCount
        pages: (draft.pages ?? []).map((p) => ({
          ...p,
          photoSlotCount: p.overlays.filter((o) => o.kind === 'photo').length,
        })),
        updatedAt: Date.now(),
      };
      await saveUserTemplate(toSave);
      await refresh();
      navigate('/templates');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/templates')}
            className="text-neutral-500 hover:text-neutral-900 text-sm whitespace-nowrap"
          >
            ← 返回模板
          </button>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            className="font-display text-xl font-bold bg-transparent outline-none min-w-0 flex-1 max-w-md border-b border-transparent focus:border-neutral-300 py-1"
            placeholder="模板名称"
            maxLength={20}
          />
          <span className="text-xs text-neutral-400 hidden md:inline">
            {isEditMode ? '编辑模板' : '新建模板'} · 共 {pages.length} 页
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPreviewBoundPhotos((v) => !v)}
            className={`px-3 py-2 rounded-full text-xs whitespace-nowrap ${
              previewBoundPhotos
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
            }`}
            title="切换：把图片槽位用示例照片填充预览效果"
          >
            {previewBoundPhotos ? '预览模式（示例图）' : '设计模式（占位）'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-full bg-neutral-900 text-white text-sm shadow hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? '保存中…' : isEditMode ? '保存修改' : '保存模板'}
          </button>
        </div>
      </div>

      {/* 三栏主区 */}
      <div className="grid grid-cols-[200px_minmax(0,1fr)_280px] gap-4 min-h-[600px]">
        {/* —— 左：页列表 —— */}
        <PageListPanel
          draft={draft}
          pageIdx={pageIdx}
          onSelect={(i) => {
            setPageIdx(i);
            setSelectedOverlayId(null);
          }}
          onAdd={addPage}
          onDuplicate={duplicatePage}
          onDelete={deletePage}
          onMove={movePage}
        />

        {/* —— 中：自由画布 —— */}
        <CanvasArea
          draft={draft}
          page={currentPage}
          previewBound={previewBoundPhotos}
          selectedOverlayId={selectedOverlayId}
          onSelectOverlay={setSelectedOverlayId}
          onOverlaysChange={handleOverlaysChange}
        />

        {/* —— 右：工具 + 属性 —— */}
        <RightPanel
          draft={draft}
          page={currentPage}
          selectedOverlay={selectedOverlay}
          onAddPhoto={addPhotoOverlay}
          onAddText={addTextOverlay}
          onPatchOverlay={patchOverlay}
          onRemoveOverlay={removeOverlay}
        />
      </div>

      {/* 底部：模板外观折叠面板 */}
      <div className="mt-5">
        <button
          onClick={() => setShowAppearance((v) => !v)}
          className="w-full text-left px-4 py-2.5 rounded-xl bg-white border border-black/5 shadow-sm flex items-center justify-between hover:bg-neutral-50"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">模板外观</span>
            <span className="text-[11px] text-neutral-500">
              · 配色 / 字体 / 背景 / 装饰（作用于整本模板）
            </span>
          </div>
          <span className="text-neutral-400">{showAppearance ? '▾' : '▸'}</span>
        </button>
        {showAppearance && (
          <AppearancePanel
            draft={draft}
            update={update}
            updateColors={updateColors}
            updateFont={updateFont}
          />
        )}
      </div>

      {/* 局部样式：表单通用 */}
      <style>{`
        .te-input {
          width: 100%;
          padding: 7px 10px;
          border-radius: 8px;
          border: 1px solid #e5e5e5;
          background: #fff;
          font-size: 12px;
          outline: none;
          transition: border-color .15s;
        }
        .te-input:focus { border-color: #525252; }
        textarea.te-input { line-height: 1.4; }
      `}</style>
    </div>
  );
}

// —————————— 左：页列表 ——————————

function PageListPanel({
  draft,
  pageIdx,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
}: {
  draft: UserTemplate;
  pageIdx: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDuplicate: (i: number) => void;
  onDelete: (i: number) => void;
  onMove: (i: number, delta: -1 | 1) => void;
}) {
  const pages = draft.pages ?? [];
  return (
    <aside className="rounded-2xl bg-white border border-black/5 shadow-sm p-2 flex flex-col gap-2 self-start sticky top-4 max-h-[calc(100vh-32px)] overflow-y-auto">
      <div className="px-2 py-1 text-[11px] text-neutral-500 font-medium">
        页面（{pages.length}）
      </div>
      <div className="space-y-1.5">
        {pages.map((p, i) => {
          const active = i === pageIdx;
          return (
            <div
              key={p.id}
              onClick={() => onSelect(i)}
              className={`group relative rounded-lg border cursor-pointer overflow-hidden transition ${
                active
                  ? 'border-neutral-900 ring-2 ring-neutral-900/15 bg-white'
                  : 'border-neutral-200 hover:border-neutral-400 bg-neutral-50'
              }`}
            >
              {/* 缩略图 */}
              <PageThumbnail page={p} draft={draft} />
              {/* 序号 + 操作 */}
              <div className="px-2 py-1 flex items-center justify-between text-[10px] bg-white/80 border-t border-neutral-100">
                <span className={`font-medium ${active ? 'text-neutral-900' : 'text-neutral-500'}`}>
                  P{i + 1}
                </span>
                <div className="flex gap-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(i, -1);
                    }}
                    disabled={i === 0}
                    className="px-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(i, 1);
                    }}
                    disabled={i === pages.length - 1}
                    className="px-1 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                    title="下移"
                  >
                    ↓
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(i);
                    }}
                    className="px-1 text-neutral-500 hover:text-neutral-900"
                    title="复制此页"
                  >
                    ⎘
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(i);
                    }}
                    className="px-1 text-neutral-500 hover:text-rose-600"
                    title="删除此页"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={onAdd}
        className="mt-1 w-full py-2 rounded-lg border border-dashed border-neutral-300 text-[12px] text-neutral-600 hover:bg-neutral-50 hover:border-neutral-500"
      >
        ＋ 添加页
      </button>
    </aside>
  );
}

/** 用 SVG 渲染页缩略图（按 overlays 的 % 坐标投到 60×80 上） */
function PageThumbnail({ page, draft }: { page: TemplatePage; draft: UserTemplate }) {
  const W = 60;
  const H = 80;
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '3 / 4',
        background: page.background ?? draft.colors.paper,
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
        {page.overlays.map((o) => {
          const x = (o.x / 100) * W;
          const y = (o.y / 100) * H;
          const w = (o.w / 100) * W;
          const h = (o.h / 100) * H;
          if (o.kind === 'photo') {
            return (
              <rect
                key={o.id}
                x={x}
                y={y}
                width={w}
                height={h}
                fill="#D4D4D4"
                stroke="#A3A3A3"
                strokeDasharray="2 2"
                strokeWidth={0.5}
                rx={o.shape === 'circle' ? Math.min(w, h) / 2 : 1.5}
                transform={o.rotation ? `rotate(${o.rotation} ${x + w / 2} ${y + h / 2})` : undefined}
              />
            );
          }
          // text
          return (
            <g
              key={o.id}
              transform={o.rotation ? `rotate(${o.rotation} ${x + w / 2} ${y + h / 2})` : undefined}
            >
              <rect x={x} y={y} width={w} height={h} fill="rgba(0,0,0,0.04)" rx={1} />
              <line
                x1={x + 1}
                y1={y + h / 2}
                x2={x + w - 1}
                y2={y + h / 2}
                stroke="#737373"
                strokeWidth={0.6}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// —————————— 中：画布 ——————————

function CanvasArea({
  draft,
  page,
  previewBound,
  selectedOverlayId,
  onSelectOverlay,
  onOverlaysChange,
}: {
  draft: UserTemplate;
  page: TemplatePage | undefined;
  previewBound: boolean;
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onOverlaysChange: (next: Overlay[]) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  if (!page) {
    return <div className="text-center text-neutral-500 py-20">没有页面</div>;
  }

  // 预览模式：把 placeholder 槽位临时绑到示例图，让用户看真实排版
  const overlays: Overlay[] = previewBound
    ? page.overlays.map((o, i) => {
        if (o.kind !== 'photo' || !o.placeholder) return o;
        const sample =
          SAMPLE_PHOTOS[
            page.overlays.slice(0, i + 1).filter((x) => x.kind === 'photo').length - 1
          ] ?? SAMPLE_PHOTOS[0];
        return { ...o, photoId: sample.id, placeholder: false };
      })
    : page.overlays;

  // 同步把绑定后的 overlays 改回 onOverlaysChange 时要还原 placeholder（避免污染数据）
  const handleChange = (next: Overlay[]) => {
    if (!previewBound) {
      onOverlaysChange(next);
      return;
    }
    // 把示例图绑定还原成 placeholder
    const restored = next.map((o, i) => {
      if (o.kind !== 'photo') return o;
      const orig = page.overlays[i];
      if (orig && orig.kind === 'photo' && orig.placeholder) {
        return { ...o, photoId: '', placeholder: true } as OverlayPhoto;
      }
      return o;
    });
    onOverlaysChange(restored);
  };

  const photos: Photo[] = previewBound ? SAMPLE_PHOTOS : [];

  const bookPage: BookPage = {
    ...pageToBookPage(page),
    overlays,
  };

  return (
    <div className="flex flex-col items-center" style={{ background: draft.colors.bg }}>
      <div
        ref={wrapRef}
        className="rounded-md overflow-hidden shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)] bg-white"
        style={{
          width: '100%',
          maxWidth: 540,
          aspectRatio: '3 / 4',
        }}
        onClick={(e) => {
          // 点击空白处取消选中
          if (e.target === e.currentTarget) onSelectOverlay(null);
        }}
      >
        <PageView
          page={bookPage}
          photos={photos}
          template={draft}
          babyName={draft.defaultTitle}
          dateRange={draft.defaultSubtitle}
          overlays={overlays}
          selectedOverlayId={selectedOverlayId}
          onSelectOverlay={onSelectOverlay}
          onOverlaysChange={handleChange}
        />
      </div>
      <p className="mt-3 text-[11px] text-neutral-500 text-center max-w-md">
        点击元素选中，拖动主体改位置 · 边角缩放 · 顶部圆点旋转。点击空白取消选中。
      </p>
    </div>
  );
}

// —————————— 右：工具 + 属性面板 ——————————

function RightPanel({
  draft,
  page,
  selectedOverlay,
  onAddPhoto,
  onAddText,
  onPatchOverlay,
  onRemoveOverlay,
}: {
  draft: UserTemplate;
  page: TemplatePage | undefined;
  selectedOverlay: Overlay | null;
  onAddPhoto: () => void;
  onAddText: (preset?: 'title' | 'subtitle' | 'caption') => void;
  onPatchOverlay: (id: string, patch: Partial<Overlay>) => void;
  onRemoveOverlay: (id: string) => void;
}) {
  return (
    <aside className="space-y-3 self-start sticky top-4 max-h-[calc(100vh-32px)] overflow-y-auto pr-1">
      {/* 工具栏 */}
      <section className="rounded-2xl bg-white border border-black/5 shadow-sm p-3">
        <div className="text-[11px] text-neutral-500 mb-2 font-medium">添加元素</div>
        <div className="grid grid-cols-2 gap-1.5">
          <ToolButton icon="🖼" label="图片框" onClick={onAddPhoto} />
          <ToolButton icon="T" label="文字" onClick={() => onAddText()} />
          <ToolButton icon="H1" label="标题" onClick={() => onAddText('title')} />
          <ToolButton icon="H2" label="副标题" onClick={() => onAddText('subtitle')} />
        </div>
        <div className="mt-2 text-[10px] text-neutral-400 leading-relaxed">
          图片框是"占位槽位"，用此模板创建画册时会按顺序填入用户上传的照片。
        </div>
        {page && (
          <div className="mt-2 text-[11px] text-neutral-600 px-1">
            当前页：{page.overlays.filter((o) => o.kind === 'photo').length} 个图片框 ·{' '}
            {page.overlays.filter((o) => o.kind === 'text').length} 个文字
          </div>
        )}
      </section>

      {/* 属性面板 */}
      <section className="rounded-2xl bg-white border border-black/5 shadow-sm p-3">
        <div className="text-[11px] text-neutral-500 mb-2 font-medium">
          {selectedOverlay
            ? selectedOverlay.kind === 'photo'
              ? '图片框属性'
              : '文字属性'
            : '元素属性'}
        </div>
        {!selectedOverlay ? (
          <div className="text-[11px] text-neutral-400 py-4 text-center">
            点击画布中的元素以编辑属性
          </div>
        ) : selectedOverlay.kind === 'photo' ? (
          <PhotoOverlayPanel
            overlay={selectedOverlay}
            draft={draft}
            onPatch={(patch) => onPatchOverlay(selectedOverlay.id, patch)}
            onRemove={() => onRemoveOverlay(selectedOverlay.id)}
          />
        ) : (
          <TextOverlayPanel
            overlay={selectedOverlay}
            draft={draft}
            onPatch={(patch) => onPatchOverlay(selectedOverlay.id, patch)}
            onRemove={() => onRemoveOverlay(selectedOverlay.id)}
          />
        )}
      </section>

      {/* 几何（通用） */}
      {selectedOverlay && (
        <section className="rounded-2xl bg-white border border-black/5 shadow-sm p-3">
          <div className="text-[11px] text-neutral-500 mb-2 font-medium">位置 & 旋转</div>
          <GeometryPanel
            overlay={selectedOverlay}
            onPatch={(patch) => onPatchOverlay(selectedOverlay.id, patch)}
          />
        </section>
      )}
    </aside>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg border border-neutral-200 hover:border-neutral-900 hover:bg-neutral-50 text-[11px] text-neutral-700 transition"
    >
      <span className="text-[15px] font-bold">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function PhotoOverlayPanel({
  overlay,
  draft,
  onPatch,
  onRemove,
}: {
  overlay: OverlayPhoto;
  draft: UserTemplate;
  onPatch: (patch: Partial<Overlay>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <div>
        <div className="text-[10px] text-neutral-500 mb-1">相框形状</div>
        <div className="grid grid-cols-3 gap-1">
          {PHOTO_SHAPES.map((s) => {
            const active = (overlay.shape ?? 'rect') === s.key;
            return (
              <button
                key={s.key}
                onClick={() => onPatch({ shape: s.key })}
                className={`py-1 rounded text-[10px] border transition ${
                  active
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white hover:border-neutral-400'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-neutral-500 mb-1">边框</div>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={normalizeHex(overlay.borderColor ?? draft.colors.paper)}
            onChange={(e) => onPatch({ borderColor: e.target.value })}
            className="w-7 h-7 rounded border border-neutral-200"
            style={{ padding: 0 }}
          />
          <input
            type="number"
            min={0}
            max={20}
            value={overlay.borderWidth ?? 4}
            onChange={(e) => onPatch({ borderWidth: Math.max(0, Number(e.target.value)) })}
            className="te-input flex-1"
            placeholder="px"
          />
        </div>
      </div>

      <button
        onClick={onRemove}
        className="w-full py-1.5 rounded-md text-rose-600 text-[11px] border border-rose-200 hover:bg-rose-50"
      >
        删除该图片框
      </button>
    </div>
  );
}

function TextOverlayPanel({
  overlay,
  draft,
  onPatch,
  onRemove,
}: {
  overlay: OverlayText;
  draft: UserTemplate;
  onPatch: (patch: Partial<Overlay>) => void;
  onRemove: () => void;
}) {
  const FONT_OPTIONS = [...FONT_TITLE_OPTIONS, ...FONT_BODY_OPTIONS];
  return (
    <div className="space-y-2.5">
      <div>
        <div className="text-[10px] text-neutral-500 mb-1">文字内容</div>
        <textarea
          value={overlay.text}
          onChange={(e) => onPatch({ text: e.target.value })}
          className="te-input"
          rows={2}
          maxLength={200}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-neutral-500 mb-1">字号 (px)</div>
          <input
            type="number"
            min={8}
            max={120}
            value={overlay.fontSize ?? 22}
            onChange={(e) => onPatch({ fontSize: Math.max(8, Number(e.target.value)) })}
            className="te-input"
          />
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 mb-1">颜色</div>
          <input
            type="color"
            value={normalizeHex(overlay.color ?? draft.colors.text)}
            onChange={(e) => onPatch({ color: e.target.value })}
            className="w-full h-[30px] rounded border border-neutral-200 p-0"
          />
        </div>
      </div>

      <div>
        <div className="text-[10px] text-neutral-500 mb-1">字体</div>
        <select
          value={overlay.fontFamily ?? draft.fontFamily.body}
          onChange={(e) => onPatch({ fontFamily: e.target.value })}
          className="te-input"
          style={{ fontFamily: overlay.fontFamily }}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-neutral-500 mb-1">对齐</div>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((a) => {
              const active = (overlay.align ?? 'center') === a;
              return (
                <button
                  key={a}
                  onClick={() => onPatch({ align: a })}
                  className={`flex-1 py-1 rounded text-[10px] border transition ${
                    active
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  {a === 'left' ? '左' : a === 'right' ? '右' : '中'}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-neutral-500 mb-1">样式</div>
          <div className="flex gap-1">
            <button
              onClick={() => onPatch({ bold: !overlay.bold })}
              className={`flex-1 py-1 rounded text-[10px] border font-bold ${
                overlay.bold
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200'
              }`}
            >
              B
            </button>
            <button
              onClick={() => onPatch({ italic: !overlay.italic })}
              className={`flex-1 py-1 rounded text-[10px] border italic ${
                overlay.italic
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200'
              }`}
            >
              I
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={onRemove}
        className="w-full py-1.5 rounded-md text-rose-600 text-[11px] border border-rose-200 hover:bg-rose-50"
      >
        删除该文字
      </button>
    </div>
  );
}

function GeometryPanel({
  overlay,
  onPatch,
}: {
  overlay: Overlay;
  onPatch: (patch: Partial<Overlay>) => void;
}) {
  const NumField = ({
    label,
    value,
    onChange,
    min = 0,
    max = 100,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
  }) => (
    <div>
      <div className="text-[10px] text-neutral-500 mb-0.5">{label}</div>
      <input
        type="number"
        value={Number(value.toFixed(1))}
        min={min}
        max={max}
        step={0.5}
        onChange={(e) => onChange(Number(e.target.value))}
        className="te-input"
      />
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="X (%)" value={overlay.x} onChange={(v) => onPatch({ x: v })} />
        <NumField label="Y (%)" value={overlay.y} onChange={(v) => onPatch({ y: v })} />
        <NumField label="宽 (%)" value={overlay.w} onChange={(v) => onPatch({ w: v })} min={1} />
        <NumField label="高 (%)" value={overlay.h} onChange={(v) => onPatch({ h: v })} min={1} />
      </div>
      <div>
        <div className="text-[10px] text-neutral-500 mb-1">
          旋转 {Math.round(overlay.rotation ?? 0)}°
        </div>
        <input
          type="range"
          min={-180}
          max={180}
          value={overlay.rotation ?? 0}
          onChange={(e) => onPatch({ rotation: Number(e.target.value) })}
          className="w-full"
        />
      </div>
    </div>
  );
}

// —————————— 模板外观折叠面板 ——————————

function AppearancePanel({
  draft,
  update,
  updateColors,
  updateFont,
}: {
  draft: UserTemplate;
  update: (patch: Partial<UserTemplate>) => void;
  updateColors: (patch: Partial<Template['colors']>) => void;
  updateFont: (patch: Partial<Template['fontFamily']>) => void;
}) {
  const handleApplyBgPreset = (make: (c1: string, c2: string) => string) => {
    const c1 = withAlpha(draft.colors.primary, 0.18);
    const c2 = withAlpha(draft.colors.accent, 0.18);
    update({ backgroundPattern: make(c1, c2) });
  };

  return (
    <div className="mt-3 grid md:grid-cols-2 gap-4">
      <Section title="基础信息">
        <Field label="模板描述">
          <input
            type="text"
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
            className="te-input"
            maxLength={50}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="分类">
            <select
              value={draft.category}
              onChange={(e) =>
                update({ category: e.target.value as TemplateCategory })
              }
              className="te-input"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="风格骨架">
            <select
              value={draft.style}
              onChange={(e) => update({ style: e.target.value as TemplateStyle })}
              className="te-input"
              title={STYLE_OPTIONS.find((s) => s.key === draft.style)?.hint}
            >
              {STYLE_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="默认标题">
            <input
              type="text"
              value={draft.defaultTitle}
              onChange={(e) => update({ defaultTitle: e.target.value })}
              className="te-input"
              maxLength={16}
            />
          </Field>
          <Field label="默认副标题">
            <input
              type="text"
              value={draft.defaultSubtitle}
              onChange={(e) => update({ defaultSubtitle: e.target.value })}
              className="te-input"
              maxLength={20}
            />
          </Field>
        </div>
      </Section>

      <Section title="配色">
        <div className="grid grid-cols-5 gap-1.5">
          {(
            [
              ['bg', '页底'],
              ['paper', '纸张'],
              ['primary', '主色'],
              ['accent', '强调'],
              ['text', '文字'],
            ] as const
          ).map(([k, label]) => (
            <ColorField
              key={k}
              label={label}
              value={draft.colors[k]}
              onChange={(v) => updateColors({ [k]: v } as Partial<Template['colors']>)}
            />
          ))}
        </div>
      </Section>

      <Section title="字体">
        <Field label="标题字体">
          <select
            value={draft.fontFamily.title}
            onChange={(e) => updateFont({ title: e.target.value })}
            className="te-input"
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
            className="te-input"
            style={{ fontFamily: draft.fontFamily.body }}
          >
            {FONT_BODY_OPTIONS.map((f) => (
              <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="背景底纹 & 装饰">
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {BG_PRESETS.map((p) => {
            const c1 = withAlpha(draft.colors.primary, 0.18);
            const c2 = withAlpha(draft.colors.accent, 0.18);
            const css = p.make(c1, c2);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => handleApplyBgPreset(p.make)}
                className="rounded-md border border-neutral-200 hover:border-neutral-400 overflow-hidden text-left"
              >
                <div
                  className="h-10"
                  style={{
                    background: css ? `${css}, ${draft.colors.paper}` : draft.colors.paper,
                  }}
                />
                <div className="text-[10px] px-1.5 py-0.5">{p.label}</div>
              </button>
            );
          })}
        </div>
        <Field label="装饰元素（逗号分隔，最多 6 个）">
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
            className="te-input"
          />
        </Field>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white border border-black/5 shadow-sm p-3">
      <h3 className="text-xs font-semibold mb-2 text-neutral-800">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] text-neutral-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-[9px] text-neutral-500 mb-0.5">{label}</div>
      <input
        type="color"
        value={normalizeHex(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 rounded border border-neutral-200 cursor-pointer"
        style={{ padding: 0 }}
      />
    </div>
  );
}
