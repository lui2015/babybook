import type { CSSProperties } from 'react';
import { memo, useState } from 'react';
import type { BookPage, Photo, Template, TemplateStyle } from '../types';

interface Props {
  page: BookPage;
  photos: Photo[];
  template: Template;
  babyName?: string;
  dateRange?: string;
  /** 纯展示模式下基准宽度，用于 html2canvas 导出 */
  width?: number;
  height?: number;
}

/**
 * 一页画册的渲染组件
 * 按 template.style 走完全不同的视觉骨架：
 *   watercolor / cartoon / minimal / vintage / festival-cn / festival-xmas
 */
function PageViewInner({ page, photos, template, babyName, dateRange, width, height }: Props) {
  const photoMap = new Map(photos.map((p) => [p.id, p]));
  // 只保留 src 非空的有效照片，避免出现空白相框
  const pagePhotos = page.photoIds
    .map((id) => photoMap.get(id))
    .filter((p): p is Photo => !!p && !!p.src);

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

  return (
    <div
      className="relative overflow-hidden shadow-book rounded-md"
      style={pageStyle}
    >
      {/* 风格化装饰层 */}
      <StyleDecorations template={template} />

      {/* 按版式渲染（使用降级后的 resolvedLayout，保证永不空白） */}
      {resolvedLayout === 'cover' && (
        <CoverLayout
          photo={pagePhotos[0]}
          title={page.title ?? template.defaultTitle}
          subtitle={page.subtitle ?? template.defaultSubtitle}
          babyName={babyName}
          dateRange={dateRange}
          template={template}
        />
      )}

      {resolvedLayout === 'single' && pagePhotos[0] && (
        <SingleLayout photo={pagePhotos[0]} caption={page.caption} template={template} />
      )}

      {resolvedLayout === 'single-portrait' && pagePhotos[0] && (
        <SinglePortraitLayout
          photo={pagePhotos[0]}
          caption={page.caption}
          template={template}
        />
      )}

      {resolvedLayout === 'double' && pagePhotos.length >= 2 && (
        <DoubleLayout photos={pagePhotos} caption={page.caption} template={template} />
      )}

      {resolvedLayout === 'triple' && pagePhotos.length >= 3 && (
        <TripleLayout photos={pagePhotos} caption={page.caption} template={template} />
      )}

      {resolvedLayout === 'grid4' && pagePhotos.length >= 4 && (
        <Grid4Layout photos={pagePhotos} caption={page.caption} template={template} />
      )}

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
    prev.height === next.height
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
}: {
  src: string;
  alt?: string;
  template: Template;
  className?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`h-full w-full ${className}`} style={style}>
        <CoverPlaceholder template={template} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="eager"
      decoding="async"
      draggable={false}
      className={`h-full w-full object-cover ${className}`}
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
}: {
  photo: Photo;
  template: Template;
  rotate?: number;
  className?: string;
}) {
  const { style, colors } = template;

  if (style === 'vintage') {
    // Polaroid：厚米白边 + 轻微旋转（深色纸也适配）
    const isDarkPaper =
      template.colors.paper.startsWith('#1') ||
      template.colors.paper.startsWith('#2') ||
      template.colors.paper.startsWith('#3');
    const frameBg = isDarkPaper ? '#F2E7D0' : '#FFFEF7';
    return (
      <div
        className={`overflow-hidden ${className}`}
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
            className="h-full w-full object-cover"
            style={{ filter: 'sepia(0.25) contrast(0.95) saturate(0.9)' }}
          />
        </div>
      </div>
    );
  }

  if (style === 'cartoon') {
    // 厚彩色圆角边
    return (
      <div
        className={`overflow-hidden rounded-3xl ${className}`}
        style={{
          border: `4px solid ${colors.primary}`,
          boxShadow: `0 4px 0 ${colors.accent}`,
        }}
      >
        <SafeImg src={photo.src} template={template} />
      </div>
    );
  }

  if (style === 'watercolor') {
    // 柔和圆角长方形 + 纸质白边 + 淡彩投影（水彩画纸贴纸感）
    return (
      <div
        className={`overflow-hidden rounded-2xl ${className}`}
        style={{
          background: colors.paper,
          padding: '6px',
          boxShadow: `0 6px 18px ${colors.primary}33, 0 0 0 1px ${colors.accent}22`,
        }}
      >
        <div className="w-full h-full overflow-hidden rounded-xl">
          <SafeImg src={photo.src} template={template} />
        </div>
      </div>
    );
  }

  if (style === 'festival-cn') {
    return (
      <div
        className={`overflow-hidden ${className}`}
        style={{
          border: `3px solid ${colors.primary}`,
          padding: '3px',
          background: colors.paper,
          boxShadow: `0 0 0 1px ${colors.accent}`,
        }}
      >
        <SafeImg src={photo.src} template={template} />
      </div>
    );
  }

  if (style === 'festival-xmas') {
    return (
      <div
        className={`overflow-hidden rounded-lg ${className}`}
        style={{
          border: `3px solid ${colors.primary}`,
          boxShadow: `0 2px 0 ${colors.accent}`,
        }}
      >
        <SafeImg src={photo.src} template={template} />
      </div>
    );
  }

  // minimal 默认：极细灰边，无圆角
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        border: `1px solid ${colors.accent}55`,
      }}
    >
      <SafeImg src={photo.src} template={template} />
    </div>
  );
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
}: {
  photo?: Photo;
  title: string;
  subtitle: string;
  babyName?: string;
  dateRange?: string;
  template: Template;
}) {
  const { style, colors, fontFamily } = template;

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
              <SafeImg src={photo.src} template={template} />
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
            <img
              src={photo.src}
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
              style={{ filter: 'sepia(0.35) contrast(0.92) saturate(0.85)' }}
            />
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
            <SafeImg src={photo.src} template={template} />
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
              <SafeImg src={photo.src} template={template} />
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
            <SafeImg src={photo.src} template={template} />
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
          <SafeImg src={photo.src} alt="cover" template={template} />
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
 *  版式 2：单图大图
 * ============================================================ */
function SingleLayout({ photo, caption, template }: { photo: Photo; caption?: string; template: Template }) {
  const { style } = template;

  if (style === 'vintage') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-6 gap-4">
        <PhotoFrame photo={photo} template={template} rotate={-1.5} className="w-[82%] h-[72%]" />
        {caption && <StyledCaption caption={caption} template={template} />}
      </div>
    );
  }

  if (style === 'minimal') {
    return (
      <div className="h-full w-full flex flex-col p-8 gap-4">
        <div className="text-[10px] tracking-[0.4em]" style={{ color: template.colors.accent }}>
          — MOMENT —
        </div>
        <PhotoFrame photo={photo} template={template} className="flex-1" />
        {caption && (
          <div
            className="text-sm leading-relaxed italic max-w-[80%]"
            style={{ fontFamily: template.fontFamily.title }}
          >
            "{caption}"
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col p-5 gap-3">
      <PhotoFrame photo={photo} template={template} className="flex-1" />
      {caption && <StyledCaption caption={caption} template={template} />}
    </div>
  );
}

/* ============================================================
 *  版式 3：单竖图 —— 左图 + 右文
 * ============================================================ */
function SinglePortraitLayout({ photo, caption, template }: { photo: Photo; caption?: string; template: Template }) {
  const { style, colors, fontFamily } = template;

  if (style === 'minimal') {
    return (
      <div className="h-full w-full flex p-8 gap-6">
        <PhotoFrame photo={photo} template={template} className="flex-[3]" />
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
        <PhotoFrame photo={photo} template={template} rotate={-2} className="flex-[3] h-[88%]" />
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
 *  版式 4：双图并排
 * ============================================================ */
function DoubleLayout({ photos, caption, template }: { photos: Photo[]; caption?: string; template: Template }) {
  const { style } = template;

  // vintage: 两张都微旋转，错落摆放
  if (style === 'vintage') {
    return (
      <div className="h-full w-full flex flex-col p-5 gap-3">
        <div className="flex-1 relative">
          <div className="absolute inset-0 flex items-center justify-around">
            <PhotoFrame photo={photos[0]} template={template} rotate={-3} className="w-[44%] h-[85%]" />
            <PhotoFrame photo={photos[1]} template={template} rotate={2.5} className="w-[44%] h-[85%]" />
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
 *  版式 5：三图拼贴
 * ============================================================ */
function TripleLayout({ photos, caption, template }: { photos: Photo[]; caption?: string; template: Template }) {
  const { style } = template;

  if (style === 'vintage') {
    return (
      <div className="h-full w-full flex flex-col p-4 gap-3">
        <div className="flex-1 relative">
          <PhotoFrame
            photo={photos[0]}
            template={template}
            rotate={-3}
            className="absolute left-[4%] top-[4%] w-[58%] h-[62%]"
          />
          <PhotoFrame
            photo={photos[1]}
            template={template}
            rotate={4}
            className="absolute right-[4%] top-[8%] w-[40%] h-[46%]"
          />
          <PhotoFrame
            photo={photos[2]}
            template={template}
            rotate={-2}
            className="absolute right-[10%] bottom-[4%] w-[46%] h-[44%]"
          />
        </div>
        {caption && <StyledCaption caption={caption} template={template} size="sm" />}
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
 *  版式 6：四格拼贴
 * ============================================================ */
function Grid4Layout({ photos, caption, template }: { photos: Photo[]; caption?: string; template: Template }) {
  const { style } = template;

  if (style === 'vintage') {
    return (
      <div className="h-full w-full flex flex-col p-4 gap-3">
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3">
          {photos.slice(0, 4).map((p, i) => (
            <PhotoFrame
              key={p.id}
              photo={p}
              template={template}
              rotate={[-2, 1.5, 2, -1.5][i] ?? 0}
            />
          ))}
        </div>
        {caption && <StyledCaption caption={caption} template={template} size="sm" />}
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
 * ============================================================ */
function TextLayout({ page, template }: { page: BookPage; template: Template }) {
  const { style, colors, fontFamily } = template;

  if (style === 'minimal') {
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

  if (style === 'festival-cn') {
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
