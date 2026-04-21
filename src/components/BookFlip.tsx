import { useEffect, useRef } from 'react';
import type { Book, Template } from '../types';
import { PageView } from './PageView';

interface Props {
  book: Book;
  template: Template;
  index: number;
  onIndexChange: (i: number) => void;
  /** 外部引用主视图容器（用于截图单页 PDF 导出等） */
  stageRef?: React.RefObject<HTMLDivElement>;
  /** 是否启用键盘 ←/→ 翻页（默认 true） */
  enableKeyboard?: boolean;
  /** 主题 bg 色（若不传，用 template.colors.bg） */
  bgColor?: string;
  /** 舞台高度（默认自适应，最小 60vh） */
  minStageHeight?: string;
}

/**
 * 画册翻页组件（预览 / 详情共用）：
 * - 堆叠预渲染所有页，opacity 渐变切换（稳定、不抖动）
 * - 左右大箭头 + 页码 + 底部缩略图条
 * - 键盘 ←/→ 翻页
 * - 触摸滑动翻页（移动端友好）
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
}: Props) {
  const total = book.pages.length;
  const touchStartX = useRef<number | null>(null);

  function go(delta: number) {
    onIndexChange(Math.max(0, Math.min(total - 1, index + delta)));
  }

  // 键盘翻页
  useEffect(() => {
    if (!enableKeyboard) return;
    function onKey(e: KeyboardEvent) {
      // 避免在输入框里触发
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableKeyboard, index, total]);

  return (
    <div>
      {/* 主视图 */}
      <div
        className="rounded-3xl p-4 sm:p-8 flex items-center justify-center"
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
          <NavArrow onClick={() => go(-1)} disabled={index === 0} dir="left" />
          <div className="flex-1 max-w-md mx-auto" ref={stageRef}>
            <div className="relative aspect-[3/4] w-full">
              {book.pages.map((p, i) => {
                const isActive = i === index;
                return (
                  <div
                    key={p.id}
                    data-active={isActive ? 'true' : 'false'}
                    data-page-index={i}
                    aria-hidden={!isActive}
                    className="absolute inset-0"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transition: 'opacity 260ms ease-out',
                      pointerEvents: isActive ? 'auto' : 'none',
                      zIndex: isActive ? 2 : 1,
                    }}
                  >
                    <PageView
                      page={p}
                      photos={book.photos}
                      template={template}
                      babyName={book.babyName}
                      dateRange={book.dateRange}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <NavArrow onClick={() => go(1)} disabled={index === total - 1} dir="right" />
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
              onClick={() => onIndexChange(i)}
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
