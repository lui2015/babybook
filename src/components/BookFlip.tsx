import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, Template } from '../types';
import { PageView } from './PageView';

interface Props {
  book: Book;
  template: Template;
  index: number;
  onIndexChange: (i: number) => void;
  /** 外部引用主视图容器（用于截图单页 PDF 导出等）——指向当前可见页 */
  stageRef?: React.RefObject<HTMLDivElement>;
  /** 是否启用键盘 ←/→ 翻页（默认 true） */
  enableKeyboard?: boolean;
  /** 主题 bg 色（若不传，用 template.colors.bg） */
  bgColor?: string;
  /** 舞台高度（默认自适应，最小 60vh） */
  minStageHeight?: string;
  /** 翻页动画时长 ms，默认 750 */
  flipDuration?: number;
}

/**
 * 画册翻页组件（预览 / 详情共用）——真实书本翻页：
 * - CSS 3D rotateY 绕左侧"书脊"翻转（-180°）
 * - 正面 = 当前页；背面 = 目标页（翻到一半自动可见）
 * - 底层预渲染上/下页，动画结束后切换真正 index
 * - 中央书脊阴影 + 页面投影，更有"翻实体书"的质感
 * - 保留：键盘 ←/→、触摸滑动、缩略图条、页码
 *
 * 说明：本组件使用单页翻书（不是对开），贴合当前 3:4 画册页结构；
 * 如需"对开跨页"请另行重排版式，改动较大。
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
  flipDuration = 750,
}: Props) {
  const total = book.pages.length;
  const touchStartX = useRef<number | null>(null);

  // 翻页状态：idle | flipping
  // flipping 时：direction = 'next' 向左翻（前进），'prev' 向右翻（后退）
  //   frontIndex: 正面显示的页（翻页开始时 = 当前 index）
  //   backIndex:  背面显示的页（目标页）
  const [flip, setFlip] = useState<{
    direction: 'next' | 'prev';
    frontIndex: number;
    backIndex: number;
  } | null>(null);

  // 对 index 的跟踪，便于动画结束后固化
  const indexRef = useRef(index);
  indexRef.current = index;

  const go = useCallback(
    (delta: number) => {
      if (flip) return; // 动画中禁止重复触发
      const target = Math.max(0, Math.min(total - 1, index + delta));
      if (target === index) return;
      const direction: 'next' | 'prev' = target > index ? 'next' : 'prev';
      setFlip({ direction, frontIndex: index, backIndex: target });
      // 动画结束：固化 index + 清除 flip 状态
      window.setTimeout(() => {
        onIndexChange(target);
        setFlip(null);
      }, flipDuration);
    },
    [flip, index, total, onIndexChange, flipDuration],
  );

  const jumpTo = useCallback(
    (target: number) => {
      if (flip) return;
      const t = Math.max(0, Math.min(total - 1, target));
      if (t === index) return;
      const direction: 'next' | 'prev' = t > index ? 'next' : 'prev';
      setFlip({ direction, frontIndex: index, backIndex: t });
      window.setTimeout(() => {
        onIndexChange(t);
        setFlip(null);
      }, flipDuration);
    },
    [flip, index, total, onIndexChange, flipDuration],
  );

  // 键盘翻页
  useEffect(() => {
    if (!enableKeyboard) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enableKeyboard, go]);

  // 渲染基础页（底层永远是"目标/当前"页，用于翻页时露出底下）
  // 规则：
  //   非翻页状态：底层 = 当前页
  //   next 翻页  ：底层 = 目标页（target），上层的"翻动纸"正面=当前页 rotateY(0→-180)
  //   prev 翻页  ：底层 = 当前页（不变），上层的"翻动纸"正面=目标页 rotateY(-180→0)
  const baseIndex = !flip
    ? index
    : flip.direction === 'next'
      ? flip.backIndex
      : flip.frontIndex;

  // 翻动纸张的正/反面：
  //   next：正面 = 当前页（front），背面 = 目标页（back），从 0 → -180
  //   prev：正面 = 当前页（front），背面 = 目标页（back），从 -180 → 0
  const flipFrontIndex = flip?.frontIndex ?? -1;
  const flipBackIndex = flip?.backIndex ?? -1;

  return (
    <div>
      <style>{FLIP_CSS}</style>

      {/* 主视图 */}
      <div
        className="rounded-3xl p-4 sm:p-8 flex items-center justify-center select-none"
        style={{
          background: bgColor ?? template.colors.bg,
          minHeight: minStageHeight,
        }}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current == null) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(dx) < 40) return;
          go(dx < 0 ? 1 : -1);
        }}
      >
        <div className="flex items-center gap-3 sm:gap-4 w-full">
          <NavArrow onClick={() => go(-1)} disabled={index === 0 || !!flip} dir="left" />

          {/* 翻书舞台（透视 + 3D） */}
          <div className="flex-1 max-w-md mx-auto bookflip-stage">
            <div
              className="bookflip-perspective relative aspect-[3/4] w-full"
              ref={stageRef}
            >
              {/* 书脊阴影（页面左边缘一条柔和暗影，像真书的装订缝） */}
              <div className="bookflip-spine" aria-hidden />

              {/* 底层：静态页（当前/目标）——同时作为截图定位目标 */}
              <div
                className="absolute inset-0 bookflip-page-shadow"
                data-active="true"
                data-page-index={baseIndex}
              >
                <PageView
                  page={book.pages[baseIndex]}
                  photos={book.photos}
                  template={template}
                  babyName={book.babyName}
                  dateRange={book.dateRange}
                />
              </div>

              {/* 翻动纸：只在翻页时挂载 */}
              {flip && (
                <div
                  className={`bookflip-paper ${flip.direction === 'next' ? 'is-next' : 'is-prev'}`}
                  style={{ ['--flip-dur' as string]: `${flipDuration}ms` }}
                >
                  {/* 正面（朝向观众）：next 显示当前页，prev 显示目标页（因为 prev 起始已翻过去） */}
                  <div className="bookflip-face bookflip-front">
                    <PageView
                      page={book.pages[flip.direction === 'next' ? flipFrontIndex : flipBackIndex]}
                      photos={book.photos}
                      template={template}
                      babyName={book.babyName}
                      dateRange={book.dateRange}
                    />
                  </div>
                  {/* 背面（翻过去后朝向观众） */}
                  <div className="bookflip-face bookflip-back">
                    <PageView
                      page={book.pages[flip.direction === 'next' ? flipBackIndex : flipFrontIndex]}
                      photos={book.photos}
                      template={template}
                      babyName={book.babyName}
                      dateRange={book.dateRange}
                    />
                  </div>
                  {/* 翻页时飘过页面的柔和高光/阴影（增强质感） */}
                  <div className="bookflip-gloss" aria-hidden />
                </div>
              )}

              {/* 活动页标记已合并到底层静态页本身 */}
            </div>
          </div>

          <NavArrow
            onClick={() => go(1)}
            disabled={index === total - 1 || !!flip}
            dir="right"
          />
        </div>
      </div>

      {/* 页码 */}
      <div className="text-center mt-3 text-sm text-neutral-600">
        {index + 1} / {total}
      </div>

      {/* 缩略图条 */}
      <div className="mt-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 pb-2">
          {book.pages.map((p, i) => (
            <button
              key={p.id}
              onClick={() => jumpTo(i)}
              className={`flex-shrink-0 w-14 sm:w-16 aspect-[3/4] rounded overflow-hidden border-2 transition ${
                i === index ? 'border-rose scale-105' : 'border-transparent opacity-70'
              }`}
            >
              <PageView
                page={p}
                photos={book.photos}
                template={template}
                babyName={book.babyName}
                dateRange={book.dateRange}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NavArrow({
  onClick,
  disabled,
  dir,
}: {
  onClick: () => void;
  disabled?: boolean;
  dir: 'left' | 'right';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'left' ? '上一页' : '下一页'}
      className="w-10 h-10 rounded-full bg-white/70 backdrop-blur border border-white hover:bg-white disabled:opacity-30 transition flex-shrink-0 text-xl"
    >
      {dir === 'left' ? '‹' : '›'}
    </button>
  );
}

/**
 * 翻书 CSS：
 * - .bookflip-perspective 承载 3D 透视上下文
 * - .bookflip-paper 是翻动的那张纸，transform-origin 左侧（书脊）
 *   next：0deg → -180deg（向左翻走）
 *   prev：-180deg → 0deg（从左翻回）
 * - .bookflip-face 两面都铺满，背面反向 180° 以便翻过去后正向显示
 * - .bookflip-spine 左边一条柔和暗影，像书脊装订
 * - .bookflip-gloss 翻页时横扫的高光，增强"纸"的反射感
 */
const FLIP_CSS = `
.bookflip-stage { perspective-origin: center; }
.bookflip-perspective {
  perspective: 1800px;
  transform-style: preserve-3d;
}
.bookflip-page-shadow {
  box-shadow: 0 16px 40px -18px rgba(15, 20, 40, 0.35), 0 4px 10px -4px rgba(15, 20, 40, 0.15);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.bookflip-spine {
  position: absolute;
  top: 0; bottom: 0; left: 0;
  width: 18px;
  background: linear-gradient(90deg,
    rgba(0,0,0,0.22) 0%,
    rgba(0,0,0,0.10) 45%,
    rgba(0,0,0,0.00) 100%);
  pointer-events: none;
  z-index: 3;
  border-top-left-radius: 10px;
  border-bottom-left-radius: 10px;
}
.bookflip-paper {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  transform-style: preserve-3d;
  will-change: transform;
  z-index: 5;
  border-radius: 10px;
  box-shadow: 0 18px 36px -14px rgba(0,0,0,0.35);
}
.bookflip-paper.is-next {
  animation: bookflip-next var(--flip-dur, 750ms) cubic-bezier(0.45, 0.05, 0.35, 1) forwards;
}
.bookflip-paper.is-prev {
  animation: bookflip-prev var(--flip-dur, 750ms) cubic-bezier(0.45, 0.05, 0.35, 1) forwards;
}
@keyframes bookflip-next {
  0%   { transform: rotateY(0deg); }
  100% { transform: rotateY(-180deg); }
}
@keyframes bookflip-prev {
  0%   { transform: rotateY(-180deg); }
  100% { transform: rotateY(0deg); }
}
.bookflip-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.bookflip-front {}
.bookflip-back { transform: rotateY(180deg); }

.bookflip-gloss {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: 10px;
  background: linear-gradient(100deg,
    rgba(255,255,255,0) 40%,
    rgba(255,255,255,0.35) 50%,
    rgba(0,0,0,0.10) 60%,
    rgba(0,0,0,0) 75%);
  mix-blend-mode: overlay;
  opacity: 0.85;
  animation: bookflip-gloss var(--flip-dur, 750ms) ease-in-out forwards;
}
@keyframes bookflip-gloss {
  0%   { transform: translateX(-30%); opacity: 0; }
  40%  { opacity: 0.9; }
  100% { transform: translateX(30%); opacity: 0; }
}
`;
