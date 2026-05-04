import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { createContext, memo, useContext, useEffect, useRef, useState } from 'react';
import type { BookPage, Photo, PhotoShape, Template, TemplateStyle } from '../types';
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
const CLIP_PATH_MAP: Partial<Record<PhotoShape, string>> = {
  // 心形（来自通用 SVG path，常见稳定写法）
  heart:
    "path('M 100 190 C 50 150 15 120 15 80 C 15 50 40 25 70 25 C 85 25 95 35 100 50 C 105 35 115 25 130 25 C 160 25 185 50 185 80 C 185 120 150 150 100 190 Z')",
  // 五角星
  star: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  // 正六边形（flat-top）
  hexagon: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
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
 */
function ShapeMask({
  shape,
  children,
  extraStyle,
  extraClassName = '',
}: {
  shape?: PhotoShape;
  children: ReactNode;
  extraStyle?: CSSProperties;
  extraClassName?: string;
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
        style={{ borderRadius: '18%', ...extraStyle }}
      >
        {children}
      </div>
    );
  }
  // 非矩形异形：强制 1:1 + 居中（aspect-square 配合 max-w/max-h 实现）
  const clip = CLIP_PATH_MAP[shape];
  const baseStyle: CSSProperties = {
    aspectRatio: '1 / 1',
    borderRadius: shape === 'circle' ? '50%' : undefined,
    clipPath: clip,
    WebkitClipPath: clip,
    ...extraStyle,
  };
  // 外层用 flex 居中 + 内层自适应为正方形（取 min(宽, 高)）
  return (
    <div className={`w-full h-full flex items-center justify-center ${extraClassName}`}>
      <div
        className="overflow-hidden"
        style={{
          // 让正方形取父容器宽高的较小者
          height: '100%',
          width: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          ...baseStyle,
        }}
      >
        {children}
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
}

/**
 * 一页画册的渲染组件
 * 按 template.style 走完全不同的视觉骨架：
 *   watercolor / cartoon / minimal / vintage / festival-cn / festival-xmas
 */
function PageViewInner({ page, photos, template, babyName, dateRange, width, height, onSelectPhoto, selectedPhotoId, photoFrameColor }: Props) {
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

  const { colors, fontFamily, backgroundPattern } = template;

  /**
   * 照片版式的兜底降级：
   *   原版式要求 N 张，实际只有 M 张（M < N）时，自动降级到能渲染的最高版式，
   *   保证任何情况都不会出现"纯空白页"。
   */
  const resolvedLayout: BookPage['layout'] = (() => {
    if (page.layout === 'cover' || page.layout === 'text' || page.layout === 'ending') {
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

  const pageStyle: CSSProperties = {
    background: backgroundPattern
      ? `${backgroundPattern}, ${colors.paper}`
      : colors.paper,
    color: colors.text,
    fontFamily: fontFamily.body,
    width: width ? `${width}px` : '100%',
    height: height ? `${height}px` : '100%',
    aspectRatio: width && height ? undefined : '3 / 4',
  };

  const editable = !!onSelectPhoto;

  // 编辑模式：点击图片 → onSelectPhoto(photoId)；点击空白 → onSelectPhoto(null)
  const handleImgClick = editable
    ? (e: ReactMouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const imgEl = target.closest('img') as HTMLImageElement | null;
        if (!imgEl) {
          // 点击的是空白区域：取消选中
          onSelectPhoto!(null);
          return;
        }
        // 优先用 dataset.photoId（精准），再退回到按 src 反查
        const datasetId = imgEl.dataset.photoId;
        let pid = datasetId;
        if (!pid) {
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

  // 把"被选中"这个状态直接标注到对应 <img> 节点上（data-selected="true"），
  // 以便 CSS 用 [data-selected] 选择器命中它，无需让每个版式子组件都感知选中 id。
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const imgs = root.querySelectorAll<HTMLImageElement>('img[data-photo-id]');
    imgs.forEach((im) => {
      if (selectedAttr && im.dataset.photoId === selectedAttr) {
        im.dataset.selected = 'true';
      } else {
        delete im.dataset.selected;
      }
    });
  });

  return (
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
      </PhotoShapeContext.Provider>
      </PhotoFrameColorContext.Provider>

      {resolvedLayout === 'text' && <TextLayout page={fallbackPage} template={template} />}

      {resolvedLayout === 'ending' && <EndingLayout page={page} template={template} babyName={babyName} />}
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
    prev.photoFrameColor === next.photoFrameColor
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
 *  图片加载兜底：加载失败时渲染占位块，避免空白相框
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
  if (!src || failed) {
    return (
      <div className={`h-full w-full ${className}`} style={style}>
        <CoverPlaceholder template={template} />
      </div>
    );
  }
  const objectFitClass = fit === 'contain' ? 'object-contain' : 'object-cover';
  return (
    <img
      src={src}
      alt={alt}
      loading="eager"
      decoding="async"
      draggable={false}
      data-photo-id={photoId}
      className={`h-full w-full ${objectFitClass} ${className}`}
      style={style}
      onError={() => setFailed(true)}
      // 尽早触发 decode，避免翻页时才首次解码导致跳动
      ref={(el) => {
        if (el && el.decode) {
          el.decode().catch(() => {});
        }
      }}
    />
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

  // —— 异形：不套 style 相框，直接对 img 整形（保证形状干净） ——
  if (shape && shapeForcesSquare(shape)) {
    return (
      <div
        className={`${className}`}
        style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined }}
      >
        <ShapeMask shape={shape}>
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
