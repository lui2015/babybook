import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Book, Template } from '../types';
import { PageView } from './PageView';

interface Props {
  book: Book;
  template: Template;
  /** 外部 index 仍按"单页"语义传入；组件内部会对齐到对开组（偶数页索引） */
  index: number;
  onIndexChange: (i: number) => void;
  /** 外部引用主视图容器（用于截图单页 PDF 导出等）——指向当前可见的右半页 */
  stageRef?: React.RefObject<HTMLDivElement>;
  /** 是否启用键盘 ←/→ 翻页（默认 true） */
  enableKeyboard?: boolean;
  /** 主题 bg 色（若不传，用 template.colors.bg） */
  bgColor?: string;
  /** 舞台高度（默认自适应，最小 60vh） */
  minStageHeight?: string;
  /** 翻页动画时长 ms，默认 850 */
  flipDuration?: number;
  /**
   * 触摸滑动翻页用哪个轴（'x' 默认 = 横向滑动；'y' = 纵向滑动）。
   * 用于「BookDetailPage 手机伪全屏」会把整个 BookFlip rotate(90deg)，
   * 旋转后用户视觉上的「左右滑动」对应物理「上下滑动」（clientX 不变、clientY 在变）。
   */
  swipeAxis?: 'x' | 'y';
}

/**
 * 画册翻页组件——真正的对开式翻书：每次翻页换两整页
 *
 * 视觉布局（对开两页同时显示，spread = 一组对开）：
 *   ┌──────────┬──────────┐
 *   │ pages[L] │ pages[L+1]│      L 始终是偶数（0,2,4,...）
 *   │   左半页  │   右半页  │
 *   └──────────┴──────────┘
 *
 * 翻页规则（与现实书一致）：
 *  - next：右半 pages[L+1] 作为翻动纸，绕"左边缘=中央书脊"从 0° → -180° 翻到左侧。
 *      正面 = pages[L+1]（朝右）；背面 = pages[L+2]（朝左，翻完后落到左侧）。
 *      动画结束后 spread 切到 (L+2, L+3) → 视觉上左右换成"再后两页"，
 *      旧的 pages[L]/pages[L+1] 不再出现，**无任何残留**，符合"翻完两页就翻过去"。
 *  - prev：左半 pages[L] 作为翻动纸，绕"右边缘=中央书脊"从 0° → 180° 翻回右侧。
 *      正面 = pages[L]；背面 = pages[L-1]（落到右侧）。动画结束后切到 (L-2, L-1)。
 *
 * 关键视觉无缝细节：
 *  - 翻动纸的"背面"画 *新一组对开里离脊最近的那张*：
 *      next：背面 = pages[L+2]（新左半），prev：背面 = pages[L-1]（新右半）。
 *    动画过半时，翻动纸经过中央书脊→新对开侧，背面正好覆盖到"新对开里 *远离* 脊的旧对开露出区"上方？
 *    其实不是，请看下面"覆盖关系"：动画期间静态层就停留在旧 spread；翻动纸覆盖整个"翻起的一侧"，
 *    动画结束瞬间一次性把静态层切到新 spread，并卸下翻动纸——切换瞬间因为：
 *      next：翻动纸落点（左侧）显示的是它的"背面 = pages[L+2]"，
 *            而新静态左侧 = pages[L+2]，两者完全一致 → 无闪烁；
 *            新静态右侧 = pages[L+3]（之前被旧右半遮住，但翻动纸正好遮住整个右半，
 *            所以旧右半被翻起 + 翻动纸下方的右半此刻其实"已经是新内容也无所谓"，因为被遮挡）。
 *      prev 镜像同理。
 *  - 因此动画期间静态层用 fromSpread；动画结束后切到 toSpread，并保留翻动纸残影 1 帧避免闪
 *    （此处通过 setTimeout 直接切换；CSS 动画 forwards 保证最终状态稳定）。
 */
export function BookFlip({
  book,
  template,
  index,
  onIndexChange,
  stageRef,
  enableKeyboard = true,
  bgColor,
  minStageHeight = '60vh',
  flipDuration = 850,
  swipeAxis = 'x',
}: Props) {
  const total = book.pages.length;
  // 触摸起点：根据 swipeAxis 取 clientX 或 clientY
  const touchStartPos = useRef<number | null>(null);

  /** 把单页索引对齐到对开组的左页（偶数） */
  const alignSpread = useCallback((i: number) => {
    const v = Math.max(0, Math.min(total - 1, i));
    return v - (v % 2);
  }, [total]);

  /** 当前对开组的左页索引 L（偶数）；右页 = L+1（可能越界） */
  const spreadIndex = useMemo(() => alignSpread(index), [alignSpread, index]);

  /** 当前对开组的总数（向上取整） */
  const totalSpreads = Math.ceil(total / 2);
  /** 当前对开组在第几对（0-based） */
  const currentSpreadNo = Math.floor(spreadIndex / 2);

  // 翻页状态：fromSpread → toSpread（步进 ±2）
  const [flip, setFlip] = useState<{
    direction: 'next' | 'prev';
    fromSpread: number; // 偶数
    toSpread: number; // 偶数
  } | null>(null);

  /** 翻一组对开（next: +2, prev: -2） */
  const flipSpread = useCallback(
    (delta: 1 | -1) => {
      if (flip) return;
      const from = spreadIndex;
      const to = alignSpread(from + delta * 2);
      if (to === from) return;
      const direction: 'next' | 'prev' = delta > 0 ? 'next' : 'prev';
      setFlip({ direction, fromSpread: from, toSpread: to });
      window.setTimeout(() => {
        // 翻完后把外部 index 同步到新对开的左页（保留奇偶差异：原本是奇数则保持奇数）
        const wasOdd = index % 2 === 1;
        onIndexChange(wasOdd ? Math.min(total - 1, to + 1) : to);
        setFlip(null);
      }, flipDuration);
    },
    [flip, spreadIndex, alignSpread, index, onIndexChange, total, flipDuration],
  );

  /** 缩略图直跳：跳到目标页所在对开组 */
  const jumpTo = useCallback(
    (target: number) => {
      if (flip) return;
      const t = Math.max(0, Math.min(total - 1, target));
      const targetSpread = alignSpread(t);
      if (targetSpread === spreadIndex) {
        // 同一对开，无需翻页动画，仅同步外部 index（不会触发翻动）
        onIndexChange(t);
        return;
      }
      const direction: 'next' | 'prev' = targetSpread > spreadIndex ? 'next' : 'prev';
      setFlip({ direction, fromSpread: spreadIndex, toSpread: targetSpread });
      window.setTimeout(() => {
        onIndexChange(t);
        setFlip(null);
      }, flipDuration);
    },
    [flip, total, alignSpread, spreadIndex, onIndexChange, flipDuration],
  );

  // 键盘翻页
  useEffect(() => {
    if (!enableKeyboard) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') flipSpread(-1);
      else if (e.key === 'ArrowRight') flipSpread(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enableKeyboard, flipSpread]);

  // —— 渲染索引 ——
  // 关键点："被翻走那一侧"的静态层在动画开始那一刻就提前切到新页，
  // 因为它整段动画里都被翻动纸（正面/下方）覆盖，看不见，
  // 等翻动纸离开时露出来的就直接是新页 → 动画结束瞬间静态层无需切换 → 不再"突然变"。
  //   next：右半被翻起，右半静态提前 = toSpread + 1（新右页）；左半静态保持 fromSpread（不动）
  //   prev：左半被翻起，左半静态提前 = toSpread     （新左页）；右半静态保持 fromSpread+1（不动）
  let leftStaticIndex: number;
  let rightStaticIndex: number;
  if (flip) {
    if (flip.direction === 'next') {
      leftStaticIndex = flip.fromSpread; // 旧左半：被书脊/翻动纸根部压住，全程不变
      rightStaticIndex = flip.toSpread + 1; // 右半：提前换成新右页（被翻动纸完全遮挡）
    } else {
      leftStaticIndex = flip.toSpread; // 左半：提前换成新左页（被翻动纸完全遮挡）
      rightStaticIndex = flip.fromSpread + 1; // 旧右半：全程不变
    }
  } else {
    leftStaticIndex = spreadIndex;
    rightStaticIndex = spreadIndex + 1;
  }

  // 翻动纸的正反面索引：
  //   next：正面 = fromSpread + 1（旧右半），背面 = toSpread（新左半）
  //   prev：正面 = fromSpread     （旧左半），背面 = toSpread + 1（新右半）
  let flipFrontIndex = -1;
  let flipBackIndex = -1;
  if (flip) {
    if (flip.direction === 'next') {
      flipFrontIndex = flip.fromSpread + 1;
      flipBackIndex = flip.toSpread; // 新左半（必然 = fromSpread + 2）
    } else {
      flipFrontIndex = flip.fromSpread; // 旧左半
      flipBackIndex = flip.toSpread + 1; // 新右半（= fromSpread - 1）
    }
  }

  const inRange = (i: number) => i >= 0 && i < total;

  // —— 主动预加载：把"相邻对开"的所有照片用 Image() 触发浏览器请求 + 解码 ——
  // 这样在用户翻页前，下一/上一对开的图就已躺在浏览器图像缓存里，避免动画结束瞬间的"加载跳跃"。
  useEffect(() => {
    const photoById = new Map(book.photos.map((p) => [p.id, p.src] as const));
    const adjacentSpreadStarts = [
      spreadIndex + 2, // 下一对开
      spreadIndex - 2, // 上一对开
      spreadIndex + 4, // 下下对开
    ];
    const urls = new Set<string>();
    for (const start of adjacentSpreadStarts) {
      for (const off of [0, 1]) {
        const i = start + off;
        if (i < 0 || i >= total) continue;
        const ids = book.pages[i]?.photoIds ?? [];
        for (const id of ids) {
          const src = photoById.get(id);
          if (src) urls.add(src);
        }
      }
    }
    // 触发请求（不挂到 DOM 也能进缓存）
    const imgs: HTMLImageElement[] = [];
    urls.forEach((src) => {
      const img = new Image();
      // 优先解码到 GPU/位图，进一步降低首帧绘制开销
      img.decoding = 'async';
      img.src = src;
      // 防止 GC 提前释放：保留在数组里直到清理
      imgs.push(img);
      // 现代浏览器支持 decode()，能在 Promise resolve 时确认已解码
      if (typeof img.decode === 'function') {
        img.decode().catch(() => {
          /* 解码失败忽略，src 已设，仍会缓存 HTTP 资源 */
        });
      }
    });
    return () => {
      // 取消尚未完成的请求（设置空 src 在多数浏览器会中止）
      imgs.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    };
  }, [book.pages, book.photos, spreadIndex, total]);

  return (
    <div>
      <style>{FLIP_CSS}</style>

      {/* 主视图 */}
      <div
        // 手机端把外层 padding 收紧到 p-2，让出更多空间给相册本身；
        // sm 以上恢复 p-8 留出舒服的边距。
        className="rounded-2xl sm:rounded-3xl p-2 sm:p-8 flex items-center justify-center select-none relative"
        style={{
          background: bgColor ?? template.colors.bg,
          minHeight: minStageHeight,
        }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (!t) {
            touchStartPos.current = null;
            return;
          }
          touchStartPos.current = swipeAxis === 'y' ? t.clientY : t.clientX;
        }}
        onTouchEnd={(e) => {
          if (touchStartPos.current == null) return;
          const t = e.changedTouches[0];
          const end = t ? (swipeAxis === 'y' ? t.clientY : t.clientX) : 0;
          const d = end - touchStartPos.current;
          touchStartPos.current = null;
          if (Math.abs(d) < 40) return;
          // d < 0 表示「向起点的反方向滑」：横向是「左滑→下一页」；
          // 纵向（旋转 90° 后）也是「视觉上左滑 = 物理上滑 = clientY 减小」→ 同样是下一页。
          flipSpread(d < 0 ? 1 : -1);
        }}
      >
        {/*
          布局策略：
          - 手机（<sm）：导航箭头改为「绝对定位悬浮在画册两侧」，不再占 flex 列；
            画册本身用整个容器宽度，最大化展示。
          - 桌面（≥sm）：保留原来的 flex 行内布局，箭头 + 画册 + 箭头并列，体验不变。
        */}
        <div className="flex items-center gap-3 sm:gap-4 w-full">
          {/* 桌面端的左侧箭头 */}
          <NavArrow
            onClick={() => flipSpread(-1)}
            disabled={spreadIndex === 0 || !!flip}
            dir="left"
            className="hidden sm:flex"
          />

          {/* 翻书舞台（透视 + 3D），对开宽高比 = 2 * 3:4 = 3:2 */}
          <div className="flex-1 max-w-3xl mx-auto bookflip-stage">
            <div className="bookflip-perspective relative aspect-[3/2] w-full">
              {/* 桌面阴影 */}
              <div className="bookflip-deskshadow" aria-hidden />

              {/* 左半静态页 */}
              <div className="bookflip-half bookflip-left">
                {inRange(leftStaticIndex) ? (
                  <PageView
                    page={book.pages[leftStaticIndex]}
                    photos={book.photos}
                    template={template}
                    babyName={book.babyName}
                    dateRange={book.dateRange}
                    photoFrameColor={book.theme?.photoFrameColor ?? null}
                  />
                ) : (
                  <CoverFiller template={template} side="left" />
                )}
              </div>

              {/* 右半静态页（当前可见的右页 = 主截图对象） */}
              <div
                className="bookflip-half bookflip-right"
                ref={stageRef}
                data-active="true"
                data-page-index={rightStaticIndex}
              >
                {inRange(rightStaticIndex) ? (
                  <PageView
                    page={book.pages[rightStaticIndex]}
                    photos={book.photos}
                    template={template}
                    babyName={book.babyName}
                    dateRange={book.dateRange}
                    photoFrameColor={book.theme?.photoFrameColor ?? null}
                  />
                ) : (
                  <CoverFiller template={template} side="right" />
                )}
              </div>

              {/* 中央书脊 */}
              <div className="bookflip-gutter" aria-hidden />

              {/* 翻动纸：仅翻页时挂载 */}
              {flip && (
                <div
                  className={`bookflip-paper bookflip-paper-${flip.direction}`}
                  style={{ ['--flip-dur' as string]: `${flipDuration}ms` }}
                >
                  <div className="bookflip-face bookflip-front">
                    {inRange(flipFrontIndex) ? (
                      <PageView
                        page={book.pages[flipFrontIndex]}
                        photos={book.photos}
                        template={template}
                        babyName={book.babyName}
                        dateRange={book.dateRange}
                        photoFrameColor={book.theme?.photoFrameColor ?? null}
                      />
                    ) : (
                      <CoverFiller
                        template={template}
                        side={flip.direction === 'next' ? 'right' : 'left'}
                      />
                    )}
                  </div>
                  <div className="bookflip-face bookflip-back">
                    {inRange(flipBackIndex) ? (
                      <PageView
                        page={book.pages[flipBackIndex]}
                        photos={book.photos}
                        template={template}
                        babyName={book.babyName}
                        dateRange={book.dateRange}
                        photoFrameColor={book.theme?.photoFrameColor ?? null}
                      />
                    ) : (
                      <CoverFiller
                        template={template}
                        side={flip.direction === 'next' ? 'left' : 'right'}
                      />
                    )}
                  </div>
                  {/* 翻页时横扫的高光 */}
                  <div className="bookflip-gloss" aria-hidden />
                </div>
              )}
            </div>
          </div>

          <NavArrow
            onClick={() => flipSpread(1)}
            disabled={currentSpreadNo >= totalSpreads - 1 || !!flip}
            dir="right"
            className="hidden sm:flex"
          />
        </div>

        {/* 手机端：悬浮在画册左右两侧的小箭头（半透明，不挡画册） */}
        <NavArrow
          onClick={() => flipSpread(-1)}
          disabled={spreadIndex === 0 || !!flip}
          dir="left"
          className="sm:hidden absolute left-1 top-1/2 -translate-y-1/2 w-9 h-9 z-10 bg-white/80 shadow-md"
        />
        <NavArrow
          onClick={() => flipSpread(1)}
          disabled={currentSpreadNo >= totalSpreads - 1 || !!flip}
          dir="right"
          className="sm:hidden absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 z-10 bg-white/80 shadow-md"
        />
      </div>

      {/* 页码：对开页码 + 单页位置 */}
      <div className="text-center mt-3 text-sm text-neutral-600">
        第 {currentSpreadNo + 1} / {totalSpreads} 跨页
        <span className="mx-2 text-neutral-300">·</span>
        {index + 1} / {total} 页
      </div>

      {/* 缩略图条 */}
      <div className="mt-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 pb-2">
          {book.pages.map((p, i) => (
            <button
              key={p.id}
              onClick={() => jumpTo(i)}
              className={`flex-shrink-0 w-14 sm:w-16 aspect-[3/4] rounded overflow-hidden border-2 transition ${
                alignSpread(i) === spreadIndex
                  ? 'border-rose scale-105'
                  : 'border-transparent opacity-70'
              }`}
              title={`第 ${i + 1} 页`}
            >
              <PageView
                page={p}
                photos={book.photos}
                template={template}
                babyName={book.babyName}
                dateRange={book.dateRange}
                photoFrameColor={book.theme?.photoFrameColor ?? null}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 边界占位：对开越界时显示一张柔和封皮色的"纸"（如奇数总页时最后一页右侧空位） */
function CoverFiller({ template, side }: { template: Template; side: 'left' | 'right' }) {
  return (
    <div
      className="w-full h-full flex items-center justify-center text-xs text-neutral-400"
      style={{
        background: template.colors.paper,
        borderTopLeftRadius: side === 'left' ? 10 : 0,
        borderBottomLeftRadius: side === 'left' ? 10 : 0,
        borderTopRightRadius: side === 'right' ? 10 : 0,
        borderBottomRightRadius: side === 'right' ? 10 : 0,
      }}
    >
      <span className="opacity-60">{side === 'left' ? '封底' : '封面'}</span>
    </div>
  );
}

function NavArrow({
  onClick,
  disabled,
  dir,
  className = '',
}: {
  onClick: () => void;
  disabled?: boolean;
  dir: 'left' | 'right';
  /** 额外类（用于 hidden sm:flex / 手机端悬浮定位等） */
  className?: string;
}) {
  // 默认尺寸 w-10 h-10；调用方可通过 className 用 w-9 h-9 等覆盖（Tailwind 后写优先）
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'left' ? '上一跨页' : '下一跨页'}
      className={`w-10 h-10 rounded-full bg-white/70 backdrop-blur border border-white hover:bg-white disabled:opacity-30 transition flex-shrink-0 text-xl flex items-center justify-center ${className}`}
    >
      {dir === 'left' ? '‹' : '›'}
    </button>
  );
}

/**
 * 翻书 CSS：
 *  - 舞台 .bookflip-perspective：宽高比 3:2（两张 3:4 并排）
 *  - .bookflip-half 左右各 50%，绝对定位
 *  - .bookflip-gutter：中央书脊（装订缝）阴影
 *  - .bookflip-paper：翻动纸 50% 宽，next 位于右半绕左缘翻；prev 位于左半绕右缘翻
 *  - 背面 rotateY(180deg)，与正面构成双面纸
 *  - 翻页结束后 forwards 停在最终态；同时 setTimeout 切换静态层 spread + 卸载翻动纸 → 视觉无缝
 */
const FLIP_CSS = `
.bookflip-stage { perspective-origin: center; }
.bookflip-perspective {
  perspective: 2200px;
  transform-style: preserve-3d;
}
.bookflip-deskshadow {
  position: absolute;
  inset: 4% -2% -6% -2%;
  background: radial-gradient(ellipse at 50% 90%, rgba(0,0,0,0.28), rgba(0,0,0,0) 65%);
  filter: blur(4px);
  z-index: 0;
  pointer-events: none;
}
.bookflip-half {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  background: #fff;
  overflow: hidden;
  z-index: 1;
}
.bookflip-half.bookflip-left {
  left: 0;
  border-top-left-radius: 10px;
  border-bottom-left-radius: 10px;
  box-shadow:
    -4px 6px 18px -10px rgba(0,0,0,0.35),
    inset -8px 0 14px -8px rgba(0,0,0,0.18);
}
.bookflip-half.bookflip-right {
  left: 50%;
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
  box-shadow:
    4px 6px 18px -10px rgba(0,0,0,0.35),
    inset 8px 0 14px -8px rgba(0,0,0,0.18);
}
.bookflip-gutter {
  position: absolute;
  top: 0; bottom: 0;
  left: calc(50% - 8px);
  width: 16px;
  background: linear-gradient(90deg,
    rgba(0,0,0,0.00) 0%,
    rgba(0,0,0,0.22) 45%,
    rgba(0,0,0,0.28) 50%,
    rgba(0,0,0,0.22) 55%,
    rgba(0,0,0,0.00) 100%);
  z-index: 4;
  pointer-events: none;
}
.bookflip-paper {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  transform-style: preserve-3d;
  will-change: transform;
  z-index: 5;
  box-shadow: 0 18px 36px -14px rgba(0,0,0,0.45);
}
.bookflip-paper-next {
  left: 50%;
  transform-origin: left center;
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
  animation: bookflip-next var(--flip-dur, 850ms) cubic-bezier(0.45, 0.05, 0.35, 1) forwards;
}
.bookflip-paper-prev {
  left: 0;
  transform-origin: right center;
  border-top-left-radius: 10px;
  border-bottom-left-radius: 10px;
  animation: bookflip-prev var(--flip-dur, 850ms) cubic-bezier(0.45, 0.05, 0.35, 1) forwards;
}
@keyframes bookflip-next {
  0%   { transform: rotateY(0deg); }
  100% { transform: rotateY(-180deg); }
}
@keyframes bookflip-prev {
  0%   { transform: rotateY(0deg); }
  100% { transform: rotateY(180deg); }
}
.bookflip-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  overflow: hidden;
  background: #fff;
}
.bookflip-paper-next .bookflip-front {
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
}
.bookflip-paper-next .bookflip-back {
  transform: rotateY(180deg);
  border-top-left-radius: 10px;
  border-bottom-left-radius: 10px;
}
.bookflip-paper-prev .bookflip-front {
  border-top-left-radius: 10px;
  border-bottom-left-radius: 10px;
}
.bookflip-paper-prev .bookflip-back {
  transform: rotateY(180deg);
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
}

.bookflip-gloss {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(100deg,
    rgba(255,255,255,0) 35%,
    rgba(255,255,255,0.40) 50%,
    rgba(0,0,0,0.12) 62%,
    rgba(0,0,0,0) 78%);
  mix-blend-mode: overlay;
  opacity: 0.9;
  animation: bookflip-gloss var(--flip-dur, 850ms) ease-in-out forwards;
}
@keyframes bookflip-gloss {
  0%   { transform: translateX(-30%); opacity: 0; }
  40%  { opacity: 0.95; }
  100% { transform: translateX(30%); opacity: 0; }
}
`;
