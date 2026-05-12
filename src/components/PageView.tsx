import type { CSSProperties, MouseEvent as ReactMouseEvent, MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createContext, memo, useContext, useEffect, useRef, useState } from 'react';
import type { BookPage, Overlay, OverlayPhoto, OverlayText, Photo, PhotoFocus, PhotoShape, Template, TemplateStyle } from '../types';
import { defaultVariantId } from '../layoutVariants';

/**
 * 当前页每张照片的"形状"映射，由 PageViewInner 注入。
 * PhotoFrame 通过 context 自动读取自己对应的 shape —— 避免改动所有版式函数签名。
 */
const PhotoShapeContext = createContext<(photo: Photo) => PhotoShape | undefined>(() => undefined);

/**
 * 全页统一的"图片相框颜色覆盖"，由 PageViewInner 注入（值来自 book.theme.photoFrameColor）。
 * null / undefined 表示跟随模板默认；十六进制字符串则强制覆盖所有 style 的主边色。
 * 同样通过 context 读取，避免改动所有版式 → PhotoFrame 的调用签名。
 */
const PhotoFrameColorContext = createContext<string | null | undefined>(undefined);

/**
 * 当前页每张照片的"焦点位置"（object-position 百分比），由 PageViewInner 注入。
 * 同样走 context，方便 PhotoFrame → SafeImg 顺手取用。
 */
const PhotoFocusContext = createContext<(photo: Photo) => PhotoFocus | undefined>(() => undefined);

/**
 * 页面渲染的"设计基准尺寸"——所有版式内的 px 数值（字号、间距、边框、icon 大小）
 * 都按这个尺寸调试。任何上层（缩略图 / 主预览 / PDF 导出）只需把它当作一张
 * 720 × 960 的"原图"，再按需缩放到自己的容器，就能保证视觉一致。
 */
const BASE_PAGE_W = 720;
const BASE_PAGE_H = 960;

/**
 * 编辑器拖拽相关：
 * - 是否处于"可拖拽调整焦点"模式（即用户正点选了某张照片）
 * - 当前选中的照片 id
 * - 拖动回调：传入像素位移 + 容器/图片尺寸；编辑器据此换算 focus 增量并更新 page
 *
 * 这些都通过 context 注入，避免侵入每个版式组件。
 */
interface FocusEditCtx {
  selectedPhotoId: string | null;
  /**
   * 用户在选中态下按住 img 拖动时调用。
   * 拖动起点由 SafeImg 监听 pointerdown 触发 onDragStart，
   * 移动/松手在 SafeImg 内部跟踪 pointermove/up，期间持续调用 onDragMove(dx, dy)。
   * dx, dy 是相对按下点的像素位移。
   */
  onDragMove?: (
    photoId: string,
    info: {
      dx: number;
      dy: number;
      containerW: number;
      containerH: number;
      naturalW: number;
      naturalH: number;
      startFocus: PhotoFocus;
      /** 渲染时叠加在 cover 之上的额外缩放系数；编辑器据此计算可滑动量 slack */
      zoom: number;
    },
  ) => void;
}
const FocusEditContext = createContext<FocusEditCtx>({ selectedPhotoId: null });

/* ============================================================
 *  照片形状工具
 *  - 'rect'    : 保持版式容器比例，不裁剪（默认）
 *  - 'rounded' : 在 rect 基础上圆角
 *  - 'circle'  : 圆（强制 1:1）
 *  - 'heart' / 'star' / 'hexagon' : clip-path 异形（强制 1:1）
 *  说明：
 *    所有版式里的照片块都把"绝对定位/尺寸"交给外层容器，
 *    PhotoFrame 负责 100%×100% 铺满容器并"按形状"对内容 wrapper 做遮罩。
 *    对于非矩形形状（circle/heart/star/hexagon）必须 1:1，
 *    否则图案会被拉扁。此时 ShapeMask 会把自身收成正方形并居中，
 *    保证容器为长方形时形状仍然标准。
 * ============================================================ */
/**
 * 形状裁切定义。所有形状必须满足：
 *  1. 顶点用百分比 → 任意尺寸都能缩放
 *  2. 留出 ~3% 安全边距，避免贴边被父容器/边框吃掉
 *  3. 视觉重心居中（heart 经过下移补偿，避免上半截贴顶）
 */
const CLIP_PATH_MAP: Partial<Record<PhotoShape, string>> = {
  // 心形：用 28 个点的 polygon 近似贝塞尔，整图占满 [3%, 97%]，底尖在 96%
  // 避免原 path() 绝对像素导致随尺寸错位的问题
  heart:
    'polygon(50% 96%, 6% 53%, 4% 38%, 9% 22%, 22% 12%, 36% 12%, 46% 18%, 50% 26%, 54% 18%, 64% 12%, 78% 12%, 91% 22%, 96% 38%, 94% 53%)',
  // 五角星：上下左右严格对称，整图内缩至 [4%, 96%]，让边框/选中态有缓冲
  star:
    'polygon(50% 4%, 61% 36%, 95% 36%, 68% 57%, 78% 92%, 50% 71%, 22% 92%, 32% 57%, 5% 36%, 39% 36%)',
  // 正六边形（flat-top）
  hexagon: 'polygon(25% 2%, 75% 2%, 98% 50%, 75% 98%, 25% 98%, 2% 50%)',
};

/**
 * 与 CLIP_PATH_MAP 同源的 SVG path/points，用来在异形上叠加描边。
 * polygon 用 points，circle/rounded 走原生 stroke。
 */
const SHAPE_SVG_POLYGON: Partial<Record<PhotoShape, string>> = {
  heart:
    '50,96 6,53 4,38 9,22 22,12 36,12 46,18 50,26 54,18 64,12 78,12 91,22 96,38 94,53',
  star:
    '50,4 61,36 95,36 68,57 78,92 50,71 22,92 32,57 5,36 39,36',
  hexagon: '25,2 75,2 98,50 75,98 25,98 2,50',
};

/** 是否需要强制 1:1 的形状 */
function shapeForcesSquare(shape?: PhotoShape): boolean {
  return shape === 'circle' || shape === 'heart' || shape === 'star' || shape === 'hexagon';
}

/**
 * 判断一个字符串是否为内置 TemplateStyle；
 * cover / single / single-portrait 的 variantOverride 允许直接复用这些 style 作为骨架选项，
 * 额外的 variant（如 'poster' / 'filmstrip'）走各 layout 专属分支。
 */
const TEMPLATE_STYLE_SET: ReadonlySet<TemplateStyle> = new Set<TemplateStyle>([
  'watercolor',
  'cartoon',
  'minimal',
  'vintage',
  'festival-cn',
  'festival-xmas',
]);
function isTemplateStyle(v: unknown): v is TemplateStyle {
  return typeof v === 'string' && TEMPLATE_STYLE_SET.has(v as TemplateStyle);
}

/**
 * 把任意内容（img / div）按形状裁切。
 * - rect: 不裁切，直接返回子节点
 * - rounded: 加圆角
 * - circle: 圆形 + 强制 1:1
 * - heart/star/hexagon: clip-path + 强制 1:1
 *
 * 当父容器不是 1:1 时，ShapeMask 会把自己 inset 到正方形尺寸并居中。
 *
 * borderColor：可选，给异形/圆形叠加一层描边
 *   - circle/rounded: 原生 outline 模拟
 *   - heart/star/hexagon: 在上方叠一个绝对定位的 SVG，stroke 同形 path
 */
function ShapeMask({
  shape,
  children,
  extraStyle,
  extraClassName = '',
  borderColor,
  borderWidth = 3,
}: {
  shape?: PhotoShape;
  children: ReactNode;
  extraStyle?: CSSProperties;
  extraClassName?: string;
  borderColor?: string | null;
  borderWidth?: number;
}) {
  if (!shape || shape === 'rect') {
    return (
      <div className={`w-full h-full overflow-hidden ${extraClassName}`} style={extraStyle}>
        {children}
      </div>
    );
  }
  if (shape === 'rounded') {
    return (
      <div
        className={`w-full h-full overflow-hidden ${extraClassName}`}
        style={{
          borderRadius: '18%',
          border: borderColor ? `${borderWidth}px solid ${borderColor}` : undefined,
          ...extraStyle,
        }}
      >
        {children}
      </div>
    );
  }
  // 非矩形异形：强制 1:1 + 居中
  const clip = CLIP_PATH_MAP[shape];
  const baseStyle: CSSProperties = {
    aspectRatio: '1 / 1',
    borderRadius: shape === 'circle' ? '50%' : undefined,
    clipPath: clip,
    WebkitClipPath: clip,
    ...extraStyle,
  };
  // 描边：异形（heart/star/hexagon）用同形 SVG 叠在上方；circle 直接 box-shadow inset
  const polyPoints = SHAPE_SVG_POLYGON[shape];
  // 外层用 flex 居中 + 内层自适应为正方形（取 min(宽, 高)）
  return (
    <div className={`w-full h-full flex items-center justify-center ${extraClassName}`}>
      <div
        className="relative"
        style={{
          height: '100%',
          width: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          aspectRatio: '1 / 1',
        }}
      >
        <div className="overflow-hidden w-full h-full" style={baseStyle}>
          {children}
        </div>
        {borderColor && shape === 'circle' && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: '50%',
              border: `${borderWidth}px solid ${borderColor}`,
            }}
          />
        )}
        {borderColor && polyPoints && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polygon
              points={polyPoints}
              fill="none"
              stroke={borderColor}
              strokeWidth={borderWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

interface Props {
  page: BookPage;
  photos: Photo[];
  template: Template;
  babyName?: string;
  dateRange?: string;
  /** 纯展示模式下基准宽度，用于 html2canvas 导出 */
  width?: number;
  height?: number;
  /**
   * 编辑器模式：点击页面内的照片时触发"选中"；
   * 点击页面空白区域时以 null 触发，用于取消选中。
   * 未传该回调时，页面图片不响应点击（纯展示）。
   */
  onSelectPhoto?: (photoId: string | null) => void;
  /**
   * 当前被选中的照片 id（来自外部状态）；被选中的照片会高亮描边，
   * 其他照片略微降亮，提示用户下一步可以在图库里点一张来替换它。
   */
  selectedPhotoId?: string | null;
  /**
   * 图片相框颜色覆盖（来自 book.theme.photoFrameColor）。
   * null / undefined 表示跟随模板默认；十六进制串则覆盖所有 style 的主边色。
   */
  photoFrameColor?: string | null;
  /**
   * 当用户在编辑器选中某张照片后，拖动该照片调整画面焦点（object-position）时触发。
   * 仅在编辑器里传；纯展示态忽略即可。
   * 内部会换算为 focus 百分比（0~100）增量并应用到 BookPage.photoFocus[slot]。
   */
  onAdjustFocus?: (
    photoId: string,
    info: {
      dx: number;
      dy: number;
      containerW: number;
      containerH: number;
      naturalW: number;
      naturalH: number;
      startFocus: PhotoFocus;
      zoom: number;
    },
  ) => void;
  /**
   * 自由叠层数据。优先取此 prop；不传则使用 page.overlays。
   * 之所以单独抽 prop，是因为编辑器经常在「未提交到 page」时实时预览拖拽态。
   */
  overlays?: Overlay[];
  /** 当前选中的叠层 id（仅编辑模式下生效） */
  selectedOverlayId?: string | null;
  /** 选中叠层（点击叠层 → id；点击空白 → null）。传该回调即视为"叠层可编辑" */
  onSelectOverlay?: (id: string | null) => void;
  /** 叠层数组发生变化（拖动/缩放/旋转结束）时回调 */
  onOverlaysChange?: (next: Overlay[]) => void;
}

/**
 * 一页画册的渲染组件
 * 按 template.style 走完全不同的视觉骨架：
 *   watercolor / cartoon / minimal / vintage / festival-cn / festival-xmas
 */
function PageViewInner({ page, photos, template, babyName, dateRange, width, height, onSelectPhoto, selectedPhotoId, photoFrameColor, onAdjustFocus, overlays: overlaysProp, selectedOverlayId, onSelectOverlay, onOverlaysChange }: Props) {
  const photoMap = new Map(photos.map((p) => [p.id, p]));
  // src → photoId 反查表：点击 <img> 时靠 src 反查 photoId（浏览器 img.src 会返回绝对 URL，
  // 但 dataURL/blob/相对路径我们都完整保存在 Photo.src 里，所以用 endsWith 做兜底匹配）。
  const srcToId = new Map(photos.map((p) => [p.src, p.id]));
  // 只保留 src 非空的有效照片，避免出现空白相框
  const pagePhotos = page.photoIds
    .map((id) => photoMap.get(id))
    .filter((p): p is Photo => !!p && !!p.src);

  // 维护"有效照片 → 原始 slot 索引"的映射，这样取 shape 时能对上 page.photoShapes
  const slotOfPagePhoto = new Map<string, number>();
  page.photoIds.forEach((id, i) => {
    const ph = photoMap.get(id);
    if (ph && ph.src && !slotOfPagePhoto.has(ph.id)) {
      slotOfPagePhoto.set(ph.id, i);
    }
  });
  /** 取给定 photo 的形状（来自 page.photoShapes 在 photoIds 中的索引）。 */
  const shapeFor = (photo?: Photo): PhotoShape | undefined => {
    if (!photo) return undefined;
    const slot = slotOfPagePhoto.get(photo.id);
    if (slot == null) return undefined;
    return page.photoShapes?.[slot];
  };

  /** 取给定 photo 的焦点（同样按 slot 对应到 page.photoFocus）。 */
  const focusFor = (photo?: Photo): PhotoFocus | undefined => {
    if (!photo) return undefined;
    const slot = slotOfPagePhoto.get(photo.id);
    if (slot == null) return undefined;
    return page.photoFocus?.[slot];
  };

  const { colors, fontFamily, backgroundPattern } = template;

  /**
   * 照片版式的兜底降级：
   *   原版式要求 N 张，实际只有 M 张（M < N）时，自动降级到能渲染的最高版式，
   *   保证任何情况都不会出现"纯空白页"。
   */
  const resolvedLayout: BookPage['layout'] = (() => {
    if (
      page.layout === 'cover' ||
      page.layout === 'text' ||
      page.layout === 'ending' ||
      page.layout === 'free'
    ) {
      return page.layout;
    }
    const n = pagePhotos.length;
    if (n === 0) return 'text'; // 零图 → 走纯文字版式兜底
    if (page.layout === 'grid6' && n < 6) {
      return n >= 5 ? 'grid5' : n >= 4 ? 'grid4' : n >= 3 ? 'triple' : n >= 2 ? 'double' : 'single';
    }
    if (page.layout === 'grid5' && n < 5) {
      return n >= 4 ? 'grid4' : n >= 3 ? 'triple' : n >= 2 ? 'double' : 'single';
    }
    if (page.layout === 'grid4' && n < 4) return n >= 3 ? 'triple' : n >= 2 ? 'double' : 'single';
    if (page.layout === 'triple' && n < 3) return n >= 2 ? 'double' : 'single';
    if (page.layout === 'double' && n < 2) return 'single';
    return page.layout;
  })();

  // 为兜底到 text 版式时构造保底文案，避免页面空荡
  const fallbackPage: BookPage =
    resolvedLayout === 'text' && page.layout !== 'text'
      ? {
          ...page,
          layout: 'text',
          title: page.title ?? page.caption ?? template.defaultTitle,
          caption: page.caption ?? template.defaultSubtitle,
        }
      : page;

  // 关键：所有版式内的 px 数值（字号、padding、border 等）都是按
  // "720 × 960 的设计基准"调出来的（与 exportPdf.tsx 中 RENDER_W/H 一致，
  // 也与 types.ts 中 OverlayText.fontSize 注释一致）。
  // 因此这里固定让"页面内容"以 720 × 960 渲染，再由外层 ScaledStage
  // 用 transform: scale 把它缩放到父容器实际尺寸。这样左侧 ~104px 的缩略图
  // 与中央 ~440px 的主预览 视觉上完全等比，且导出（720×960）像素级对齐。
  const fixedRender = !!(width && height); // 导出路径：禁用 scale，直接 1:1
  // 文字字号倍率（CSS 变量），由本页 page.titleScale / subtitleScale / captionScale 驱动；
  // 各 layout 子组件在标题/副标题/正文渲染处加 data-pv-text 标记，由全局 CSS 应用 zoom。
  const clampScale = (v: number | undefined) =>
    Math.max(0.6, Math.min(1.8, typeof v === 'number' && Number.isFinite(v) ? v : 1));
  const pageStyle: CSSProperties = {
    background: backgroundPattern
      ? `${backgroundPattern}, ${colors.paper}`
      : colors.paper,
    color: colors.text,
    fontFamily: fontFamily.body,
    width: fixedRender ? `${width}px` : `${BASE_PAGE_W}px`,
    height: fixedRender ? `${height}px` : `${BASE_PAGE_H}px`,
    ['--pv-zoom-title' as any]: clampScale(page.titleScale),
    ['--pv-zoom-subtitle' as any]: clampScale(page.subtitleScale),
    ['--pv-zoom-caption' as any]: clampScale(page.captionScale),
  };

  const editable = !!onSelectPhoto;

  // 编辑模式：点击图片 → onSelectPhoto(photoId)；点击空白 → onSelectPhoto(null)
  // 兼容两种渲染：<img data-photo-id> 与 <div data-photo-id>（cover 背景方案）
  const handleImgClick = editable
    ? (e: ReactMouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        // 若点击发生在自由叠层（OverlayLayer）内部，则交给 OverlayLayer 自己处理，
        // 不再误命中 overlay 内部 PhotoFrame 渲染出的 <img data-photo-id>
        if (target.closest('[data-overlay-id]')) {
          return;
        }
        const photoEl = target.closest('[data-photo-id]') as HTMLElement | null;
        if (!photoEl) {
          // 点击的是空白区域：取消选中
          onSelectPhoto!(null);
          return;
        }
        // 优先用 dataset.photoId（精准），再退回到按 src 反查（仅 <img> 适用）
        const datasetId = photoEl.dataset.photoId;
        let pid = datasetId;
        if (!pid && photoEl.tagName === 'IMG') {
          const imgEl = photoEl as HTMLImageElement;
          // img.src 在浏览器里可能被解析成绝对 URL；dataURL/blob: 不会变
          const rawSrc = imgEl.getAttribute('src') ?? '';
          pid = srcToId.get(rawSrc) ?? srcToId.get(imgEl.src);
        }
        if (!pid) {
          onSelectPhoto!(null);
          return;
        }
        e.stopPropagation();
        onSelectPhoto!(pid);
      }
    : undefined;

  // 选中态：若有 selectedPhotoId，则根页面容器挂一个 data 属性，
  // 配合 CSS 让选中图片高亮、其他图片降亮。
  const selectedAttr = selectedPhotoId ?? undefined;

  // 把"被选中"这个状态直接标注到对应节点上（data-selected="true"），
  // 以便 CSS 用 [data-selected] 选择器命中它，无需让每个版式子组件都感知选中 id。
  // 兼容 <img data-photo-id> 与 <div data-photo-id>（cover 背景方案）。
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>('[data-photo-id]');
    nodes.forEach((el) => {
      if (selectedAttr && el.dataset.photoId === selectedAttr) {
        el.dataset.selected = 'true';
      } else {
        delete el.dataset.selected;
      }
    });
  });

  // 文字字号倍率：基于"渲染后内容匹配"自动给标题/副标题/正文元素打 data-pv-text 标记。
  // 不入侵 14 种版式子组件的 JSX：扫描根容器内所有元素，找出直接文本子节点恰好等于
  // page.title / subtitle / caption 的那一个元素，命中即打标记，由全局 CSS 应用 zoom。
  // 之所以匹配"直接文本"而不是 textContent：避免父级 wrapper 误命中（其 textContent 也含子节点）。
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // 先清掉旧标记（页码切换 / page 切换时要重置）
    const prev = root.querySelectorAll<HTMLElement>('[data-pv-text]');
    prev.forEach((el) => {
      delete el.dataset.pvText;
    });

    // 取出本页有效的待匹配文本（兼容 fallbackPage：text 兜底版式会替换 title/caption）
    const titles = [page.title, fallbackPage.title].filter(
      (s): s is string => typeof s === 'string' && s.trim().length > 0,
    );
    const subtitles = [page.subtitle, fallbackPage.subtitle].filter(
      (s): s is string => typeof s === 'string' && s.trim().length > 0,
    );
    const captions = [page.caption, fallbackPage.caption].filter(
      (s): s is string => typeof s === 'string' && s.trim().length > 0,
    );

    if (titles.length === 0 && subtitles.length === 0 && captions.length === 0) return;

    // 取元素的"直接文本"：仅拼接直接子节点中的 text node；
    // 这样可以区分 <h1>{title}</h1> 与 <div>{title}<span>…</span></div>
    // 后者直接文本 = title 也算命中（因为 title 仍是其直接子节点的全部文本之一）；
    // 但前者更精确，多数版式都是这种简洁结构。
    const directText = (el: Element) => {
      let s = '';
      el.childNodes.forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) s += n.nodeValue ?? '';
      });
      return s.trim();
    };

    const all = root.querySelectorAll<HTMLElement>('*');
    // 跳过 OverlayLayer 内部（OverlayText 有自己的 fontSize，不参与本页字段倍率）
    const isInsideOverlay = (el: Element) => !!el.closest('[data-overlay-id]');

    all.forEach((el) => {
      if (el.dataset.pvText) return; // 已被打过标记的不重复
      if (isInsideOverlay(el)) return;
      const t = directText(el);
      if (!t) return;
      if (titles.some((x) => x.trim() === t)) {
        el.dataset.pvText = 'title';
      } else if (subtitles.some((x) => x.trim() === t)) {
        el.dataset.pvText = 'subtitle';
      } else if (captions.some((x) => x.trim() === t)) {
        el.dataset.pvText = 'caption';
      }
    });
  });

  const pageNode = (
    <div
      ref={rootRef}
      className={`relative overflow-hidden shadow-book rounded-md ${editable ? 'pv-editable' : ''}${selectedAttr ? ' pv-has-selection' : ''}`}
      style={pageStyle}
      onClick={handleImgClick}
      data-selected-photo-id={selectedAttr}
    >
      {/* 风格化装饰层 */}
      <StyleDecorations template={template} />

      {/* 按版式渲染（使用降级后的 resolvedLayout，保证永不空白） */}
      <PhotoFrameColorContext.Provider value={photoFrameColor ?? null}>
      <PhotoShapeContext.Provider value={shapeFor}>
      <PhotoFocusContext.Provider value={focusFor}>
      <FocusEditContext.Provider
        value={{
          selectedPhotoId: selectedPhotoId ?? null,
          onDragMove: onAdjustFocus,
        }}
      >
      {resolvedLayout === 'cover' && (
        <CoverLayout
          photo={pagePhotos[0]}
          title={page.title ?? template.defaultTitle}
          subtitle={page.subtitle ?? template.defaultSubtitle}
          babyName={babyName}
          dateRange={dateRange}
          template={template}
          variantOverride={page.variant}
        />
      )}

      {resolvedLayout === 'single' && pagePhotos[0] && (
        <SingleLayout photo={pagePhotos[0]} caption={page.caption} template={template} variantOverride={page.variant} />
      )}

      {resolvedLayout === 'single-portrait' && pagePhotos[0] && (
        <SinglePortraitLayout
          photo={pagePhotos[0]}
          caption={page.caption}
          template={template}
          variantOverride={page.variant}
        />
      )}

      {resolvedLayout === 'double' && pagePhotos.length >= 2 && (
        <DoubleLayout photos={pagePhotos} caption={page.caption} template={template} variantOverride={page.variant} />
      )}

      {resolvedLayout === 'triple' && pagePhotos.length >= 3 && (
        <TripleLayout photos={pagePhotos} caption={page.caption} template={template} variantOverride={page.variant} />
      )}

      {resolvedLayout === 'grid4' && pagePhotos.length >= 4 && (
        <Grid4Layout photos={pagePhotos} caption={page.caption} template={template} variantOverride={page.variant} />
      )}

      {resolvedLayout === 'grid5' && pagePhotos.length >= 5 && (
        <Grid5Layout photos={pagePhotos} caption={page.caption} template={template} variantOverride={page.variant} />
      )}

      {resolvedLayout === 'grid6' && pagePhotos.length >= 6 && (
        <Grid6Layout photos={pagePhotos} caption={page.caption} template={template} variantOverride={page.variant} />
      )}
      </FocusEditContext.Provider>
      </PhotoFocusContext.Provider>
      </PhotoShapeContext.Provider>
      </PhotoFrameColorContext.Provider>

      {/* 自由叠层（画框 / 文字）—— 永远渲染在版式骨架之上 */}
      <OverlayLayer
        overlays={overlaysProp ?? page.overlays ?? []}
        photos={photos}
        template={template}
        photoFrameColor={photoFrameColor ?? null}
        editable={!!onSelectOverlay}
        selectedOverlayId={selectedOverlayId ?? null}
        onSelectOverlay={onSelectOverlay}
        onOverlaysChange={onOverlaysChange}
        containerRef={rootRef}
      />

      {resolvedLayout === 'text' && <TextLayout page={fallbackPage} template={template} />}

      {resolvedLayout === 'ending' && <EndingLayout page={page} template={template} babyName={babyName} />}
    </div>
  );

  // 导出路径（width && height 已传入）：固定像素尺寸直接渲染，无需缩放
  if (fixedRender) return pageNode;

  // 普通预览路径：用 ScaledStage 把 720×960 的"原图"等比缩放到父容器
  return <ScaledStage>{pageNode}</ScaledStage>;
}

/**
 * ScaledStage —— 把内部以 BASE_PAGE_W × BASE_PAGE_H 渲染的页面
 * 按父容器实际宽度等比 transform: scale 到位。
 *
 * 为什么要这么做：
 *   PageView 内部所有版式的 px 数值（字号 64/84/92、内边距、边框、SVG 装饰）
 *   都是按 720 × 960 的设计基准调出来的。如果直接 width:100% 让它撑到
 *   ~104px 的缩略图里，文字就成了"巨型字"；撑到 ~440px 的主预览又是另一个尺寸。
 *   所以唯一让左/中/导出三处视觉一致的办法，就是固定基准、整体缩放。
 *
 * 实现细节：
 *   - 外层 div 设 aspectRatio: 3/4，保证占位高度正确（Flex/Grid 友好）。
 *   - ResizeObserver 测量外层实际宽度 → 算出 scale = realW / BASE_PAGE_W。
 *   - 内层 div transform-origin: top left + scale，并把 width/height 反向放大成
 *     设计基准尺寸：父级实际占位 = BASE × scale = realW，刚好填满。
 *   - 没有有效宽度（初始 / 隐藏）时 scale 兜底为 1，不至于把内容挤成 0。
 */
function ScaledStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / BASE_PAGE_W);
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    // 浏览器不支持时退到 window resize，不至于完全不响应
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        aspectRatio: '3 / 4',
        // 不用 overflow:hidden —— 让 OverlayLayer 的拖拽手柄等
        // 在编辑模式下可以稍微溢出页面边缘也能被点中；
        // 子层 PageView 自身已经 overflow:hidden 限制内容裁剪。
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${BASE_PAGE_W}px`,
          height: `${BASE_PAGE_H}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * 使用 React.memo 包装 —— 画册详情页把全部 12 页都预渲染堆叠在一起，
 * 当仅切换 index 时，父组件重渲会触发所有 PageView 重新 render 一遍
 * （包括重新构造照片 Map / 跑版式降级判断）。memo 后只有 props 真正变化的那页
 * 会重新渲染，其它页的 DOM 完全稳定，避免肉眼可见的重排抖动。
 */
export const PageView = memo(PageViewInner, (prev, next) => {
  return (
    prev.page === next.page &&
    prev.photos === next.photos &&
    prev.template === next.template &&
    prev.babyName === next.babyName &&
    prev.dateRange === next.dateRange &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.onSelectPhoto === next.onSelectPhoto &&
    prev.selectedPhotoId === next.selectedPhotoId &&
    prev.photoFrameColor === next.photoFrameColor &&
    prev.onAdjustFocus === next.onAdjustFocus &&
    prev.overlays === next.overlays &&
    prev.selectedOverlayId === next.selectedOverlayId &&
    prev.onSelectOverlay === next.onSelectOverlay &&
    prev.onOverlaysChange === next.onOverlaysChange
  );
});

/* ============================================================
 *  风格化装饰层（四角/边框）—— 每个 style 都不同
 * ============================================================ */
function StyleDecorations({ template }: { template: Template }) {
  const { style, colors, decorations } = template;

  if (style === 'watercolor') {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-6 -left-6 w-28 h-28 rounded-full opacity-40 blur-xl"
          style={{ background: colors.primary }}
        />
        <div
          className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full opacity-30 blur-xl"
          style={{ background: colors.accent }}
        />
        <span className="absolute top-3 left-4 text-2xl opacity-70" style={{ color: colors.primary }}>
          {decorations[0]}
        </span>
        <span className="absolute bottom-3 right-4 text-xl opacity-60" style={{ color: colors.accent }}>
          {decorations[decorations.length - 1]}
        </span>
      </div>
    );
  }

  if (style === 'cartoon') {
    return (
      <div className="pointer-events-none absolute inset-0">
        {/* 斜条纹背景带 */}
        <div
          className="absolute top-0 left-0 right-0 h-3"
          style={{
            background: `repeating-linear-gradient(45deg, ${colors.primary} 0 10px, ${colors.accent} 10px 20px)`,
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-3"
          style={{
            background: `repeating-linear-gradient(45deg, ${colors.accent} 0 10px, ${colors.primary} 10px 20px)`,
          }}
        />
        {/* 糖果圆点 */}
        <div className="absolute top-6 right-3 text-2xl">{decorations[0]}</div>
        <div className="absolute bottom-6 left-3 text-xl">{decorations[1] ?? decorations[0]}</div>
        <div
          className="absolute top-1/3 -left-3 w-7 h-7 rounded-full opacity-70"
          style={{ background: colors.accent }}
        />
        <div
          className="absolute top-2/3 -right-4 w-9 h-9 rounded-full opacity-60"
          style={{ background: colors.primary }}
        />
      </div>
    );
  }

  if (style === 'minimal') {
    return (
      <div className="pointer-events-none absolute inset-0">
        {/* 极细边框 + 一条水平细线 */}
        <div
          className="absolute inset-3 border"
          style={{ borderColor: colors.accent, opacity: 0.35 }}
        />
        <div
          className="absolute top-1/2 left-8 right-8 h-px"
          style={{ background: colors.accent, opacity: 0.2 }}
        />
        <span
          className="absolute bottom-4 right-5 text-[9px] tracking-[0.4em]"
          style={{ color: colors.accent }}
        >
          BABY · BOOK
        </span>
      </div>
    );
  }

  if (style === 'vintage') {
    return (
      <div className="pointer-events-none absolute inset-0">
        {/* 胶片齿孔（左右两排小方块） */}
        <div className="absolute left-1 top-3 bottom-3 flex flex-col justify-around">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-2 rounded-sm"
              style={{ background: `${colors.accent}66` }}
            />
          ))}
        </div>
        <div className="absolute right-1 top-3 bottom-3 flex flex-col justify-around">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-2 rounded-sm"
              style={{ background: `${colors.accent}66` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (style === 'festival-cn') {
    return (
      <div className="pointer-events-none absolute inset-0">
        {/* 双层红色边框 */}
        <div
          className="absolute inset-2 border-2"
          style={{ borderColor: colors.primary }}
        />
        <div
          className="absolute inset-3 border"
          style={{ borderColor: colors.accent, opacity: 0.7 }}
        />
        <span className="absolute top-4 right-5 text-2xl">{decorations[0]}</span>
        <span className="absolute bottom-4 left-5 text-2xl">{decorations[1] ?? '🏮'}</span>
      </div>
    );
  }

  if (style === 'festival-xmas') {
    return (
      <div className="pointer-events-none absolute inset-0">
        {/* 雪花四角 */}
        <span className="absolute top-2 left-3 text-xl" style={{ color: colors.primary }}>❄</span>
        <span className="absolute top-2 right-3 text-xl" style={{ color: colors.accent }}>❄</span>
        <span className="absolute bottom-2 left-3 text-xl" style={{ color: colors.accent }}>❄</span>
        <span className="absolute bottom-2 right-3 text-xl" style={{ color: colors.primary }}>❄</span>
        {/* 底部松枝丝带感 */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1.5"
          style={{
            background: `repeating-linear-gradient(90deg, ${colors.primary} 0 12px, ${colors.accent} 12px 24px)`,
          }}
        />
      </div>
    );
  }

  return null;
}

/* ============================================================
 *  封面无照片兜底：风格化占位（不是空白色块）
 * ============================================================ */
function CoverPlaceholder({ template, title }: { template: Template; title?: string }) {
  const { colors, fontFamily, decorations } = template;
  return (
    <div
      className="h-full w-full flex flex-col items-center justify-center gap-3 text-center px-6"
      style={{
        background: `linear-gradient(135deg, ${colors.primary}dd 0%, ${colors.accent}dd 100%)`,
        color: colors.paper,
      }}
    >
      <div className="text-5xl opacity-90">{decorations[0] ?? '✿'}</div>
      <div
        className="text-2xl font-bold leading-tight max-w-[80%]"
        style={{ fontFamily: fontFamily.title }}
      >
        {title ?? template.defaultTitle}
      </div>
      <div
        className="text-[10px] tracking-[0.4em] opacity-80"
        style={{ fontFamily: fontFamily.title }}
      >
        BABY · BOOK
      </div>
    </div>
  );
}

/* ============================================================
 *  图片加载兜底 + 焦点拖拽：
 *  - 加载失败时渲染占位块，避免空白相框
 *  - cover 模式下使用 div + background-image 渲染：自己计算
 *    `background-size = (iw*s*z, ih*s*z)`（s=cover 缩放，z=FOCUS_ZOOM），
 *    使横/纵两个轴都有 slack > 0。这样切到圆/心/星等异形相框后，
 *    用户可以任意方向拖动调整画面焦点（object-position）。
 *  - contain 模式仍用 <img>，object-fit: contain 保留留白，无需拖动。
 *  - 通过 PhotoFocusContext 应用 background-position
 *  - 当处于编辑器选中态（FocusEditContext 命中且本图被选中）时
 *    支持鼠标/触屏按下拖动来调整焦点
 * ============================================================ */
function SafeImg({
  src,
  alt = '',
  template,
  className = '',
  style,
  fit = 'cover',
  photoId,
}: {
  src: string;
  alt?: string;
  template: Template;
  className?: string;
  style?: CSSProperties;
  fit?: 'cover' | 'contain';
  photoId?: string;
}) {
  const [failed, setFailed] = useState(false);
  // 自然尺寸：cover 模式下用于精确算 background-size 与 slack
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const focusFromCtx = useContext(PhotoFocusContext);
  const { selectedPhotoId, onDragMove } = useContext(FocusEditContext);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 取该图焦点；缺省居中。仅在 cover 模式下需要（contain 不会裁切，无需调整）。
  const focus =
    photoId && fit === 'cover'
      ? (focusFromCtx({ id: photoId } as unknown as Photo) ?? { x: 50, y: 50 })
      : { x: 50, y: 50 };

  // 是否进入"可拖拽调整焦点"态：编辑器里选中了这张图，且 fit=cover
  const draggable =
    !!photoId && !!selectedPhotoId && photoId === selectedPhotoId && !!onDragMove && fit === 'cover';

  /**
   * cover 之上的额外放大系数（FOCUS_ZOOM）：
   * 纯 cover 时只有"长出来的那一轴"会被裁切，另一轴 slack=0，
   * 表现为只能单方向拖动；尤其方图放进 1:1 相框时两个方向都拖不动。
   * 在 cover 之上再放大 15%，两个轴都会有 ≥(z-1)*容器尺寸 的可滑动量，
   * 用户切换形状后能任意方向微调画面。
   */
  const FOCUS_ZOOM = fit === 'cover' ? 1.15 : 1;

  // 拖拽事件：pointerdown 起，pointermove/up 跟踪整段位移并持续派发增量
  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggable || !photoId || !onDragMove) return;
    const containerEl = containerRef.current;
    if (!containerEl) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = containerEl.getBoundingClientRect();
    const containerW = rect.width;
    const containerH = rect.height;
    const naturalW = natural?.w ?? 1;
    const naturalH = natural?.h ?? 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const startFocus: PhotoFocus = { x: focus.x, y: focus.y };

    try {
      containerEl.setPointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }

    const onMove = (ev: PointerEvent) => {
      onDragMove(photoId, {
        dx: ev.clientX - startX,
        dy: ev.clientY - startY,
        containerW,
        containerH,
        naturalW,
        naturalH,
        startFocus,
        zoom: FOCUS_ZOOM,
      });
    };
    const onUp = (ev: PointerEvent) => {
      try {
        containerEl.releasePointerCapture(ev.pointerId);
      } catch {
        /* 忽略 */
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  if (!src || failed) {
    return (
      <div className={`h-full w-full ${className}`} style={style}>
        <CoverPlaceholder template={template} />
      </div>
    );
  }

  // contain 模式：仍走 <img>，object-fit:contain 保留留白
  if (fit === 'contain') {
    return (
      <img
        src={src}
        alt={alt}
        loading="eager"
        decoding="async"
        draggable={false}
        data-photo-id={photoId}
        className={`h-full w-full object-contain ${className}`}
        style={style}
        onError={() => setFailed(true)}
        ref={(el) => {
          if (el && el.decode) {
            el.decode().catch(() => {});
          }
        }}
      />
    );
  }

  /**
   * cover 模式：把渲染逻辑下沉到 SafeImgCoverInner，
   * 它内部用 ResizeObserver 测容器尺寸，配合 natural 像素值
   * 把 background-size 算成 cover * FOCUS_ZOOM 的精确像素，
   * 使横/纵两个轴都有 slack > 0，配合 background-position 实现拖动调焦。
   */
  return (
    <SafeImgCoverInner
      src={src}
      alt={alt}
      photoId={photoId}
      className={className}
      style={style}
      focus={focus}
      zoom={FOCUS_ZOOM}
      draggable={draggable}
      containerRef={containerRef}
      handlePointerDown={handlePointerDown}
      onLoad={(w, h) => setNatural({ w, h })}
      onFail={() => setFailed(true)}
      natural={natural}
    />
  );
}

/**
 * cover 模式真正负责渲染的子组件。把 ResizeObserver / 加载兜底逻辑
 * 收敛在这里，让上层 SafeImg 函数体保持紧凑。
 */
function SafeImgCoverInner(props: {
  src: string;
  alt: string;
  photoId?: string;
  className: string;
  style?: CSSProperties;
  focus: PhotoFocus;
  zoom: number;
  draggable: boolean;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  handlePointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onLoad: (w: number, h: number) => void;
  onFail: () => void;
  natural: { w: number; h: number } | null;
}) {
  const {
    src,
    alt,
    photoId,
    className,
    style,
    focus,
    zoom,
    draggable,
    containerRef,
    handlePointerDown,
    onLoad,
    onFail,
    natural,
  } = props;

  // 测量容器实际宽高，结合自然尺寸算 background-size 的像素值
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize({ w: r.width, h: r.height });
      }
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
    // containerRef 是 ref，不算依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 计算 background-size 像素值：cover 缩放 × zoom
  let backgroundSize: string = 'cover';
  if (natural && size && natural.w > 0 && natural.h > 0 && size.w > 0 && size.h > 0) {
    const coverScale = Math.max(size.w / natural.w, size.h / natural.h);
    const s = coverScale * zoom;
    const bgW = natural.w * s;
    const bgH = natural.h * s;
    backgroundSize = `${bgW}px ${bgH}px`;
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{
        ...(style ?? {}),
        ...(draggable ? { cursor: 'grab', touchAction: 'none' as const } : null),
      }}
      data-photo-id={photoId}
      data-focus-draggable={draggable ? 'true' : undefined}
      onPointerDown={draggable ? handlePointerDown : undefined}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${src}")`,
          backgroundRepeat: 'no-repeat',
          backgroundSize,
          backgroundPosition: `${focus.x}% ${focus.y}%`,
        }}
      />
      {/* 隐形 img：用于读 naturalWidth/Height + 触发加载失败兜底 */}
      <img
        src={src}
        alt={alt}
        aria-hidden
        draggable={false}
        decoding="async"
        loading="eager"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
        onLoad={(ev) => {
          const el = ev.currentTarget;
          onLoad(el.naturalWidth || 1, el.naturalHeight || 1);
        }}
        onError={onFail}
      />
    </div>
  );
}

/* ============================================================
 *  通用工具：为照片提供不同风格的"相框"
 * ============================================================ */
function PhotoFrame({
  photo,
  template,
  rotate = 0,
  className = '',
  fit = 'cover',
  shape: shapeProp,
}: {
  photo: Photo;
  template: Template;
  rotate?: number;
  className?: string;
  /**
   * 'cover'：默认，填满相框并裁切边缘（照片比例与相框不一致时会丢失一部分画面）
   * 'contain'：完整显示照片、不变形不裁切，多余空间由相框纸色填充（适合水彩等对"形状舒服"要求极高的风格）
   */
  fit?: 'cover' | 'contain';
  /**
   * 用户对该 slot 指定的相框形状（rect/rounded/circle/heart/star/hexagon）。
   * 不传则从 PhotoShapeContext 自动读取（避免每处版式都手写）。
   * - rect / undefined：保持原 style 相框
   * - rounded：在原 style 相框外再套一层大圆角 mask，兼容所有风格
   * - 异形（circle/heart/star/hexagon）：不走 style 相框（polaroid 白边等会破形），
   *   直接在正方形区域内用 clip-path 对照片本身做裁切
   */
  shape?: PhotoShape;
}) {
  const { style, colors } = template;
  const shapeFromCtx = useContext(PhotoShapeContext);
  const shape = shapeProp ?? shapeFromCtx(photo);
  // 用户对图片边框颜色的覆盖（优先级高于 style 默认值）
  const frameColorOverride = useContext(PhotoFrameColorContext) || null;

  // —— 异形：不套 style 相框，直接对 img 整形（保证形状干净），但要给一层描边作为相框 ——
  if (shape && shapeForcesSquare(shape)) {
    // 描边色：用户覆盖优先；否则按当前 style 取一个合适的主边色
    const isDarkPaper =
      template.colors.paper.startsWith('#1') ||
      template.colors.paper.startsWith('#2') ||
      template.colors.paper.startsWith('#3');
    const styleDefaultBorder =
      style === 'vintage'
        ? isDarkPaper
          ? '#F2E7D0'
          : '#FFFEF7'
        : style === 'minimal'
          ? `${colors.accent}88`
          : colors.primary;
    const strokeColor = frameColorOverride ?? styleDefaultBorder;
    return (
      <div
        className={`${className}`}
        style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
      >
        <ShapeMask shape={shape} borderColor={strokeColor} borderWidth={3}>
          <SafeImg src={photo.src} template={template} fit="cover" photoId={photo.id} />
        </ShapeMask>
      </div>
    );
  }

  // —— 原 style 相框 ——
  let frame: ReactNode;

  if (style === 'vintage') {
    // Polaroid：厚米白边 + 轻微旋转（深色纸也适配）
    const isDarkPaper =
      template.colors.paper.startsWith('#1') ||
      template.colors.paper.startsWith('#2') ||
      template.colors.paper.startsWith('#3');
    // 用户覆盖 > 深/浅纸自适应
    const frameBg = frameColorOverride ?? (isDarkPaper ? '#F2E7D0' : '#FFFEF7');
    frame = (
      <div
        className={`overflow-hidden w-full h-full`}
        style={{
          background: frameBg,
          padding: '8px 8px 28px 8px',
          boxShadow: isDarkPaper
            ? '0 4px 16px rgba(0,0,0,0.6)'
            : '0 2px 8px rgba(0,0,0,0.25)',
          transform: `rotate(${rotate}deg)`,
        }}
      >
        <div className="w-full h-full overflow-hidden">
          <img
            src={photo.src}
            alt=""
            loading="eager"
            decoding="async"
            draggable={false}
            data-photo-id={photo.id}
            className="h-full w-full object-cover"
            style={{ filter: 'sepia(0.25) contrast(0.95) saturate(0.9)' }}
          />
        </div>
      </div>
    );
  } else if (style === 'cartoon') {
    const mainBorder = frameColorOverride ?? colors.primary;
    frame = (
      <div
        className={`overflow-hidden rounded-3xl w-full h-full`}
        style={{
          border: `4px solid ${mainBorder}`,
          boxShadow: `0 4px 0 ${colors.accent}`,
        }}
      >
        <SafeImg src={photo.src} template={template} photoId={photo.id} />
      </div>
    );
  } else if (style === 'watercolor') {
    // watercolor 的"边"是 padding 露出的纸色。用户覆盖时作为 padding 色使用
    const paddingBg = frameColorOverride ?? colors.paper;
    frame = (
      <div
        className={`overflow-hidden rounded-2xl w-full h-full`}
        style={{
          background: paddingBg,
          padding: '6px',
          boxShadow: `0 6px 18px ${colors.primary}33, 0 0 0 1px ${colors.accent}22`,
          transform: rotate ? `rotate(${rotate}deg)` : undefined,
        }}
      >
        <div
          className="w-full h-full overflow-hidden rounded-xl"
          style={{ background: fit === 'contain' ? paddingBg : undefined }}
        >
          <SafeImg src={photo.src} template={template} fit={fit} photoId={photo.id} />
        </div>
      </div>
    );
  } else if (style === 'festival-cn') {
    const mainBorder = frameColorOverride ?? colors.primary;
    frame = (
      <div
        className={`overflow-hidden w-full h-full`}
        style={{
          border: `3px solid ${mainBorder}`,
          padding: '3px',
          background: colors.paper,
          boxShadow: `0 0 0 1px ${colors.accent}`,
        }}
      >
        <SafeImg src={photo.src} template={template} photoId={photo.id} />
      </div>
    );
  } else if (style === 'festival-xmas') {
    const mainBorder = frameColorOverride ?? colors.primary;
    frame = (
      <div
        className={`overflow-hidden rounded-lg w-full h-full`}
        style={{
          border: `3px solid ${mainBorder}`,
          boxShadow: `0 2px 0 ${colors.accent}`,
        }}
      >
        <SafeImg src={photo.src} template={template} photoId={photo.id} />
      </div>
    );
  } else {
    // minimal 默认：极细灰边，无圆角；用户覆盖时直接整色实边（更显眼）
    const borderStyle = frameColorOverride
      ? `1px solid ${frameColorOverride}`
      : `1px solid ${colors.accent}55`;
    frame = (
      <div
        className={`overflow-hidden w-full h-full`}
        style={{ border: borderStyle }}
      >
        <SafeImg src={photo.src} template={template} photoId={photo.id} />
      </div>
    );
  }

  // rounded：在整个 style 相框外再套一层大圆角 mask
  if (shape === 'rounded') {
    return (
      <div className={className} style={{ overflow: 'hidden', borderRadius: '18%' }}>
        {frame}
      </div>
    );
  }

  // rect / undefined：保持原有结构，但要把 className 透给最外层
  // 对需要 rotate 的 vintage/watercolor，rotate 已在内部处理，这里仅套 className
  return <div className={className}>{frame}</div>;
}

/** 按风格给 caption 包装：小贴纸 / 对话气泡 / 打字机 / 衬线... */
function StyledCaption({
  caption,
  template,
  size = 'md',
}: {
  caption: string;
  template: Template;
  size?: 'sm' | 'md';
}) {
  const { style, colors, fontFamily } = template;
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  if (style === 'cartoon') {
    // 对话气泡
    return (
      <div className="flex justify-center">
        <div
          className={`relative inline-block px-4 py-2 ${textSize} max-w-[85%]`}
          style={{
            background: colors.paper,
            border: `2px solid ${colors.primary}`,
            borderRadius: '18px',
            color: colors.text,
            fontFamily: fontFamily.title,
          }}
        >
          {caption}
          <span
            className="absolute -bottom-2 left-8 w-0 h-0"
            style={{
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: `8px solid ${colors.primary}`,
            }}
          />
        </div>
      </div>
    );
  }

  if (style === 'vintage') {
    // 打字机风 + 左右横线
    return (
      <div className="flex items-center justify-center gap-3 px-6">
        <div className="flex-1 h-px" style={{ background: `${colors.accent}aa` }} />
        <span
          className={`${textSize} tracking-wider`}
          style={{ fontFamily: fontFamily.title, color: colors.text }}
        >
          {caption}
        </span>
        <div className="flex-1 h-px" style={{ background: `${colors.accent}aa` }} />
      </div>
    );
  }

  if (style === 'watercolor') {
    // 手写斜贴标签
    return (
      <div className="flex justify-center">
        <div
          className={`inline-block px-4 py-1 ${textSize}`}
          style={{
            background: `${colors.primary}22`,
            color: colors.text,
            fontFamily: fontFamily.title,
            transform: 'rotate(-1.5deg)',
            borderRadius: '4px',
          }}
        >
          {caption}
        </div>
      </div>
    );
  }

  if (style === 'festival-cn') {
    return (
      <div
        className={`text-center ${textSize}`}
        style={{
          color: colors.primary,
          fontFamily: fontFamily.title,
          letterSpacing: '0.3em',
        }}
      >
        — {caption} —
      </div>
    );
  }

  if (style === 'festival-xmas') {
    return (
      <div
        className={`text-center ${textSize} italic`}
        style={{ color: colors.primary, fontFamily: fontFamily.title }}
      >
        ❄ {caption} ❄
      </div>
    );
  }

  // minimal
  return (
    <div
      className={`text-center ${textSize} italic tracking-wide`}
      style={{ color: colors.text, fontFamily: fontFamily.title }}
    >
      {caption}
    </div>
  );
}

/* ============================================================
 *  版式 1：封面 —— 每个 style 完全不同的骨架
 * ============================================================ */
function CoverLayout({
  photo,
  title,
  subtitle,
  babyName,
  dateRange,
  template,
  variantOverride,
}: {
  photo?: Photo;
  title: string;
  subtitle: string;
  babyName?: string;
  dateRange?: string;
  template: Template;
  variantOverride?: string;
}) {
  const { colors, fontFamily } = template;
  // 封面的骨架来源：
  //   - variantOverride === undefined：沿用模板 style（向后兼容）
  //   - 'minimal' | 'watercolor' | 'cartoon' | 'vintage' | 'festival-cn' | 'festival-xmas'
  //       → 强制用对应 style 骨架（即使当前模板 style 不同，也能切到这个样式）
  //   - 'poster' | 'filmstrip'：CoverLayout 专属全新样式
  const style: TemplateStyle = isTemplateStyle(variantOverride)
    ? variantOverride
    : template.style;
  const extraVariant: string | undefined =
    variantOverride && !isTemplateStyle(variantOverride) ? variantOverride : undefined;
  // 封面也支持形状编辑（slot 0），minimal/vintage 里直写 <img> 的大图同样生效
  const shapeFromCtx = useContext(PhotoShapeContext);
  const coverShape = photo ? shapeFromCtx(photo) : undefined;

  /* poster：超大标题铺满 + 底部一行脚注 + 小照片徽章 */
  if (extraVariant === 'poster') {
    return (
      <div
        className="h-full w-full flex flex-col p-8 relative overflow-hidden"
        style={{ background: colors.paper }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            background: `radial-gradient(circle at 20% 30%, ${colors.primary} 0%, transparent 45%), radial-gradient(circle at 80% 80%, ${colors.accent} 0%, transparent 45%)`,
          }}
        />
        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <div
            className="text-[10px] tracking-[0.5em] mb-4"
            style={{ color: colors.accent, fontFamily: fontFamily.title }}
          >
            BABY · POSTER · 01
          </div>
          <h1
            className="font-bold leading-[0.95]"
            style={{
              fontFamily: fontFamily.title,
              color: colors.primary,
              fontSize: '64px',
              wordBreak: 'break-word',
            }}
          >
            {title}
          </h1>
          <div
            className="mt-4 text-sm max-w-[75%] leading-relaxed"
            style={{ color: colors.text, fontFamily: fontFamily.title }}
          >
            {subtitle}
          </div>
        </div>
        {photo && (
          <div
            className="absolute bottom-8 right-8 w-24 h-24 overflow-hidden rounded-full shadow-lg z-10"
            style={{ border: `4px solid ${colors.paper}`, boxShadow: `0 0 0 2px ${colors.primary}` }}
          >
            <ShapeMask shape={coverShape}>
              <SafeImg src={photo.src} template={template} photoId={photo.id} />
            </ShapeMask>
          </div>
        )}
        <div
          className="relative z-10 flex items-end justify-between pt-6 border-t"
          style={{ borderColor: `${colors.primary}33` }}
        >
          <div className="text-xs" style={{ color: colors.text, fontFamily: fontFamily.title }}>
            {babyName && <span className="font-semibold">{babyName}</span>}
            {babyName && dateRange && <span className="mx-2 opacity-40">·</span>}
            {dateRange && <span className="opacity-70">{dateRange}</span>}
          </div>
          <div className="text-[10px] tracking-[0.3em] opacity-50">NO · 001</div>
        </div>
      </div>
    );
  }

  /* filmstrip：顶部胶片条 + 中间超大主图 + 底部横向小条 */
  if (extraVariant === 'filmstrip') {
    return (
      <div
        className="h-full w-full flex flex-col relative overflow-hidden"
        style={{ background: '#1a1a1a' }}
      >
        {/* 顶部齿孔 */}
        <div
          className="h-3 shrink-0"
          style={{
            background: `repeating-linear-gradient(90deg, #fff 0 6px, transparent 6px 14px)`,
            opacity: 0.9,
          }}
        />
        <div className="flex-1 relative">
          {photo ? (
            <ShapeMask shape={coverShape}>
              <img
                src={photo.src}
                alt=""
                loading="eager"
                decoding="async"
                draggable={false}
                data-photo-id={photo.id}
                className="h-full w-full object-cover"
              />
            </ShapeMask>
          ) : (
            <CoverPlaceholder template={template} title={title} />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.7) 100%)`,
            }}
          />
          <div className="absolute bottom-4 left-5 right-5 text-white">
            <div
              className="text-[10px] tracking-[0.4em] opacity-70 mb-1"
              style={{ fontFamily: fontFamily.title }}
            >
              FILM · REEL · 001
            </div>
            <h1
              className="text-3xl font-bold leading-tight"
              style={{ fontFamily: fontFamily.title }}
            >
              {title}
            </h1>
            <div className="text-xs mt-1 opacity-80" style={{ fontFamily: fontFamily.title }}>
              {babyName}
              {babyName && dateRange && ' · '}
              {dateRange}
            </div>
          </div>
        </div>
        {/* 底部齿孔 */}
        <div
          className="h-3 shrink-0"
          style={{
            background: `repeating-linear-gradient(90deg, #fff 0 6px, transparent 6px 14px)`,
            opacity: 0.9,
          }}
        />
      </div>
    );
  }

  /* minimal：日系杂志 —— 超大 VOL 编号 + 黑红撞色 */
  if (style === 'minimal') {
    return (
      <div className="h-full w-full flex flex-col p-8 relative">
        {/* 右上红色小圆点 */}
        <div
          className="absolute top-6 right-6 w-3 h-3 rounded-full"
          style={{ background: colors.accent }}
        />
        <div className="flex items-center justify-between">
          <div className="text-[10px] tracking-[0.5em]" style={{ color: colors.primary }}>
            BABY BOOK
          </div>
          <div
            className="text-[10px] tracking-[0.3em] pr-5"
            style={{ color: colors.accent, fontWeight: 600 }}
          >
            ISSUE · 01
          </div>
        </div>

        {/* 超大编号 + 主标题 */}
        <div className="mt-4">
          <div
            className="leading-none"
            style={{
              fontFamily: fontFamily.title,
              color: colors.accent,
              fontSize: '84px',
              fontStyle: 'italic',
              fontWeight: 400,
            }}
          >
            №01
          </div>
          <h1
            className="mt-2 text-4xl sm:text-5xl leading-[1.05] font-bold"
            style={{ fontFamily: fontFamily.title, color: colors.primary }}
          >
            {title}
          </h1>
          <div
            className="mt-3 h-[2px] w-16"
            style={{ background: colors.accent }}
          />
          <p
            className="mt-3 text-xs italic opacity-75 tracking-wide"
            style={{ fontFamily: fontFamily.title }}
          >
            {subtitle}
          </p>
        </div>

        {/* 底部大图 + 主演信息并排 */}
        <div className="mt-auto flex items-end gap-5">
          {photo && (
            <div
              className="w-36 h-44 overflow-hidden shrink-0"
              style={{ border: `2px solid ${colors.primary}` }}
            >
              <ShapeMask shape={coverShape}>
                <SafeImg src={photo.src} template={template} photoId={photo.id} />
              </ShapeMask>
            </div>
          )}
          <div className="flex-1 pb-1">
            <div
              className="text-[10px] tracking-[0.5em]"
              style={{ color: colors.accent }}
            >
              STARRING
            </div>
            {babyName && (
              <div
                className="text-lg mt-1 font-bold tracking-wide"
                style={{ color: colors.primary, fontFamily: fontFamily.title }}
              >
                {babyName}
              </div>
            )}
            {dateRange && (
              <div className="text-[10px] mt-1 opacity-60 tracking-wider">{dateRange}</div>
            )}
            <div className="mt-3 text-[9px] tracking-[0.3em] opacity-50">
              SLOW · LIFE · EDITION
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* vintage：深色牛皮纸 + 漏光 + 胶片条 + 斜贴米色贴纸 */
  if (style === 'vintage') {
    const isDarkPaper =
      colors.paper.startsWith('#1') ||
      colors.paper.startsWith('#2') ||
      colors.paper.startsWith('#3');
    const stickerBg = isDarkPaper ? '#F2E7D0' : '#FFFEF7';
    return (
      <div className="h-full w-full flex flex-col p-5 relative">
        {/* 顶部胶片孔 */}
        <div
          className="absolute top-2 left-5 right-5 h-2 rounded-sm"
          style={{
            background: `repeating-linear-gradient(90deg, ${colors.primary}88 0 8px, transparent 8px 14px)`,
          }}
        />
        {/* 漏光 */}
        <div
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-40 blur-2xl"
          style={{ background: colors.accent }}
        />

        <div className="mt-6 flex-1 relative overflow-hidden" style={{ border: `8px solid ${stickerBg}` }}>
          {photo ? (
            <ShapeMask shape={coverShape}>
              <img
                src={photo.src}
                alt=""
                loading="eager"
                decoding="async"
                draggable={false}
                data-photo-id={photo.id}
                className="h-full w-full object-cover"
                style={{ filter: 'sepia(0.35) contrast(0.92) saturate(0.85)' }}
              />
            </ShapeMask>
          ) : (
            <CoverPlaceholder template={template} title={title} />
          )}
          {/* 胶片片号 */}
          <div
            className="absolute top-2 right-3 text-[10px] tracking-wider font-bold"
            style={{ color: stickerBg, fontFamily: fontFamily.title }}
          >
            ROLL · 001 · 24EXP
          </div>
          {/* 左下角日期印章 */}
          <div
            className="absolute bottom-3 left-3 text-[10px] tracking-widest"
            style={{
              color: stickerBg,
              fontFamily: fontFamily.title,
              background: 'rgba(0,0,0,0.4)',
              padding: '3px 8px',
            }}
          >
            {dateRange ?? '1995 — PRESENT'}
          </div>
        </div>

        {/* 米色贴纸 */}
        <div
          className="mt-4 mx-auto px-10 py-3 text-center relative"
          style={{
            background: stickerBg,
            transform: 'rotate(-1.5deg)',
            boxShadow: '0 3px 12px rgba(0,0,0,0.5)',
          }}
        >
          <div
            className="text-[10px] tracking-[0.5em]"
            style={{ color: colors.accent, fontFamily: fontFamily.title, fontWeight: 'bold' }}
          >
            — MEMORIES —
          </div>
          <h1
            className="text-2xl font-bold mt-1"
            style={{ fontFamily: fontFamily.title, color: '#3D2F22' }}
          >
            {title}
          </h1>
          {babyName && (
            <div className="text-[11px] mt-1" style={{ color: '#3D2F22', fontFamily: fontFamily.title }}>
              — {babyName} —
            </div>
          )}
        </div>
      </div>
    );
  }

  /* cartoon：圆角厚边大图 + 气泡标题 */
  if (style === 'cartoon') {
    return (
      <div className="h-full w-full flex flex-col p-5 gap-3">
        <div
          className="flex-1 overflow-hidden rounded-[28px]"
          style={{
            border: `5px solid ${colors.primary}`,
            boxShadow: `0 6px 0 ${colors.accent}`,
          }}
        >
          {photo ? (
            <ShapeMask shape={coverShape}>
              <SafeImg src={photo.src} template={template} photoId={photo.id} />
            </ShapeMask>
          ) : (
            <CoverPlaceholder template={template} title={title} />
          )}
        </div>
        <div
          className="mx-auto -mt-8 px-6 py-2 rounded-full"
          style={{
            background: colors.paper,
            border: `3px solid ${colors.primary}`,
            boxShadow: `0 3px 0 ${colors.accent}`,
          }}
        >
          <h1
            className="text-2xl font-bold"
            style={{ color: colors.primary, fontFamily: fontFamily.title }}
          >
            {title}
          </h1>
        </div>
        <div className="text-center text-xs opacity-80" style={{ fontFamily: fontFamily.title }}>
          {subtitle}
          {babyName && <span> · {babyName}</span>}
          {dateRange && <div className="opacity-60 mt-0.5">{dateRange}</div>}
        </div>
      </div>
    );
  }

  /* festival-cn：红框 + 竖排标题 */
  if (style === 'festival-cn') {
    return (
      <div className="h-full w-full flex p-6 gap-4">
        <div
          className="flex-[3] overflow-hidden"
          style={{ border: `3px solid ${colors.primary}`, padding: '4px', background: colors.paper }}
        >
          <div className="w-full h-full overflow-hidden">
            {photo ? (
              <ShapeMask shape={coverShape}>
                <SafeImg src={photo.src} template={template} photoId={photo.id} />
              </ShapeMask>
            ) : (
              <CoverPlaceholder template={template} title={title} />
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          {/* 竖排标题 */}
          <div
            className="writing-vertical text-3xl font-bold leading-[1.4]"
            style={{
              writingMode: 'vertical-rl',
              color: colors.primary,
              fontFamily: fontFamily.title,
            }}
          >
            {title}
          </div>
          {/* 印章 */}
          <div
            className="w-12 h-12 flex items-center justify-center text-xs font-bold"
            style={{
              background: colors.primary,
              color: colors.paper,
              transform: 'rotate(-6deg)',
              fontFamily: fontFamily.title,
              letterSpacing: '2px',
              lineHeight: '1.1',
              textAlign: 'center',
              padding: '4px',
            }}
          >
            {babyName ? babyName.slice(0, 2) : '宝贝'}
          </div>
          {dateRange && (
            <div className="text-[10px] opacity-70" style={{ color: colors.text }}>
              {dateRange}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* festival-xmas：雪花边 + 绿红配 */
  if (style === 'festival-xmas') {
    return (
      <div className="h-full w-full flex flex-col p-6">
        <div
          className="flex-1 overflow-hidden rounded-lg relative"
          style={{
            border: `4px double ${colors.primary}`,
            boxShadow: `inset 0 0 0 2px ${colors.accent}44`,
          }}
        >
          {photo ? (
            <ShapeMask shape={coverShape}>
              <SafeImg src={photo.src} template={template} photoId={photo.id} />
            </ShapeMask>
          ) : (
            <CoverPlaceholder template={template} title={title} />
          )}
        </div>
        <div className="mt-4 text-center">
          <div className="text-[10px] tracking-[0.5em]" style={{ color: colors.accent }}>
            ❄ MERRY CHRISTMAS ❄
          </div>
          <h1
            className="mt-1 text-3xl font-bold"
            style={{ color: colors.primary, fontFamily: fontFamily.title }}
          >
            {title}
          </h1>
          <p className="text-xs italic mt-1 opacity-80" style={{ fontFamily: fontFamily.title }}>
            {subtitle}
          </p>
          {babyName && (
            <div className="text-xs mt-1" style={{ color: colors.accent, fontFamily: fontFamily.title }}>
              — {babyName} —
            </div>
          )}
          {dateRange && (
            <div className="text-[10px] opacity-60 mt-0.5">{dateRange}</div>
          )}
        </div>
      </div>
    );
  }

  /* watercolor（默认 & 手绘）：大图 + 底部手写斜贴标签 */
  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-[3] overflow-hidden relative">
        {photo ? (
          <ShapeMask shape={coverShape}>
            <SafeImg src={photo.src} alt="cover" template={template} photoId={photo.id} />
          </ShapeMask>
        ) : (
          <CoverPlaceholder template={template} title={title} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, transparent 40%, ${colors.paper}ee 100%)`,
          }}
        />
        {/* 左上斜贴小标签 */}
        <div
          className="absolute top-4 left-4 px-3 py-1 text-[10px] tracking-widest"
          style={{
            background: `${colors.paper}dd`,
            color: colors.primary,
            transform: 'rotate(-3deg)',
            fontFamily: fontFamily.title,
          }}
        >
          BABY · BOOK
        </div>
      </div>
      <div className="flex-[2] flex flex-col items-center justify-center px-6 text-center gap-2">
        <h1
          className="text-3xl sm:text-4xl font-bold leading-tight"
          style={{ fontFamily: fontFamily.title, color: colors.primary }}
        >
          {title}
        </h1>
        <p className="text-sm italic opacity-80" style={{ fontFamily: fontFamily.title }}>
          {subtitle}
        </p>
        {babyName && (
          <div className="mt-1 text-base" style={{ fontFamily: fontFamily.title, color: colors.text }}>
            — {babyName} —
          </div>
        )}
        {dateRange && (
          <div className="text-xs mt-0.5 opacity-70" style={{ color: colors.text }}>
            {dateRange}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 *  版式 2：单图大图 —— 每 style 骨架不同（不只有相框差异）
 * ============================================================ */
function SingleLayout({
  photo,
  caption,
  template,
  variantOverride,
}: {
  photo: Photo;
  caption?: string;
  template: Template;
  variantOverride?: string;
}) {
  const { colors, fontFamily } = template;
  const style: TemplateStyle = isTemplateStyle(variantOverride) ? variantOverride : template.style;
  const extraVariant: string | undefined =
    variantOverride && !isTemplateStyle(variantOverride) ? variantOverride : undefined;

  /* fullbleed：满版出血大图，底部半透明字幕条 */
  if (extraVariant === 'fullbleed') {
    return (
      <div className="h-full w-full relative overflow-hidden">
        <div className="absolute inset-0">
          <PhotoFrame photo={photo} template={template} className="w-full h-full" />
        </div>
        {caption && (
          <div
            className="absolute left-0 right-0 bottom-0 px-6 py-3 text-white text-sm leading-relaxed backdrop-blur-[2px]"
            style={{
              background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.75) 100%)',
              fontFamily: fontFamily.title,
            }}
          >
            {caption}
          </div>
        )}
      </div>
    );
  }

  /* card：居中卡片大图，周围留白 + 细阴影，像相片卡 */
  if (extraVariant === 'card') {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-8"
        style={{ background: `${colors.accent}0d` }}
      >
        <div
          className="relative bg-white shadow-xl p-4"
          style={{ width: '82%', boxShadow: '0 12px 28px rgba(0,0,0,0.15)' }}
        >
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photo} template={template} className="w-full h-full" />
          </div>
          {caption && (
            <div
              className="mt-3 text-center text-sm leading-relaxed"
              style={{ color: colors.text, fontFamily: fontFamily.title }}
            >
              {caption}
            </div>
          )}
          <div
            className="absolute -top-2 -right-2 px-2 py-0.5 text-[10px] tracking-widest rounded-sm"
            style={{ background: colors.primary, color: colors.paper, fontFamily: fontFamily.title }}
          >
            MOMENT
          </div>
        </div>
      </div>
    );
  }

  /* vintage：Polaroid 居中微旋 */
  if (style === 'vintage') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-6 gap-4">
        <PhotoFrame photo={photo} template={template} rotate={-1.5} className="w-[82%] h-[72%]" />
        {caption && <StyledCaption caption={caption} template={template} />}
      </div>
    );
  }

  /* minimal：左留白 + 右大图（杂志版心）+ 侧边竖排章节号 */
  if (style === 'minimal') {
    return (
      <div className="h-full w-full flex p-8 gap-6">
        {/* 左列：竖排章节号 */}
        <div className="flex flex-col justify-between py-2 shrink-0">
          <div
            className="text-[10px] tracking-[0.5em]"
            style={{ color: colors.accent, writingMode: 'vertical-rl' }}
          >
            MOMENT · 01
          </div>
          <div className="h-12 w-px" style={{ background: colors.accent }} />
        </div>
        <div className="flex-1 flex flex-col gap-4 min-w-0 items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photo} template={template} className="w-full h-full" />
          </div>
          {caption && (
            <div
              className="text-sm leading-relaxed italic self-start"
              style={{ fontFamily: fontFamily.title, color: colors.text }}
            >
              "{caption}"
            </div>
          )}
        </div>
      </div>
    );
  }

  /* watercolor：居中 4:5 方形大图 + 右下角重叠手写贴纸（撕边感），不再铺满长条 */
  if (style === 'watercolor') {
    return (
      <div className="h-full w-full p-6 relative flex items-center justify-center">
        <div className="relative w-[88%]" style={{ aspectRatio: '4 / 5' }}>
          <PhotoFrame
            photo={photo}
            template={template}
            fit="contain"
            className="w-full h-full"
          />
          {caption && (
            <div
              className="absolute -bottom-3 -right-2 max-w-[70%] px-4 py-2 text-sm shadow-md"
              style={{
                background: colors.paper,
                color: colors.text,
                fontFamily: fontFamily.title,
                transform: 'rotate(-2deg)',
                border: `1px dashed ${colors.primary}55`,
              }}
            >
              {caption}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* cartoon：满版大图 + 上方气泡从照片里"飘出来" */
  if (style === 'cartoon') {
    return (
      <div className="h-full w-full p-5 flex flex-col gap-3">
        <div className="relative flex-1">
          <PhotoFrame photo={photo} template={template} className="w-full h-full" />
          {caption && (
            <div className="absolute -top-2 right-5 max-w-[70%]">
              <StyledCaption caption={caption} template={template} />
            </div>
          )}
        </div>
      </div>
    );
  }

  /* festival-cn：主图上叠金色竖排书签 */
  if (style === 'festival-cn') {
    return (
      <div className="h-full w-full p-5 relative">
        <PhotoFrame photo={photo} template={template} className="w-full h-full" />
        {caption && (
          <div
            className="absolute top-8 right-7 px-2 py-4 text-sm tracking-[0.3em]"
            style={{
              writingMode: 'vertical-rl',
              background: colors.primary,
              color: colors.paper,
              fontFamily: fontFamily.title,
              boxShadow: `2px 2px 0 ${colors.accent}`,
            }}
          >
            {caption}
          </div>
        )}
      </div>
    );
  }

  /* festival-xmas：主图 + 底部金红绶带 */
  if (style === 'festival-xmas') {
    return (
      <div className="h-full w-full p-5 flex flex-col gap-3">
        <PhotoFrame photo={photo} template={template} className="flex-1" />
        {caption && (
          <div
            className="mx-auto px-6 py-1.5 text-sm -mt-8 relative"
            style={{
              background: colors.paper,
              color: colors.primary,
              fontFamily: fontFamily.title,
              border: `2px solid ${colors.accent}`,
              transform: 'rotate(-1deg)',
              boxShadow: `0 2px 0 ${colors.primary}`,
            }}
          >
            ❄ {caption} ❄
          </div>
        )}
      </div>
    );
  }

  // 默认
  return (
    <div className="h-full w-full flex flex-col p-5 gap-3">
      <PhotoFrame photo={photo} template={template} className="flex-1" />
      {caption && <StyledCaption caption={caption} template={template} />}
    </div>
  );
}

/* ============================================================
 *  版式 3：单竖图 —— 左图 + 右文，各 style 独立骨架
 * ============================================================ */
function SinglePortraitLayout({
  photo,
  caption,
  template,
  variantOverride,
}: {
  photo: Photo;
  caption?: string;
  template: Template;
  variantOverride?: string;
}) {
  const { colors, fontFamily } = template;
  const style: TemplateStyle = isTemplateStyle(variantOverride) ? variantOverride : template.style;
  const extraVariant: string | undefined =
    variantOverride && !isTemplateStyle(variantOverride) ? variantOverride : undefined;

  /* overlay：整版大图 + 右下半透明文字卡 */
  if (extraVariant === 'overlay') {
    return (
      <div className="h-full w-full relative overflow-hidden">
        <div className="absolute inset-0">
          <PhotoFrame photo={photo} template={template} className="w-full h-full" />
        </div>
        <div
          className="absolute right-6 bottom-6 left-10 px-5 py-4 backdrop-blur-sm"
          style={{
            background: `${colors.paper}d9`,
            borderLeft: `3px solid ${colors.primary}`,
          }}
        >
          <div
            className="text-[10px] tracking-[0.4em] mb-1"
            style={{ color: colors.accent, fontFamily: fontFamily.title }}
          >
            STORY
          </div>
          <div
            className="text-sm leading-relaxed"
            style={{ color: colors.text, fontFamily: fontFamily.title }}
          >
            {caption ?? '这一刻，值得被珍藏。'}
          </div>
        </div>
      </div>
    );
  }

  /* split：上下分屏——上图下文 */
  if (extraVariant === 'split') {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="flex-[3] overflow-hidden">
          <PhotoFrame photo={photo} template={template} className="w-full h-full" />
        </div>
        <div
          className="flex-[2] flex flex-col justify-center px-8 py-6 gap-3"
          style={{ background: colors.paper }}
        >
          <div
            className="text-[10px] tracking-[0.5em]"
            style={{ color: colors.accent, fontFamily: fontFamily.title }}
          >
            CHAPTER · 01
          </div>
          <div className="h-px w-12" style={{ background: colors.primary }} />
          <div
            className="text-base leading-loose"
            style={{ color: colors.text, fontFamily: fontFamily.title }}
          >
            {caption ?? '这一刻，值得被珍藏。'}
          </div>
        </div>
      </div>
    );
  }

  if (style === 'minimal') {
    return (
      <div className="h-full w-full flex p-8 gap-6 items-center">
        <div className="flex-[3] flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photo} template={template} className="w-full h-full" />
          </div>
        </div>
        <div className="flex-[2] flex flex-col justify-center">
          <div className="text-[10px] tracking-[0.5em]" style={{ color: colors.accent }}>
            STORY
          </div>
          <div className="h-px w-8 my-3" style={{ background: colors.primary }} />
          <div className="text-base leading-loose" style={{ fontFamily: fontFamily.title, color: colors.text }}>
            {caption ?? '这一刻，值得被珍藏。'}
          </div>
        </div>
      </div>
    );
  }

  if (style === 'vintage') {
    return (
      <div className="h-full w-full flex p-6 gap-5 items-center">
        <div className="flex-[3] flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame
              photo={photo}
              template={template}
              rotate={-2}
              className="w-full h-full"
            />
          </div>
        </div>
        <div className="flex-[2] flex flex-col justify-center gap-3">
          <div className="text-xs tracking-widest opacity-70" style={{ fontFamily: fontFamily.title }}>
            NOTE · 01
          </div>
          <div className="text-base leading-relaxed" style={{ fontFamily: fontFamily.title, color: colors.text }}>
            {caption ?? '这一刻，值得被珍藏。'}
          </div>
        </div>
      </div>
    );
  }

  if (style === 'watercolor') {
    return (
      <div className="h-full w-full flex p-5 gap-4 items-center">
        <div className="flex-[3] flex items-center justify-center">
          <div className="w-full max-h-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame
              photo={photo}
              template={template}
              fit="contain"
              className="w-full h-full"
            />
          </div>
        </div>
        <div className="flex-[2] flex flex-col justify-center gap-3 relative">
          <div
            className="text-3xl opacity-70 -mb-2"
            style={{ color: colors.accent, fontFamily: fontFamily.title }}
          >
            "
          </div>
          <div
            className="text-base leading-relaxed"
            style={{ color: colors.text, fontFamily: fontFamily.title }}
          >
            {caption ?? '这一刻，值得被珍藏。'}
          </div>
          <div
            className="h-0.5 w-10 mt-2 rounded-full"
            style={{ background: colors.primary, opacity: 0.5 }}
          />
        </div>
      </div>
    );
  }

  if (style === 'cartoon') {
    return (
      <div className="h-full w-full flex p-5 gap-4 items-center">
        <div className="flex-[3] flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photo} template={template} className="w-full h-full" />
          </div>
        </div>
        <div className="flex-[2] flex flex-col justify-center">
          <div
            className="relative px-4 py-3 text-base leading-relaxed"
            style={{
              background: colors.paper,
              border: `3px solid ${colors.primary}`,
              borderRadius: '18px',
              fontFamily: fontFamily.title,
              color: colors.text,
              boxShadow: `0 3px 0 ${colors.accent}`,
            }}
          >
            {caption ?? '讲一个好玩的小故事～'}
            <span
              className="absolute -left-2 top-6 w-0 h-0"
              style={{
                borderTop: '7px solid transparent',
                borderBottom: '7px solid transparent',
                borderRight: `8px solid ${colors.primary}`,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (style === 'festival-cn') {
    return (
      <div className="h-full w-full flex p-5 gap-4 items-center">
        <div className="flex-[3] flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photo} template={template} className="w-full h-full" />
          </div>
        </div>
        <div className="flex-[2] flex flex-col items-center justify-center gap-3">
          <div
            className="text-2xl font-bold leading-[1.5] px-2"
            style={{
              writingMode: 'vertical-rl',
              color: colors.primary,
              fontFamily: fontFamily.title,
              borderLeft: `2px solid ${colors.accent}`,
              borderRight: `2px solid ${colors.accent}`,
              padding: '8px 6px',
            }}
          >
            {caption ?? '时光慢慢'}
          </div>
        </div>
      </div>
    );
  }

  if (style === 'festival-xmas') {
    return (
      <div className="h-full w-full flex p-5 gap-4 items-center">
        <div className="flex-[3] flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photo} template={template} className="w-full h-full" />
          </div>
        </div>
        <div className="flex-[2] flex flex-col justify-center gap-3 text-center">
          <div className="text-3xl">❄</div>
          <div
            className="text-base italic leading-relaxed"
            style={{ color: colors.primary, fontFamily: fontFamily.title }}
          >
            {caption ?? '愿你的童年，像下雪的夜晚一样温柔。'}
          </div>
          <div className="text-3xl">🎄</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex p-5 gap-4 items-center">
      <PhotoFrame photo={photo} template={template} className="flex-[3] h-[85%]" />
      <div className="flex-[2] flex flex-col justify-center gap-2">
        <div className="text-xs tracking-[0.3em]" style={{ color: colors.accent }}>
          MOMENT
        </div>
        <div
          className="text-base leading-relaxed"
          style={{ color: colors.primary, fontFamily: fontFamily.title }}
        >
          {caption ?? '这一刻，值得被珍藏。'}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 *  版式 4：双图并排 —— 每 style 差异化排版，不再等分长条
 * ============================================================ */
function DoubleLayout({ photos, caption, template, variantOverride }: { photos: Photo[]; caption?: string; template: Template; variantOverride?: string }) {
  const { style, colors, fontFamily } = template;

  // 用户模板若显式指定了变体，优先走通用 variant 骨架（相框/气泡仍随 style）
  const variant = variantOverride ?? template.layoutVariants?.double;
  if (variant) {
    return <DoubleVariant variant={variant} photos={photos} caption={caption} template={template} />;
  }

  /* vintage：两张 Polaroid 方形微旋错落（1:1 方形，不再竖长条） */
  if (style === 'vintage') {
    return (
      <div className="h-full w-full flex flex-col p-5 gap-3">
        <div className="flex-1 relative">
          <div className="absolute inset-0 flex items-center justify-around">
            <div className="w-[44%]" style={{ aspectRatio: '1 / 1' }}>
              <PhotoFrame
                photo={photos[0]}
                template={template}
                rotate={-3}
                className="w-full h-full"
              />
            </div>
            <div className="w-[44%]" style={{ aspectRatio: '1 / 1' }}>
              <PhotoFrame
                photo={photos[1]}
                template={template}
                rotate={2.5}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
        {caption && <StyledCaption caption={caption} template={template} />}
      </div>
    );
  }

  /* minimal：主次 7:3（左 4:5 主图 + 右侧 1:1 小图 + 底部细线 + 编号） */
  if (style === 'minimal') {
    return (
      <div className="h-full w-full flex flex-col p-8 gap-4">
        <div className="flex-1 flex gap-4 min-h-0 items-center">
          <div className="flex-[7] flex items-center justify-center">
            <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
              <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
            </div>
          </div>
          <div className="flex-[3] flex flex-col gap-3 min-w-0 items-center justify-center">
            <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
              <PhotoFrame photo={photos[1]} template={template} className="w-full h-full" />
            </div>
            <div className="text-[10px] tracking-[0.4em] mt-auto self-start" style={{ color: colors.accent }}>
              01 · 02
            </div>
          </div>
        </div>
        {caption && (
          <div
            className="text-sm italic leading-relaxed"
            style={{ fontFamily: fontFamily.title, color: colors.text }}
          >
            "{caption}"
          </div>
        )}
      </div>
    );
  }

  /* watercolor：两张接近方形画框错落重叠（使用 contain，照片永不变形） */
  if (style === 'watercolor') {
    return (
      <div className="h-full w-full p-5 relative">
        <div
          className="absolute left-[6%] top-[8%] w-[54%]"
          style={{ aspectRatio: '1 / 1' }}
        >
          <PhotoFrame
            photo={photos[0]}
            template={template}
            fit="contain"
            className="w-full h-full"
          />
        </div>
        <div
          className="absolute right-[6%] bottom-[16%] w-[50%]"
          style={{ aspectRatio: '1 / 1', transform: 'rotate(3deg)' }}
        >
          <PhotoFrame
            photo={photos[1]}
            template={template}
            fit="contain"
            className="w-full h-full"
          />
        </div>
        {caption && (
          <div className="absolute bottom-3 left-6 right-6 text-center">
            <StyledCaption caption={caption} template={template} />
          </div>
        )}
      </div>
    );
  }

  /* cartoon：左大方图 + 右侧两块（上圆 + 下方块）不等高 */
  if (style === 'cartoon') {
    return (
      <div className="h-full w-full flex flex-col p-5 gap-3">
        <div className="flex-1 grid grid-cols-5 grid-rows-3 gap-3">
          <PhotoFrame photo={photos[0]} template={template} className="col-span-3 row-span-3" />
          <PhotoFrame photo={photos[1]} template={template} className="col-span-2 row-span-2 col-start-4" />
          <div className="col-span-2 row-span-1 col-start-4 flex items-center justify-center">
            {caption ? (
              <StyledCaption caption={caption} template={template} size="sm" />
            ) : (
              <div className="text-4xl">{template.decorations[0]}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* festival-cn：主图 4:5 + 右侧 1:1 副图，金色竖条分隔（消除之前的 0.5:1 超长竖条） */
  if (style === 'festival-cn') {
    return (
      <div className="h-full w-full flex p-5 gap-3 items-center">
        <div className="flex-[3] flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
          </div>
        </div>
        <div
          className="w-1 self-stretch my-2"
          style={{ background: `linear-gradient(180deg, ${colors.accent}, transparent)` }}
        />
        <div className="flex-[2] flex flex-col gap-3 py-4 items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
            <PhotoFrame photo={photos[1]} template={template} className="w-full h-full" />
          </div>
          {caption && (
            <div
              className="text-center text-xs tracking-[0.2em]"
              style={{ color: colors.primary, fontFamily: fontFamily.title }}
            >
              — {caption} —
            </div>
          )}
        </div>
      </div>
    );
  }

  /* festival-xmas：两张 1:1 方框对称倾斜（消除之前的 0.5:1 竖长条） */
  if (style === 'festival-xmas') {
    return (
      <div className="h-full w-full p-5 relative flex flex-col">
        <div className="flex-1 relative">
          <div
            className="absolute left-[5%] top-[12%] w-[52%]"
            style={{ aspectRatio: '1 / 1', transform: 'rotate(-5deg)' }}
          >
            <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
          </div>
          <div
            className="absolute right-[5%] bottom-[12%] w-[52%]"
            style={{ aspectRatio: '1 / 1', transform: 'rotate(5deg)' }}
          >
            <PhotoFrame photo={photos[1]} template={template} className="w-full h-full" />
          </div>
        </div>
        {caption && <StyledCaption caption={caption} template={template} />}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col p-5 gap-3">
      <div className="flex-1 grid grid-cols-2 gap-3">
        {photos.slice(0, 2).map((p) => (
          <PhotoFrame key={p.id} photo={p} template={template} />
        ))}
      </div>
      {caption && <StyledCaption caption={caption} template={template} />}
    </div>
  );
}

/* ============================================================
 *  版式 5：三图拼贴 —— 每 style 独立骨架
 * ============================================================ */
function TripleLayout({ photos, caption, template, variantOverride }: { photos: Photo[]; caption?: string; template: Template; variantOverride?: string }) {
  const { style, colors, fontFamily } = template;

  const variant = variantOverride ?? template.layoutVariants?.triple;
  if (variant) {
    return <TripleVariant variant={variant} photos={photos} caption={caption} template={template} />;
  }

  /* vintage：三张 Polaroid 散摆（全部接近方形比例，不变形） */
  if (style === 'vintage') {
    return (
      <div className="h-full w-full flex flex-col p-4 gap-3">
        <div className="flex-1 relative">
          <div
            className="absolute left-[4%] top-[4%] w-[54%]"
            style={{ aspectRatio: '4 / 5' }}
          >
            <PhotoFrame
              photo={photos[0]}
              template={template}
              rotate={-3}
              className="w-full h-full"
            />
          </div>
          <div
            className="absolute right-[4%] top-[6%] w-[40%]"
            style={{ aspectRatio: '1 / 1' }}
          >
            <PhotoFrame
              photo={photos[1]}
              template={template}
              rotate={4}
              className="w-full h-full"
            />
          </div>
          <div
            className="absolute right-[8%] bottom-[4%] w-[44%]"
            style={{ aspectRatio: '1 / 1' }}
          >
            <PhotoFrame
              photo={photos[2]}
              template={template}
              rotate={-2}
              className="w-full h-full"
            />
          </div>
        </div>
        {caption && <StyledCaption caption={caption} template={template} size="sm" />}
      </div>
    );
  }

  /* minimal：左 4:5 主图 + 右侧两张 1:1 小图（避免长条） */
  if (style === 'minimal') {
    return (
      <div className="h-full w-full flex flex-col p-8 gap-4">
        <div className="flex-1 flex gap-4 min-h-0 items-center">
          <div className="flex-[6] flex items-center justify-center">
            <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
              <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
            </div>
          </div>
          <div className="flex-[3] flex flex-col gap-3 min-w-0 justify-center">
            <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
              <PhotoFrame photo={photos[1]} template={template} className="w-full h-full" />
            </div>
            <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
              <PhotoFrame photo={photos[2]} template={template} className="w-full h-full" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[10px] tracking-[0.4em]" style={{ color: colors.accent }}>
            01 · 02 · 03
          </div>
          <div className="flex-1 h-px" style={{ background: `${colors.accent}66` }} />
          {caption && (
            <span className="text-xs italic" style={{ fontFamily: fontFamily.title }}>
              {caption}
            </span>
          )}
        </div>
      </div>
    );
  }

  /* watercolor：主图 4:5 居左 + 右侧两张 1:1 小方图错落（全部 contain，照片不变形） */
  if (style === 'watercolor') {
    return (
      <div className="h-full w-full p-5 relative">
        <div
          className="absolute left-[5%] top-[6%] w-[56%]"
          style={{ aspectRatio: '4 / 5' }}
        >
          <PhotoFrame
            photo={photos[0]}
            template={template}
            fit="contain"
            className="w-full h-full"
          />
        </div>
        <div
          className="absolute right-[4%] top-[8%] w-[40%]"
          style={{ aspectRatio: '1 / 1', transform: 'rotate(3deg)' }}
        >
          <PhotoFrame
            photo={photos[1]}
            template={template}
            fit="contain"
            className="w-full h-full"
          />
        </div>
        <div
          className="absolute right-[10%] bottom-[6%] w-[42%]"
          style={{ aspectRatio: '1 / 1', transform: 'rotate(-4deg)' }}
        >
          <PhotoFrame
            photo={photos[2]}
            template={template}
            fit="contain"
            className="w-full h-full"
          />
        </div>
        {caption && (
          <div className="absolute bottom-2 left-4">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    );
  }

  /* cartoon：左 4:5 主图 + 右侧两张 1:1 方图（不再是 3:5 超长竖条） */
  if (style === 'cartoon') {
    return (
      <div className="h-full w-full flex p-5 gap-3 items-center">
        <div className="flex-[3] flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame
              photo={photos[0]}
              template={template}
              className="w-full h-full"
            />
          </div>
        </div>
        <div className="flex-[2] flex flex-col gap-3 justify-center">
          <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
            <PhotoFrame
              photo={photos[1]}
              template={template}
              className="w-full h-full"
            />
          </div>
          <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
            <PhotoFrame
              photo={photos[2]}
              template={template}
              className="w-full h-full"
            />
          </div>
          {caption && (
            <div className="mt-1">
              <StyledCaption caption={caption} template={template} size="sm" />
            </div>
          )}
        </div>
      </div>
    );
  }

  /* festival-cn：左侧两张 1:1 小图 + 右侧 4:5 主图（替代原先竖条布局） */
  if (style === 'festival-cn') {
    return (
      <div className="h-full w-full flex p-5 gap-3 items-center">
        <div className="flex-[2] flex flex-col gap-3 items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
            <PhotoFrame photo={photos[1]} template={template} className="w-full h-full" />
          </div>
          <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
            <PhotoFrame photo={photos[2]} template={template} className="w-full h-full" />
          </div>
        </div>
        <div className="flex-[3] flex flex-col items-center justify-center gap-3">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
          </div>
          {caption && (
            <div
              className="text-center text-xs tracking-[0.3em]"
              style={{ color: colors.primary, fontFamily: fontFamily.title }}
            >
              — {caption} —
            </div>
          )}
        </div>
      </div>
    );
  }

  /* festival-xmas：三张阶梯错落（全部 4:5/1:1 接近方形，不再长条） */
  if (style === 'festival-xmas') {
    return (
      <div className="h-full w-full p-5 relative">
        <div
          className="absolute left-[4%] top-[4%] w-[48%]"
          style={{ aspectRatio: '4 / 5', transform: 'rotate(-4deg)' }}
        >
          <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
        </div>
        <div
          className="absolute right-[4%] top-[14%] w-[44%]"
          style={{ aspectRatio: '1 / 1', transform: 'rotate(3deg)' }}
        >
          <PhotoFrame photo={photos[1]} template={template} className="w-full h-full" />
        </div>
        <div
          className="absolute left-[24%] bottom-[4%] w-[50%]"
          style={{ aspectRatio: '1 / 1', transform: 'rotate(-2deg)' }}
        >
          <PhotoFrame photo={photos[2]} template={template} className="w-full h-full" />
        </div>
        {caption && (
          <div className="absolute bottom-2 right-4">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col p-5 gap-3">
      <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3">
        <PhotoFrame photo={photos[0]} template={template} className="col-span-2 row-span-2" />
        <PhotoFrame photo={photos[1]} template={template} />
        <PhotoFrame photo={photos[2]} template={template} />
      </div>
      {caption && <StyledCaption caption={caption} template={template} size="sm" />}
    </div>
  );
}

/* ============================================================
 *  版式 6：四格拼贴 —— 每 style 独立骨架
 * ============================================================ */
function Grid4Layout({ photos, caption, template, variantOverride }: { photos: Photo[]; caption?: string; template: Template; variantOverride?: string }) {
  const { style, colors, fontFamily } = template;

  const variant = variantOverride ?? template.layoutVariants?.grid4;
  if (variant) {
    return <Grid4Variant variant={variant} photos={photos} caption={caption} template={template} />;
  }

  /* vintage：四张 Polaroid 2×2 散摆（每张 1:1 方形，不变形） */
  if (style === 'vintage') {
    return (
      <div className="h-full w-full flex flex-col p-4 gap-3">
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 content-center">
          {photos.slice(0, 4).map((p, i) => (
            <div
              key={p.id}
              className="flex items-center justify-center"
            >
              <div className="w-[92%]" style={{ aspectRatio: '1 / 1' }}>
                <PhotoFrame
                  photo={p}
                  template={template}
                  rotate={[-2, 1.5, 2, -1.5][i] ?? 0}
                  className="w-full h-full"
                />
              </div>
            </div>
          ))}
        </div>
        {caption && <StyledCaption caption={caption} template={template} size="sm" />}
      </div>
    );
  }

  /* minimal：严格 2×2 + 每张编号 01/02/03/04（四张 1:1 方形） */
  if (style === 'minimal') {
    return (
      <div className="h-full w-full flex flex-col p-8 gap-4">
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-5 content-center">
          {photos.slice(0, 4).map((p, i) => (
            <div key={p.id} className="relative flex items-center justify-center">
              <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
                <PhotoFrame photo={p} template={template} className="w-full h-full" />
              </div>
              <div
                className="absolute -top-3 -left-1 text-[10px] tracking-[0.3em] px-1"
                style={{ background: colors.paper, color: colors.accent }}
              >
                0{i + 1}
              </div>
            </div>
          ))}
        </div>
        {caption && (
          <div
            className="text-sm italic leading-relaxed"
            style={{ fontFamily: fontFamily.title, color: colors.text }}
          >
            "{caption}"
          </div>
        )}
      </div>
    );
  }

  /* watercolor：四张近方形画框错落散贴（无任何长条形，全部 contain 不变形） */
  if (style === 'watercolor') {
    const tiles: Array<{ cls: string; r: number; ratio: string }> = [
      { cls: 'absolute left-[4%] top-[4%] w-[44%]', r: -3, ratio: '1 / 1' },
      { cls: 'absolute right-[4%] top-[10%] w-[42%]', r: 2.5, ratio: '4 / 5' },
      { cls: 'absolute left-[10%] bottom-[6%] w-[42%]', r: -2, ratio: '4 / 5' },
      { cls: 'absolute right-[4%] bottom-[4%] w-[44%]', r: 3, ratio: '1 / 1' },
    ];
    return (
      <div className="h-full w-full p-5 relative">
        {photos.slice(0, 4).map((p, i) => (
          <div
            key={p.id}
            className={tiles[i].cls}
            style={{ aspectRatio: tiles[i].ratio, transform: `rotate(${tiles[i].r}deg)` }}
          >
            <PhotoFrame
              photo={p}
              template={template}
              fit="contain"
              className="w-full h-full"
            />
          </div>
        ))}
        {caption && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[70%]">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    );
  }

  /* cartoon：四张 1:1 方框 2×2（消除之前的 2:1/1:2 长条） */
  if (style === 'cartoon') {
    return (
      <div className="h-full w-full flex flex-col p-5 gap-3">
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 content-center">
          {photos.slice(0, 4).map((p) => (
            <div key={p.id} className="flex items-center justify-center">
              <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
                <PhotoFrame
                  photo={p}
                  template={template}
                  className="w-full h-full"
                />
              </div>
            </div>
          ))}
        </div>
        {caption && <StyledCaption caption={caption} template={template} size="sm" />}
      </div>
    );
  }

  /* festival-cn：中心对称四宫格（每格 1:1 方形，像窗花） */
  if (style === 'festival-cn') {
    return (
      <div className="h-full w-full flex flex-col p-5 gap-3">
        <div className="flex-1 relative">
          <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-4 content-center">
            {photos.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-center">
                <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
                  <PhotoFrame
                    photo={p}
                    template={template}
                    className="w-full h-full"
                  />
                </div>
              </div>
            ))}
          </div>
          {/* 中央金色印章 */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-xs font-bold rounded-full"
            style={{
              background: colors.accent,
              color: colors.paper,
              boxShadow: `0 0 0 3px ${colors.primary}`,
              fontFamily: fontFamily.title,
            }}
          >
            福
          </div>
        </div>
        {caption && (
          <div
            className="text-center text-xs tracking-[0.3em]"
            style={{ color: colors.primary, fontFamily: fontFamily.title }}
          >
            — {caption} —
          </div>
        )}
      </div>
    );
  }

  /* festival-xmas：对角线斜排（四张 1:1 方形） */
  if (style === 'festival-xmas') {
    const tiles: Array<{ cls: string; r: number }> = [
      { cls: 'absolute left-[3%] top-[4%] w-[44%]', r: -3 },
      { cls: 'absolute right-[3%] top-[12%] w-[44%]', r: 4 },
      { cls: 'absolute left-[10%] bottom-[10%] w-[44%]', r: -4 },
      { cls: 'absolute right-[3%] bottom-[4%] w-[44%]', r: 3 },
    ];
    return (
      <div className="h-full w-full p-5 relative">
        {tiles.map((cfg, i) =>
          photos[i] ? (
            <div
              key={photos[i].id}
              className={cfg.cls}
              style={{ aspectRatio: '1 / 1', transform: `rotate(${cfg.r}deg)` }}
            >
              <PhotoFrame photo={photos[i]} template={template} className="w-full h-full" />
            </div>
          ) : null,
        )}
        {caption && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[70%]">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col p-5 gap-3">
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3">
        {photos.slice(0, 4).map((p) => (
          <PhotoFrame key={p.id} photo={p} template={template} />
        ))}
      </div>
      {caption && <StyledCaption caption={caption} template={template} size="sm" />}
    </div>
  );
}

/* ============================================================
 *  版式 7：纯文字（章节页）
 *
 *  支持的样式 variant（page.variant）：
 *    - 'minimal'        清新极简（杂志式排版 + 大留白 + 细分割线）
 *    - 'watercolor'     水彩手写（左上斜贴标签 + 落款）
 *    - 'cartoon'        卡通气泡（大气泡对话框）
 *    - 'vintage'        复古胶片（打字机体 + 上下虚线 + 引文竖线）
 *    - 'festival-cn'    中国红（竖排标题 + 印章感）
 *    - 'festival-xmas'  圣诞（雪花 + 渐变分割线）
 *    - 'poster'         海报大字（占满版面的超大标题 + 底部行脚注）
 *    - 'quote'          手写引言（大引号 + 居中段落 + 横线签名）
 *    - 'card'           卡片便签（居中米色卡片 + 细边框 + 角标）
 *    - 'timeline'       时间轴（左侧圆点竖线 + 右侧章节序号 + 正文）
 *
 *  不填（undefined）时，兜底使用 template.style；若该 style 没有对应样式
 *  分支则退到 watercolor 通用样式。
 * ============================================================ */

/** 文字页可用样式 id */
export type TextVariantId =
  | 'minimal'
  | 'watercolor'
  | 'cartoon'
  | 'vintage'
  | 'festival-cn'
  | 'festival-xmas'
  | 'poster'
  | 'quote'
  | 'card'
  | 'timeline';

function TextLayout({ page, template }: { page: BookPage; template: Template }) {
  const { style, colors, fontFamily, decorations } = template;

  // 优先使用页面自定义 variant，否则跟随模板 style
  const variant: TextVariantId = (page.variant as TextVariantId) || (style as TextVariantId);

  if (variant === 'minimal') {
    return (
      <div className="h-full w-full flex flex-col justify-center px-12 gap-6">
        <div className="text-[10px] tracking-[0.5em]" style={{ color: colors.accent }}>
          CHAPTER
        </div>
        <h2 className="text-4xl" style={{ fontFamily: fontFamily.title, color: colors.primary }}>
          {page.title}
        </h2>
        <div className="h-px w-12" style={{ background: colors.primary }} />
        <p className="text-sm italic leading-loose opacity-80 max-w-sm" style={{ fontFamily: fontFamily.title }}>
          {page.caption}
        </p>
      </div>
    );
  }

  if (variant === 'festival-cn') {
    return (
      <div className="h-full w-full flex items-center justify-center p-10">
        <div className="text-center">
          <div
            className="inline-block writing-vertical text-4xl font-bold leading-[1.5] mb-4"
            style={{
              writingMode: 'vertical-rl',
              color: colors.primary,
              fontFamily: fontFamily.title,
            }}
          >
            {page.title}
          </div>
          <p className="text-sm leading-loose opacity-80 max-w-sm mx-auto" style={{ fontFamily: fontFamily.title }}>
            {page.caption}
          </p>
        </div>
      </div>
    );
  }

  /* watercolor：左上斜贴手写小标签 + 右下落款风 */
  if (variant === 'watercolor') {
    return (
      <div className="h-full w-full flex flex-col justify-center px-12 gap-5 relative">
        <div
          className="inline-block self-start px-4 py-1 text-xs tracking-[0.3em] -rotate-2"
          style={{
            background: `${colors.primary}22`,
            color: colors.primary,
            fontFamily: fontFamily.title,
          }}
        >
          — CHAPTER —
        </div>
        <h2
          className="text-3xl sm:text-4xl leading-[1.15] font-bold"
          style={{ fontFamily: fontFamily.title, color: colors.primary }}
        >
          {page.title}
        </h2>
        <div className="flex items-center gap-3">
          <div className="h-0.5 w-10 rounded-full" style={{ background: colors.primary }} />
          <span className="text-xl" style={{ color: colors.accent }}>
            {decorations[0]}
          </span>
          <div className="h-0.5 flex-1 rounded-full" style={{ background: `${colors.accent}55` }} />
        </div>
        <p className="text-sm italic leading-loose max-w-md opacity-80" style={{ fontFamily: fontFamily.title }}>
          {page.caption}
        </p>
      </div>
    );
  }

  /* cartoon：巨大气泡 */
  if (variant === 'cartoon') {
    return (
      <div className="h-full w-full flex items-center justify-center p-8">
        <div
          className="relative px-8 py-8 text-center max-w-[80%]"
          style={{
            background: colors.paper,
            border: `4px solid ${colors.primary}`,
            borderRadius: '32px',
            boxShadow: `0 6px 0 ${colors.accent}`,
          }}
        >
          <div className="text-3xl mb-2">{decorations[0]}</div>
          <h2
            className="text-2xl sm:text-3xl font-bold"
            style={{ fontFamily: fontFamily.title, color: colors.primary }}
          >
            {page.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed" style={{ fontFamily: fontFamily.title }}>
            {page.caption}
          </p>
          <span
            className="absolute -bottom-4 left-12 w-0 h-0"
            style={{
              borderLeft: '14px solid transparent',
              borderRight: '14px solid transparent',
              borderTop: `14px solid ${colors.primary}`,
            }}
          />
        </div>
      </div>
    );
  }

  /* vintage：左右留打字机缩进 + 上下两条虚线 */
  if (variant === 'vintage') {
    return (
      <div className="h-full w-full flex flex-col justify-center px-10 gap-5">
        <div
          className="w-full border-t-2 border-dashed opacity-50"
          style={{ borderColor: colors.accent }}
        />
        <div className="text-xs tracking-[0.5em] opacity-70" style={{ fontFamily: fontFamily.title }}>
          CHAPTER · 00
        </div>
        <h2
          className="text-3xl font-bold leading-tight"
          style={{ fontFamily: fontFamily.title, color: colors.primary }}
        >
          {page.title}
        </h2>
        <p
          className="text-sm leading-loose max-w-md opacity-85 pl-4 border-l-2"
          style={{ fontFamily: fontFamily.title, color: colors.text, borderColor: colors.accent }}
        >
          {page.caption}
        </p>
        <div
          className="w-full border-t-2 border-dashed opacity-50"
          style={{ borderColor: colors.accent }}
        />
      </div>
    );
  }

  /* festival-xmas：大雪花 + 对角装饰 */
  if (variant === 'festival-xmas') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-10 gap-4 relative">
        <div className="text-5xl" style={{ color: colors.accent }}>
          ❄
        </div>
        <h2
          className="text-3xl font-bold text-center"
          style={{ fontFamily: fontFamily.title, color: colors.primary }}
        >
          {page.title}
        </h2>
        <div
          className="h-0.5 w-24"
          style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})` }}
        />
        <p
          className="text-sm italic leading-loose text-center max-w-sm opacity-85"
          style={{ fontFamily: fontFamily.title }}
        >
          {page.caption}
        </p>
      </div>
    );
  }

  /* poster：海报大字 —— 占满整页的超大标题 + 底部细节脚注 */
  if (variant === 'poster') {
    return (
      <div className="h-full w-full flex flex-col justify-between p-8 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            background: `radial-gradient(circle at 20% 10%, ${colors.primary} 0%, transparent 50%), radial-gradient(circle at 85% 90%, ${colors.accent} 0%, transparent 50%)`,
          }}
        />
        <div className="relative">
          <div className="text-[10px] tracking-[0.6em] mb-3" style={{ color: colors.accent }}>
            CHAPTER
          </div>
          <h2
            className="font-bold leading-[0.95] tracking-tight"
            style={{
              fontFamily: fontFamily.title,
              color: colors.primary,
              fontSize: 'clamp(44px, 14vw, 92px)',
              wordBreak: 'break-word',
            }}
          >
            {page.title}
          </h2>
        </div>
        <div className="relative flex items-end justify-between gap-4">
          <p
            className="text-sm leading-relaxed opacity-80 max-w-[70%]"
            style={{ fontFamily: fontFamily.title, color: colors.text }}
          >
            {page.caption}
          </p>
          <div className="text-[10px] tracking-[0.4em] opacity-60 whitespace-nowrap" style={{ color: colors.text }}>
            · BABYBOOK ·
          </div>
        </div>
      </div>
    );
  }

  /* quote：手写引言 —— 两个大引号 + 居中段落 + 横线签名 */
  if (variant === 'quote') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-10 gap-4 text-center">
        <div
          className="text-[80px] leading-none -mb-4"
          style={{ color: colors.primary, fontFamily: 'Georgia, serif', opacity: 0.25 }}
        >
          &ldquo;
        </div>
        <h2
          className="text-2xl sm:text-3xl font-bold italic"
          style={{ fontFamily: fontFamily.title, color: colors.primary }}
        >
          {page.title}
        </h2>
        <p
          className="text-sm italic leading-loose max-w-sm opacity-80"
          style={{ fontFamily: fontFamily.title, color: colors.text }}
        >
          {page.caption}
        </p>
        <div
          className="mt-2 h-px w-20"
          style={{ background: colors.accent, opacity: 0.6 }}
        />
        <div className="text-[11px] tracking-[0.3em]" style={{ color: colors.accent }}>
          — MEMO —
        </div>
      </div>
    );
  }

  /* card：卡片便签 —— 居中米色便签卡 + 细边框 + 左上角标 */
  if (variant === 'card') {
    return (
      <div className="h-full w-full flex items-center justify-center p-8">
        <div
          className="relative w-full max-w-[85%] rounded-lg p-7"
          style={{
            background: colors.paper,
            border: `1px solid ${colors.primary}33`,
            boxShadow: `0 6px 20px ${colors.primary}14`,
          }}
        >
          <div
            className="absolute -top-3 left-5 px-2 py-0.5 text-[10px] tracking-[0.3em] rounded"
            style={{
              background: colors.primary,
              color: colors.paper,
              fontFamily: fontFamily.title,
            }}
          >
            NOTE
          </div>
          <div className="text-lg mb-2" style={{ color: colors.accent }}>
            {decorations[0] ?? '✦'}
          </div>
          <h2
            className="text-2xl font-bold leading-tight mb-3"
            style={{ fontFamily: fontFamily.title, color: colors.primary }}
          >
            {page.title}
          </h2>
          <p
            className="text-sm leading-loose opacity-85"
            style={{ fontFamily: fontFamily.title, color: colors.text }}
          >
            {page.caption}
          </p>
        </div>
      </div>
    );
  }

  /* timeline：时间轴 —— 左侧竖线圆点 + 右侧章节序号 + 标题正文 */
  if (variant === 'timeline') {
    return (
      <div className="h-full w-full flex items-center px-8">
        <div className="relative flex gap-5 w-full">
          {/* 左侧竖线 + 圆点 */}
          <div className="relative flex flex-col items-center pt-1 shrink-0">
            <div
              className="w-3 h-3 rounded-full"
              style={{ background: colors.primary, boxShadow: `0 0 0 4px ${colors.primary}22` }}
            />
            <div
              className="flex-1 w-px mt-1 min-h-[120px]"
              style={{ background: `${colors.primary}55` }}
            />
          </div>
          {/* 右侧正文 */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div
              className="text-[10px] tracking-[0.4em] mb-2"
              style={{ color: colors.accent, fontFamily: fontFamily.title }}
            >
              CHAPTER · {page.title ? page.title.slice(0, 1) : '·'}
            </div>
            <h2
              className="text-2xl sm:text-3xl font-bold leading-tight mb-3"
              style={{ fontFamily: fontFamily.title, color: colors.primary }}
            >
              {page.title}
            </h2>
            <p
              className="text-sm leading-loose opacity-85 max-w-md"
              style={{ fontFamily: fontFamily.title, color: colors.text }}
            >
              {page.caption}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center px-10 text-center gap-4">
      <div className="text-xs tracking-[0.5em]" style={{ color: colors.accent }}>
        CHAPTER
      </div>
      <h2
        className="text-2xl sm:text-3xl font-bold"
        style={{ fontFamily: fontFamily.title, color: colors.primary }}
      >
        {page.title}
      </h2>
      <p className="text-sm italic leading-loose max-w-xs opacity-80" style={{ fontFamily: fontFamily.title }}>
        {page.caption}
      </p>
    </div>
  );
}

/* ============================================================
 *  版式 8：尾页寄语
 * ============================================================ */
function EndingLayout({
  page,
  template,
  babyName,
}: {
  page: BookPage;
  template: Template;
  babyName?: string;
}) {
  const { style, colors, fontFamily, decorations } = template;

  if (style === 'minimal') {
    return (
      <div className="h-full w-full flex flex-col p-10 justify-between">
        <div className="text-[10px] tracking-[0.5em]" style={{ color: colors.accent }}>
          THE END
        </div>
        <div>
          <h2 className="text-3xl mb-4" style={{ fontFamily: fontFamily.title, color: colors.primary }}>
            {page.title}
          </h2>
          <div className="h-px w-16" style={{ background: colors.primary }} />
          <p className="mt-4 text-sm italic leading-loose opacity-80 max-w-sm" style={{ fontFamily: fontFamily.title }}>
            {page.caption}
          </p>
        </div>
        <div className="text-[10px] tracking-widest opacity-60">
          {babyName ? `FOR · ${babyName.toUpperCase()}` : 'FOR MY BABY'} · BABYBOOK
        </div>
      </div>
    );
  }

  if (style === 'vintage') {
    const isDarkPaper =
      colors.paper.startsWith('#1') ||
      colors.paper.startsWith('#2') ||
      colors.paper.startsWith('#3');
    const stickerBg = isDarkPaper ? '#F2E7D0' : '#FFFEF7';
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-8 gap-5 relative">
        {/* 漏光 */}
        <div
          className="absolute -top-10 -left-10 w-40 h-40 rounded-full opacity-35 blur-2xl"
          style={{ background: colors.accent }}
        />
        <div
          className="px-8 py-6 text-center relative"
          style={{ background: stickerBg, transform: 'rotate(-1.5deg)', boxShadow: '0 3px 12px rgba(0,0,0,0.5)' }}
        >
          <div className="text-xs tracking-[0.4em]" style={{ color: colors.accent, fontFamily: fontFamily.title, fontWeight: 'bold' }}>
            — THE END —
          </div>
          <h2
            className="mt-2 text-xl font-bold"
            style={{ fontFamily: fontFamily.title, color: '#3D2F22' }}
          >
            {page.title}
          </h2>
          <p
            className="mt-3 text-sm italic leading-relaxed max-w-xs"
            style={{ fontFamily: fontFamily.title, color: '#3D2F22' }}
          >
            {page.caption}
          </p>
          <div className="mt-3 text-xs" style={{ fontFamily: fontFamily.title, color: colors.accent }}>
            {babyName ? `致 ${babyName}` : '致我的宝贝'}
          </div>
        </div>
      </div>
    );
  }

  if (style === 'cartoon') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-8 gap-5">
        <div className="text-6xl">{decorations[0]}</div>
        <div
          className="px-8 py-5 rounded-3xl text-center max-w-[85%]"
          style={{
            background: colors.paper,
            border: `4px solid ${colors.primary}`,
            boxShadow: `0 5px 0 ${colors.accent}`,
          }}
        >
          <h2
            className="text-2xl font-bold"
            style={{ fontFamily: fontFamily.title, color: colors.primary }}
          >
            {page.title}
          </h2>
          <p className="mt-2 text-sm" style={{ fontFamily: fontFamily.title }}>
            {page.caption}
          </p>
          <div className="mt-3 text-sm" style={{ color: colors.accent, fontFamily: fontFamily.title }}>
            {babyName ? `to ${babyName} ♥` : 'to my baby ♥'}
          </div>
        </div>
      </div>
    );
  }

  if (style === 'festival-cn') {
    return (
      <div className="h-full w-full flex items-center justify-center p-10">
        <div className="text-center">
          <div className="text-5xl mb-4">🧧</div>
          <div
            className="inline-block writing-vertical text-3xl font-bold leading-[1.5]"
            style={{
              writingMode: 'vertical-rl',
              color: colors.primary,
              fontFamily: fontFamily.title,
            }}
          >
            {page.title}
          </div>
          <p className="mt-6 text-sm leading-loose opacity-80 max-w-xs mx-auto" style={{ fontFamily: fontFamily.title }}>
            {page.caption}
          </p>
          <div
            className="inline-block mt-6 w-14 h-14 flex items-center justify-center text-xs font-bold"
            style={{
              background: colors.primary,
              color: colors.paper,
              transform: 'rotate(-4deg)',
              lineHeight: '1.1',
              padding: '4px',
              fontFamily: fontFamily.title,
              letterSpacing: '2px',
            }}
          >
            {babyName ? `致${babyName.slice(0, 1)}` : '致宝贝'}
          </div>
        </div>
      </div>
    );
  }

  if (style === 'festival-xmas') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center px-8 gap-4">
        <div className="text-5xl">🎄</div>
        <h2
          className="text-3xl font-bold text-center"
          style={{ fontFamily: fontFamily.title, color: colors.primary }}
        >
          {page.title}
        </h2>
        <div
          className="h-0.5 w-20"
          style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})` }}
        />
        <p className="text-sm italic leading-loose text-center max-w-xs opacity-80" style={{ fontFamily: fontFamily.title }}>
          {page.caption}
        </p>
        <div className="mt-2 text-sm" style={{ color: colors.accent, fontFamily: fontFamily.title }}>
          ❄ {babyName ? `to ${babyName}` : 'to my baby'} ❄
        </div>
      </div>
    );
  }

  // watercolor 默认
  return (
    <div className="h-full w-full flex flex-col items-center justify-center px-8 text-center gap-4">
      <div className="text-5xl" style={{ color: colors.primary }}>
        {decorations[0]}
      </div>
      <h2
        className="text-2xl sm:text-3xl font-bold"
        style={{ fontFamily: fontFamily.title, color: colors.primary }}
      >
        {page.title}
      </h2>
      <p className="text-sm italic leading-loose max-w-xs opacity-80" style={{ fontFamily: fontFamily.title }}>
        {page.caption}
      </p>
      <div className="mt-4 text-sm" style={{ color: colors.accent, fontFamily: fontFamily.title }}>
        — {babyName ? `致 ${babyName}` : '致我的宝贝'} —
      </div>
      <div className="text-[10px] tracking-[0.3em] opacity-60 mt-1" style={{ color: colors.text }}>
        THE END · BABYBOOK
      </div>
    </div>
  );
}

// 声明不会被 tsc 报告为 unused 的类型（为风格分支的完整性做文档）
type _Style = TemplateStyle;
void ((_s: _Style) => _s);

/* ============================================================
 *  通用多图 Variant 渲染（Double / Triple / Grid4 / Grid5 / Grid6）
 *
 *  设计原则：
 *  - 变体只控制「照片块的位置、比例、旋转」这种骨架层级的事
 *  - 相框样式、caption 气泡仍然复用 PhotoFrame / StyledCaption，
 *    这样同一个变体在任何 style 下都能保持风格一致性
 *  - 所有变体都使用接近方形（1:1 / 4:5）的画框，避免长条变形
 * ============================================================ */

function DoubleVariant({
  variant,
  photos,
  caption,
  template,
}: {
  variant: string;
  photos: Photo[];
  caption?: string;
  template: Template;
}) {
  if (variant === 'big-small') {
    return (
      <div className="h-full w-full flex p-5 gap-3 items-center">
        <div className="flex-[7] flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
          </div>
        </div>
        <div className="flex-[3] flex flex-col gap-3 items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
            <PhotoFrame photo={photos[1]} template={template} className="w-full h-full" />
          </div>
          {caption && (
            <div className="w-full text-center">
              <StyledCaption caption={caption} template={template} size="sm" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'stack-overlap') {
    return (
      <div className="h-full w-full p-5 relative">
        <div
          className="absolute left-[6%] top-[8%] w-[54%]"
          style={{ aspectRatio: '1 / 1', transform: 'rotate(-3deg)' }}
        >
          <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
        </div>
        <div
          className="absolute right-[6%] bottom-[16%] w-[52%]"
          style={{ aspectRatio: '1 / 1', transform: 'rotate(3deg)' }}
        >
          <PhotoFrame photo={photos[1]} template={template} className="w-full h-full" />
        </div>
        {caption && (
          <div className="absolute bottom-3 left-6 right-6 text-center">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    );
  }

  // equal（默认）：两张 1:1 等分并排
  return (
    <div className="h-full w-full flex flex-col p-5 gap-3">
      <div className="flex-1 flex gap-3 items-center">
        {photos.slice(0, 2).map((p) => (
          <div key={p.id} className="flex-1 flex items-center justify-center">
            <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
              <PhotoFrame photo={p} template={template} className="w-full h-full" />
            </div>
          </div>
        ))}
      </div>
      {caption && <StyledCaption caption={caption} template={template} />}
    </div>
  );
}

function TripleVariant({
  variant,
  photos,
  caption,
  template,
}: {
  variant: string;
  photos: Photo[];
  caption?: string;
  template: Template;
}) {
  if (variant === 'row') {
    return (
      <div className="h-full w-full flex flex-col p-5 gap-3">
        <div className="flex-1 flex gap-3 items-center">
          {photos.slice(0, 3).map((p) => (
            <div key={p.id} className="flex-1 flex items-center justify-center">
              <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
                <PhotoFrame photo={p} template={template} className="w-full h-full" />
              </div>
            </div>
          ))}
        </div>
        {caption && <StyledCaption caption={caption} template={template} size="sm" />}
      </div>
    );
  }

  if (variant === 'scatter') {
    const tiles: Array<{ cls: string; r: number; ratio: string }> = [
      { cls: 'absolute left-[4%] top-[4%] w-[48%]', r: -4, ratio: '4 / 5' },
      { cls: 'absolute right-[4%] top-[10%] w-[44%]', r: 3, ratio: '1 / 1' },
      { cls: 'absolute left-[22%] bottom-[4%] w-[52%]', r: -2, ratio: '1 / 1' },
    ];
    return (
      <div className="h-full w-full p-5 relative">
        {photos.slice(0, 3).map((p, i) => (
          <div
            key={p.id}
            className={tiles[i].cls}
            style={{ aspectRatio: tiles[i].ratio, transform: `rotate(${tiles[i].r}deg)` }}
          >
            <PhotoFrame photo={p} template={template} className="w-full h-full" />
          </div>
        ))}
        {caption && (
          <div className="absolute bottom-2 right-4">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    );
  }

  // big-two（默认）：左 4:5 主图 + 右 2×1:1 副图
  return (
    <div className="h-full w-full flex p-5 gap-3 items-center">
      <div className="flex-[3] flex items-center justify-center">
        <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
          <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
        </div>
      </div>
      <div className="flex-[2] flex flex-col gap-3 justify-center">
        <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
          <PhotoFrame photo={photos[1]} template={template} className="w-full h-full" />
        </div>
        <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
          <PhotoFrame photo={photos[2]} template={template} className="w-full h-full" />
        </div>
        {caption && (
          <div className="mt-1">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}

function Grid4Variant({
  variant,
  photos,
  caption,
  template,
}: {
  variant: string;
  photos: Photo[];
  caption?: string;
  template: Template;
}) {
  if (variant === 'scatter') {
    const tiles: Array<{ cls: string; r: number; ratio: string }> = [
      { cls: 'absolute left-[4%] top-[4%] w-[44%]', r: -3, ratio: '1 / 1' },
      { cls: 'absolute right-[4%] top-[10%] w-[42%]', r: 2.5, ratio: '4 / 5' },
      { cls: 'absolute left-[10%] bottom-[6%] w-[42%]', r: -2, ratio: '4 / 5' },
      { cls: 'absolute right-[4%] bottom-[4%] w-[44%]', r: 3, ratio: '1 / 1' },
    ];
    return (
      <div className="h-full w-full p-5 relative">
        {photos.slice(0, 4).map((p, i) => (
          <div
            key={p.id}
            className={tiles[i].cls}
            style={{ aspectRatio: tiles[i].ratio, transform: `rotate(${tiles[i].r}deg)` }}
          >
            <PhotoFrame photo={p} template={template} className="w-full h-full" />
          </div>
        ))}
        {caption && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[70%]">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    );
  }

  if (variant === 'hero-right') {
    return (
      <div className="h-full w-full flex p-5 gap-3 items-center">
        <div className="flex-[2] flex flex-col gap-3 justify-center">
          {photos.slice(0, 3).map((p) => (
            <div key={p.id} className="w-full" style={{ aspectRatio: '1 / 1' }}>
              <PhotoFrame photo={p} template={template} className="w-full h-full" />
            </div>
          ))}
        </div>
        <div className="flex-[3] flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photos[3]} template={template} className="w-full h-full" />
          </div>
          {caption && (
            <div className="absolute bottom-2 right-6">
              <StyledCaption caption={caption} template={template} size="sm" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // grid-2x2（默认）
  return (
    <div className="h-full w-full flex flex-col p-5 gap-3">
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 content-center">
        {photos.slice(0, 4).map((p) => (
          <div key={p.id} className="flex items-center justify-center">
            <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
              <PhotoFrame photo={p} template={template} className="w-full h-full" />
            </div>
          </div>
        ))}
      </div>
      {caption && <StyledCaption caption={caption} template={template} size="sm" />}
    </div>
  );
}

/* ============================================================
 *  版式 7：五图拼贴 —— 全部走 Variant 渲染（没有旧 style 分支）
 * ============================================================ */
function Grid5Layout({
  photos,
  caption,
  template,
  variantOverride,
}: {
  photos: Photo[];
  caption?: string;
  template: Template;
  variantOverride?: string;
}) {
  const variant = variantOverride ?? template.layoutVariants?.grid5 ?? defaultVariantId('grid5');

  if (variant === 'hero-center') {
    // 中央大图 + 四个角小图
    return (
      <div className="h-full w-full p-5 relative">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[48%]"
          style={{ aspectRatio: '1 / 1' }}
        >
          <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
        </div>
        {[
          { cls: 'absolute left-[3%] top-[4%] w-[26%]', i: 1 },
          { cls: 'absolute right-[3%] top-[4%] w-[26%]', i: 2 },
          { cls: 'absolute left-[3%] bottom-[4%] w-[26%]', i: 3 },
          { cls: 'absolute right-[3%] bottom-[4%] w-[26%]', i: 4 },
        ].map((cfg) => (
          <div key={cfg.i} className={cfg.cls} style={{ aspectRatio: '1 / 1' }}>
            <PhotoFrame photo={photos[cfg.i]} template={template} className="w-full h-full" />
          </div>
        ))}
        {caption && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    );
  }

  if (variant === 'top1-bottom4') {
    return (
      <div className="h-full w-full flex flex-col p-5 gap-3">
        <div className="h-[48%] flex items-center justify-center">
          <div className="w-full h-full">
            <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
          </div>
        </div>
        <div className="flex-1 grid grid-cols-4 gap-3 items-center">
          {photos.slice(1, 5).map((p) => (
            <div key={p.id} className="w-full" style={{ aspectRatio: '1 / 1' }}>
              <PhotoFrame photo={p} template={template} className="w-full h-full" />
            </div>
          ))}
        </div>
        {caption && <StyledCaption caption={caption} template={template} size="sm" />}
      </div>
    );
  }

  // hero-left（默认）：左 4:5 大图 + 右侧 2×2 小图
  return (
    <div className="h-full w-full flex p-5 gap-3 items-stretch">
      <div className="flex-[3] flex items-center justify-center">
        <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
          <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
        </div>
      </div>
      <div className="flex-[2] grid grid-cols-2 grid-rows-2 gap-3 items-center">
        {photos.slice(1, 5).map((p) => (
          <div key={p.id} className="w-full" style={{ aspectRatio: '1 / 1' }}>
            <PhotoFrame photo={p} template={template} className="w-full h-full" />
          </div>
        ))}
        {caption && (
          <div className="col-span-2 -mt-1">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 *  版式 8：六图拼贴
 * ============================================================ */
function Grid6Layout({
  photos,
  caption,
  template,
  variantOverride,
}: {
  photos: Photo[];
  caption?: string;
  template: Template;
  variantOverride?: string;
}) {
  const variant = variantOverride ?? template.layoutVariants?.grid6 ?? defaultVariantId('grid6');

  if (variant === 'hero-left-5') {
    return (
      <div className="h-full w-full flex p-5 gap-3 items-stretch">
        <div className="flex-[5] flex items-center justify-center">
          <div className="w-full" style={{ aspectRatio: '4 / 5' }}>
            <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
          </div>
        </div>
        <div className="flex-[3] flex flex-col gap-2 justify-center">
          {photos.slice(1, 6).map((p) => (
            <div key={p.id} className="w-full" style={{ aspectRatio: '4 / 3' }}>
              <PhotoFrame photo={p} template={template} className="w-full h-full" />
            </div>
          ))}
        </div>
        {caption && (
          <div className="absolute bottom-2 left-6 right-6 text-center">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    );
  }

  if (variant === 'mosaic') {
    // 大 + 大 + 4 小：左上 4:5 + 右下 4:5 + 周围 4 张 1:1
    return (
      <div className="h-full w-full p-5 relative">
        <div
          className="absolute left-[4%] top-[4%] w-[44%]"
          style={{ aspectRatio: '4 / 5' }}
        >
          <PhotoFrame photo={photos[0]} template={template} className="w-full h-full" />
        </div>
        <div
          className="absolute right-[4%] bottom-[4%] w-[44%]"
          style={{ aspectRatio: '4 / 5' }}
        >
          <PhotoFrame photo={photos[1]} template={template} className="w-full h-full" />
        </div>
        <div
          className="absolute right-[4%] top-[4%] w-[22%]"
          style={{ aspectRatio: '1 / 1' }}
        >
          <PhotoFrame photo={photos[2]} template={template} className="w-full h-full" />
        </div>
        <div
          className="absolute right-[28%] top-[18%] w-[22%]"
          style={{ aspectRatio: '1 / 1' }}
        >
          <PhotoFrame photo={photos[3]} template={template} className="w-full h-full" />
        </div>
        <div
          className="absolute left-[4%] bottom-[18%] w-[22%]"
          style={{ aspectRatio: '1 / 1' }}
        >
          <PhotoFrame photo={photos[4]} template={template} className="w-full h-full" />
        </div>
        <div
          className="absolute left-[28%] bottom-[4%] w-[22%]"
          style={{ aspectRatio: '1 / 1' }}
        >
          <PhotoFrame photo={photos[5]} template={template} className="w-full h-full" />
        </div>
        {caption && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[50%]">
            <StyledCaption caption={caption} template={template} size="sm" />
          </div>
        )}
      </div>
    );
  }

  // grid-3x2（默认）：3 列 × 2 行
  return (
    <div className="h-full w-full flex flex-col p-5 gap-3">
      <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3 items-center">
        {photos.slice(0, 6).map((p) => (
          <div key={p.id} className="w-full" style={{ aspectRatio: '1 / 1' }}>
            <PhotoFrame photo={p} template={template} className="w-full h-full" />
          </div>
        ))}
      </div>
      {caption && <StyledCaption caption={caption} template={template} size="sm" />}
    </div>
  );
}

/* ============================================================
 *  OverlayLayer —— 自由叠层（画框 / 文字）
 *
 *  设计要点：
 *  - 几何全部用百分比（x/y/w/h），与页面渲染分辨率解耦：编辑器/预览/PDF 导出（720x960）通用。
 *  - 展示态（editable=false）：只读渲染，pointer-events: none，不影响下层操作（点击下层照片选中、调焦点等不受影响）。
 *  - 编辑态：每个 overlay 是一个独立交互单元，支持选中、拖动整体、8 个方向缩放手柄、1 个旋转手柄。
 *  - 拖动/缩放/旋转期间用 React state 维持"实时几何"，pointerup 时一次性回写到 onOverlaysChange。
 *  - 与 PhotoFocus 互斥：上层 BookEditor 通过 selectedPhotoId/selectedOverlayId 二选一控制。
 * ============================================================ */

interface OverlayLayerProps {
  overlays: Overlay[];
  photos: Photo[];
  template: Template;
  photoFrameColor: string | null;
  editable: boolean;
  selectedOverlayId: string | null;
  onSelectOverlay?: (id: string | null) => void;
  onOverlaysChange?: (next: Overlay[]) => void;
  containerRef: MutableRefObject<HTMLDivElement | null>;
}

type DragMode =
  | { kind: 'move'; id: string; startX: number; startY: number; oxPct: number; oyPct: number }
  | {
      kind: 'resize';
      id: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      ox: number;
      oy: number;
      ow: number;
      oh: number;
    }
  | {
      kind: 'rotate';
      id: string;
      cx: number;
      cy: number;
      startAngle: number;
      startRot: number;
    }
  | null;

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

function OverlayLayer({
  overlays,
  photos,
  template,
  photoFrameColor,
  editable,
  selectedOverlayId,
  onSelectOverlay,
  onOverlaysChange,
  containerRef,
}: OverlayLayerProps) {
  const photoMap = new Map(photos.map((p) => [p.id, p]));
  // drag 用 ref —— pointerdown 同步生效，且不会被 React re-render 异步切片打断
  const dragRef = useRef<DragMode>(null);
  // livePatch 用 state —— 驱动实时 UI 重绘
  const [livePatch, setLivePatch] = useState<Partial<OverlayBaseSnapshot> & { id?: string }>({});
  // overlays / onOverlaysChange 通过 ref 拿最新值（pointermove/up 闭包不会过期）
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const onOverlaysChangeRef = useRef(onOverlaysChange);
  onOverlaysChangeRef.current = onOverlaysChange;
  const livePatchRef = useRef(livePatch);
  livePatchRef.current = livePatch;

  // 把外部传入的 overlays 与 livePatch 合并出实际渲染列表
  const displayOverlays: Overlay[] = livePatch.id
    ? overlays.map((o) =>
        o.id === livePatch.id
          ? ({
              ...o,
              x: livePatch.x ?? o.x,
              y: livePatch.y ?? o.y,
              w: livePatch.w ?? o.w,
              h: livePatch.h ?? o.h,
              rotation: livePatch.rotation ?? o.rotation,
            } as Overlay)
          : o,
      )
    : overlays;

  // 公共：把屏幕像素位移 → 百分比（基于页面容器尺寸）
  function pageSizePx(): { w: number; h: number } | null {
    const root = containerRef.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { w: rect.width, h: rect.height };
  }

  function handlePointerMove(e: PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const sz = pageSizePx();
    if (!sz) return;
    if (drag.kind === 'move') {
      const dxPct = ((e.clientX - drag.startX) / sz.w) * 100;
      const dyPct = ((e.clientY - drag.startY) / sz.h) * 100;
      setLivePatch({ id: drag.id, x: drag.oxPct + dxPct, y: drag.oyPct + dyPct });
    } else if (drag.kind === 'resize') {
      const dxPct = ((e.clientX - drag.startX) / sz.w) * 100;
      const dyPct = ((e.clientY - drag.startY) / sz.h) * 100;
      let nx = drag.ox;
      let ny = drag.oy;
      let nw = drag.ow;
      let nh = drag.oh;
      // 四角与四边各自影响 x/y/w/h
      if (drag.handle.includes('e')) nw = Math.max(4, drag.ow + dxPct);
      if (drag.handle.includes('s')) nh = Math.max(4, drag.oh + dyPct);
      if (drag.handle.includes('w')) {
        nw = Math.max(4, drag.ow - dxPct);
        nx = drag.ox + (drag.ow - nw);
      }
      if (drag.handle.includes('n')) {
        nh = Math.max(4, drag.oh - dyPct);
        ny = drag.oy + (drag.oh - nh);
      }
      setLivePatch({ id: drag.id, x: nx, y: ny, w: nw, h: nh });
    } else if (drag.kind === 'rotate') {
      const ang = (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180) / Math.PI;
      const delta = ang - drag.startAngle;
      let next = drag.startRot + delta;
      // 规范到 -180~180
      while (next > 180) next -= 360;
      while (next < -180) next += 360;
      setLivePatch({ id: drag.id, rotation: next });
    }
  }

  function detachListeners() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    detachListeners();
    if (!drag) return;
    const id = drag.id;
    const patch = livePatchRef.current;
    dragRef.current = null;
    setLivePatch({});
    if (!patch.id || !onOverlaysChangeRef.current) return;
    const list = overlaysRef.current;
    const next = list.map((o) =>
      o.id === id
        ? ({
            ...o,
            x: patch.x ?? o.x,
            y: patch.y ?? o.y,
            w: patch.w ?? o.w,
            h: patch.h ?? o.h,
            rotation: patch.rotation ?? o.rotation,
          } as Overlay)
        : o,
    );
    onOverlaysChangeRef.current(next);
  }

  function attachListeners() {
    // 同步注册：pointerdown 之后立刻命中后续 pointermove —— 不依赖 React effect 时序
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }

  // 卸载时确保监听器清理（避免拖到一半组件被卸载导致泄漏）
  useEffect(() => {
    return () => detachListeners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!displayOverlays.length && !editable) return null;

  function startMove(e: ReactPointerEvent<HTMLDivElement>, ov: Overlay) {
    if (!editable) return;
    // 阻止冒泡到 PageView 的 onClick (handleImgClick) 把 selectedPhoto 清空
    e.stopPropagation();
    e.preventDefault();
    onSelectOverlay?.(ov.id);
    dragRef.current = {
      kind: 'move',
      id: ov.id,
      startX: e.clientX,
      startY: e.clientY,
      oxPct: ov.x,
      oyPct: ov.y,
    };
    attachListeners();
  }

  function startResize(
    e: ReactPointerEvent<HTMLDivElement>,
    ov: Overlay,
    handle: ResizeHandle,
  ) {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      kind: 'resize',
      id: ov.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      ox: ov.x,
      oy: ov.y,
      ow: ov.w,
      oh: ov.h,
    };
    attachListeners();
  }

  function startRotate(e: ReactPointerEvent<HTMLDivElement>, ov: Overlay) {
    e.stopPropagation();
    e.preventDefault();
    const root = containerRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const cx = rect.left + (rect.width * (ov.x + ov.w / 2)) / 100;
    const cy = rect.top + (rect.height * (ov.y + ov.h / 2)) / 100;
    const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    dragRef.current = {
      kind: 'rotate',
      id: ov.id,
      cx,
      cy,
      startAngle,
      startRot: ov.rotation ?? 0,
    };
    attachListeners();
  }

  return (
    <div
      className="absolute inset-0"
      style={{
        // 容器永远透传 —— 只让具体 overlay 子元素接收事件，避免遮挡下层照片点击
        pointerEvents: 'none',
        // 在版式骨架上方渲染
        zIndex: 5,
      }}
    >
      {displayOverlays.map((ov, idx) => {
        // 该 photo overlay 在所有 photo overlays 中的序号（1 起）；用于模板编辑器中渲染槽位编号
        const photoSlotIdx =
          ov.kind === 'photo'
            ? displayOverlays.slice(0, idx + 1).filter((o) => o.kind === 'photo').length
            : undefined;
        const selected = editable && ov.id === selectedOverlayId;
        const baseStyle: CSSProperties = {
          position: 'absolute',
          left: `${ov.x}%`,
          top: `${ov.y}%`,
          width: `${ov.w}%`,
          height: `${ov.h}%`,
          transform: ov.rotation ? `rotate(${ov.rotation}deg)` : undefined,
          transformOrigin: 'center center',
          // 选中时淡淡的轮廓，便于看清拖拽边界
          outline: selected ? '1.5px dashed rgba(99,102,241,0.85)' : undefined,
          outlineOffset: selected ? '2px' : undefined,
          touchAction: 'none',
          // 编辑态下 overlay 主体显式可接收 pointer 事件（防止父级或全局规则误伤）
          pointerEvents: editable ? 'auto' : 'none',
          cursor: editable ? 'move' : 'default',
          // 在版式骨架之上 —— 注意 OverlayLayer 已 zIndex:5，这里不再额外加层级
          userSelect: 'none',
        };
        return (
          <div
            key={ov.id}
            data-overlay-id={ov.id}
            className={editable ? 'overlay-draggable' : undefined}
            style={baseStyle}
            onPointerDown={(e) => startMove(e, ov)}
          >
            {ov.kind === 'photo' ? (
              <OverlayPhotoBody overlay={ov} photo={photoMap.get(ov.photoId)} template={template} photoFrameColor={photoFrameColor} placeholderIndex={photoSlotIdx} />
            ) : (
              <OverlayTextBody overlay={ov} />
            )}

            {selected && (
              <>
                {/* 8 个缩放手柄 */}
                {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeHandle[]).map((h) => (
                  <div
                    key={h}
                    onPointerDown={(e) => startResize(e, ov, h)}
                    style={{
                      position: 'absolute',
                      width: 10,
                      height: 10,
                      background: '#fff',
                      border: '1.5px solid rgba(99,102,241,0.95)',
                      borderRadius: 2,
                      ...handlePos(h),
                      cursor: handleCursor(h),
                      touchAction: 'none',
                      zIndex: 2,
                    }}
                  />
                ))}
                {/* 旋转手柄（顶部上方） */}
                <div
                  onPointerDown={(e) => startRotate(e, ov)}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: -28,
                    width: 14,
                    height: 14,
                    marginLeft: -7,
                    background: '#fff',
                    border: '1.5px solid rgba(99,102,241,0.95)',
                    borderRadius: '50%',
                    cursor: 'grab',
                    touchAction: 'none',
                    zIndex: 2,
                  }}
                  title="旋转"
                />
                {/* 旋转手柄到选框的连线 */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: -16,
                    width: 1,
                    height: 16,
                    background: 'rgba(99,102,241,0.6)',
                    zIndex: 1,
                    pointerEvents: 'none',
                  }}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface OverlayBaseSnapshot {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

/** 8 个缩放手柄的位置（绝对定位坐标） */
function handlePos(h: ResizeHandle): CSSProperties {
  const cx = '50%';
  const cy = '50%';
  const off = -5;
  switch (h) {
    case 'nw':
      return { left: off, top: off };
    case 'n':
      return { left: cx, top: off, marginLeft: -5 };
    case 'ne':
      return { right: off, top: off };
    case 'e':
      return { right: off, top: cy, marginTop: -5 };
    case 'se':
      return { right: off, bottom: off };
    case 's':
      return { left: cx, bottom: off, marginLeft: -5 };
    case 'sw':
      return { left: off, bottom: off };
    case 'w':
      return { left: off, top: cy, marginTop: -5 };
  }
}

function handleCursor(h: ResizeHandle): string {
  switch (h) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
  }
}

/** 单个图片叠层渲染（用现有 PhotoFrame 复用模板风格 + 形状） */
function OverlayPhotoBody({
  overlay,
  photo,
  template,
  photoFrameColor,
  placeholderIndex,
}: {
  overlay: OverlayPhoto;
  photo?: Photo;
  template: Template;
  photoFrameColor: string | null;
  /** 模板编辑器中传入的"槽位编号"（1 起），用于渲染占位上的"#1/#2..." */
  placeholderIndex?: number;
}) {
  // 模板编辑器中的占位 / 引用的照片已被删除 → 渲染中性占位
  if (overlay.placeholder || !photo) {
    const isTemplateSlot = !!overlay.placeholder;
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center select-none"
        style={{
          background: isTemplateSlot
            ? 'repeating-linear-gradient(135deg, #f5f5f5 0 8px, #ececec 8px 16px)'
            : 'rgba(255,228,230,0.6)',
          border: isTemplateSlot ? '1.5px dashed #a3a3a3' : '1px dashed #fb7185',
          borderRadius: overlay.shape === 'circle' ? '50%' : 8,
          color: isTemplateSlot ? '#737373' : '#e11d48',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: '22%', lineHeight: 1 }}>{isTemplateSlot ? '🖼' : '⚠'}</div>
        <div style={{ fontSize: '11%', marginTop: 2, fontWeight: 500 }}>
          {isTemplateSlot
            ? placeholderIndex
              ? `图片槽位 #${placeholderIndex}`
              : '图片槽位'
            : '图片已删除'}
        </div>
      </div>
    );
  }
  // 用一个临时的"形状/颜色"上下文，让 PhotoFrame 走叠层指定的形状
  return (
    <PhotoShapeContext.Provider value={() => overlay.shape ?? 'rect'}>
      <PhotoFrameColorContext.Provider value={overlay.borderColor ?? photoFrameColor ?? null}>
        <div className="w-full h-full" style={{ pointerEvents: 'none' }}>
          <PhotoFrame photo={photo} template={template} className="w-full h-full" />
        </div>
      </PhotoFrameColorContext.Provider>
    </PhotoShapeContext.Provider>
  );
}

/** 单个文字叠层渲染（不使用 PhotoFrame；最简、可读、可导出） */
function OverlayTextBody({ overlay }: { overlay: OverlayText }) {
  const style: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent:
      overlay.align === 'left' ? 'flex-start' : overlay.align === 'right' ? 'flex-end' : 'center',
    textAlign: overlay.align ?? 'center',
    color: overlay.color ?? '#222',
    fontFamily: overlay.fontFamily,
    fontSize: overlay.fontSize ? `${overlay.fontSize}px` : undefined,
    fontWeight: overlay.bold ? 700 : 400,
    fontStyle: overlay.italic ? 'italic' : undefined,
    background: overlay.background && overlay.background !== 'transparent' ? overlay.background : undefined,
    padding: overlay.background && overlay.background !== 'transparent' ? '4px 8px' : 0,
    borderRadius: overlay.background && overlay.background !== 'transparent' ? 6 : 0,
    lineHeight: 1.25,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    pointerEvents: 'none',
    userSelect: 'none',
  };
  return <div style={style}>{overlay.text || '文字'}</div>;
}
