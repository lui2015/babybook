import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookPage, Photo, Template } from '../types';
import { PageView } from './PageView';
import { SAMPLE_PHOTOS, getCoverPhotoForTemplate } from '../samplePhotos';

interface Props {
  template: Template | null;
  onClose: () => void;
  onUse: (template: Template) => void;
}

/**
 * 模板效果预览弹窗
 * - 使用内置示例照片（宝宝题材 SVG）+ PageView 真实渲染整本画册
 * - 默认即为「铺满视口 + 双页书本」布局，用户可直接在上面翻阅操作，
 *   不再需要先点击"全屏"按钮（此前的两段式体验太绕）。
 * - 支持：
 *     ← / →              翻页
 *     点击左/右半区     翻页（真实翻书 3D 动画）
 *     点击底部页码      跳转到该页
 *     ESC              关闭弹窗
 */
export function TemplatePreviewModal({ template, onClose, onUse }: Props) {
  const [pageIndex, setPageIndex] = useState(0);

  // 翻书动画状态
  // flip: 'none' | 'next' | 'prev'
  // phase: 'pre' 前半（纸尚未转过 90°，正面朝外） | 'post' 后半（纸已转过 90°，背面朝外）
  // 当 flip !== 'none' 时，表示正在进行翻书动画，此时锁定输入
  const [flip, setFlip] = useState<'none' | 'next' | 'prev'>('none');
  const [phase, setPhase] = useState<'pre' | 'post'>('pre');
  const flipTimer = useRef<number | null>(null);
  const halfTimer = useRef<number | null>(null);

  const FLIP_DURATION = 720; // ms —— 翻书动画总时长

  // 模板切换 / 打开时，重置到第 1 页
  useEffect(() => {
    setPageIndex(0);
    setFlip('none');
    setPhase('pre');
  }, [template?.id]);

  // 示例照片 & 示例页面
  const { samplePhotos, previewPages } = useMemo(() => buildSample(template), [template?.id]);

  // ---- 翻页触发（会播放真实翻书动画） ----
  const startFlip = (dir: 'next' | 'prev', commit: () => void) => {
    if (flip !== 'none') return;
    setFlip(dir);
    setPhase('pre');
    if (halfTimer.current) window.clearTimeout(halfTimer.current);
    if (flipTimer.current) window.clearTimeout(flipTimer.current);
    // 动画过半（纸已竖起超过 90°，正面完全背向观众）时切换静态层
    halfTimer.current = window.setTimeout(() => {
      setPhase('post');
    }, FLIP_DURATION / 2);
    // 动画结束：提交页码、收尾
    flipTimer.current = window.setTimeout(() => {
      commit();
      setFlip('none');
      setPhase('pre');
    }, FLIP_DURATION);
  };

  // 书本模式下一次翻页跨越 2 页（真实书本对翻）
  const step = 2;
  const goNext = () => {
    if (pageIndex >= previewPages.length - 1) return;
    startFlip('next', () => {
      setPageIndex((i) => Math.min(i + step, previewPages.length - 1));
    });
  };
  const goPrev = () => {
    if (pageIndex <= 0) return;
    startFlip('prev', () => {
      setPageIndex((i) => Math.max(i - step, 0));
    });
  };
  const goTo = (i: number) => {
    if (flip !== 'none') return;
    if (i === pageIndex) return;
    // 点页码直接跳转，不播翻书动画（否则体验很奇怪）
    // 需要对齐到合法的"对开右页索引"：0（封面）或奇数
    const aligned = i === 0 ? 0 : i % 2 === 1 ? i : i - 1;
    setPageIndex(aligned);
  };

  // ESC 关闭 + 左右翻页
  useEffect(() => {
    if (!template) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    // 锁定背景滚动
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, pageIndex, previewPages.length, flip]);

  // 打开时对齐 pageIndex 到合法的"对开右页索引"：0（封面）或奇数
  useEffect(() => {
    if (!template) return;
    if (pageIndex > 0 && pageIndex % 2 === 0) {
      setPageIndex(pageIndex - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  // 关闭弹窗时清理计时器
  useEffect(() => {
    if (!template) {
      if (flipTimer.current) {
        window.clearTimeout(flipTimer.current);
        flipTimer.current = null;
      }
      if (halfTimer.current) {
        window.clearTimeout(halfTimer.current);
        halfTimer.current = null;
      }
      setFlip('none');
      setPhase('pre');
    }
  }, [template]);

  useEffect(() => {
    return () => {
      if (flipTimer.current) window.clearTimeout(flipTimer.current);
      if (halfTimer.current) window.clearTimeout(halfTimer.current);
    };
  }, []);

  if (!template) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex p-0 bg-black/70 backdrop-blur-sm animate-[fadeIn_.2s_ease]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`模板预览：${template.name}`}
    >
      <div
        className="relative bg-white shadow-2xl flex flex-col overflow-hidden w-full h-full rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部：标题区（紧凑） */}
        <header className="flex items-center justify-between gap-4 px-6 py-2.5 border-b border-black/5 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display text-lg font-bold truncate">{template.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                {template.category}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  template.isFree
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {template.isFree ? '免费' : 'VIP'}
              </span>
              <span className="hidden sm:inline text-xs text-neutral-500 ml-1 truncate">
                {template.description}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900 transition text-xl leading-none"
              aria-label="关闭预览"
              title="关闭 (ESC)"
            >
              ×
            </button>
          </div>
        </header>

        {/* 主体：铺满的双页书本预览区
            布局：书本占据绝大部分空间（flex-1），下方放紧凑的单行控件条。
            关键：BookStage 自己测量容器宽高并按 3:2 比例夹到不溢出，用户无需滚动。 */}
        <div
          className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 sm:px-6 pt-3 pb-2"
          style={{ background: template.colors.bg }}
        >
          {/* 书本舞台：独占剩余高度 */}
          <div className="flex-1 min-h-0 w-full">
            <BookStage
              pages={previewPages}
              pageIndex={pageIndex}
              photos={samplePhotos}
              template={template}
              flip={flip}
              phase={phase}
              flipDuration={FLIP_DURATION}
              onPrev={goPrev}
              onNext={goNext}
            />
          </div>

          {/* 单行控件条（紧凑） */}
          <div className="shrink-0 mt-2 flex items-center justify-center gap-3 w-full">
            <button
              onClick={goPrev}
              disabled={pageIndex === 0 || flip !== 'none'}
              className="shrink-0 w-8 h-8 rounded-full bg-white/90 shadow border border-black/5 disabled:opacity-40 hover:bg-white transition text-sm"
              aria-label="上一页"
            >
              ‹
            </button>
            <div className="flex flex-wrap gap-1 justify-center max-w-[70%]">
              {previewPages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`第 ${i + 1} 页`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === pageIndex || (pageIndex > 0 && i === pageIndex - 1)
                      ? 'w-5 bg-neutral-900'
                      : 'w-1.5 bg-neutral-400/60 hover:bg-neutral-500/80'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={goNext}
              disabled={pageIndex >= previewPages.length - 1 || flip !== 'none'}
              className="shrink-0 w-8 h-8 rounded-full bg-white/90 shadow border border-black/5 disabled:opacity-40 hover:bg-white transition text-sm"
              aria-label="下一页"
            >
              ›
            </button>
            <span className="hidden md:inline text-[11px] text-neutral-600/80 ml-2 whitespace-nowrap">
              {pageIndex + 1} / {previewPages.length} · 点击左右翻页
            </span>
          </div>
        </div>

        {/* 底部：操作区 */}
        <footer className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3 border-t border-black/5 bg-white shrink-0">
          <div className="text-xs text-neutral-500 text-center sm:text-left">
            使用该模板后，照片会按你上传的内容重新排版，字体、配色、装饰与预览一致。
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-sm transition"
            >
              再看看
            </button>
            <button
              onClick={() => onUse(template)}
              className="px-5 py-2 rounded-full bg-neutral-900 text-white hover:opacity-90 text-sm shadow-lg shadow-rose/20 transition"
            >
              使用此模板 →
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————
// BookStage：双页书本 + 翻书动画（真实双页对翻）
//
// 真实书本的物理模型：
//   一本书的纸张是双面印刷的：第 N 张纸正面印第 (2N-1) 页、背面印第 2N 页（以内容页起算）。
//   因此打开书看到的"对开页"是一张纸的背面（左）+ 下一张纸的正面（右）。
//   翻一张纸 = 页码跨越 2 页（例如从看 P2-P3 变成看 P4-P5）。
//
// 本产品映射（把 pageIndex 当作"当前打开时的右页索引"）：
//   - pageIndex=0 是封面：单页居中展示，不放入对翻
//   - pageIndex>=1 时：
//       左页 = pages[pageIndex - 1]（若 pageIndex=1，则是封面内页——这里用空白卡纸代替）
//       右页 = pages[pageIndex]
//       新的对开（下一次翻页后） = pages[pageIndex+1] 作左页，pages[pageIndex+2] 作右页
//
// 翻"下一页"（next）的视觉流程：
//   翻动的纸 = 当前右页所在那张纸。它绕脊线从右翻到左。
//     纸正面（翻动前朝观众）= 当前 rightPage = pages[pageIndex]
//     纸背面（翻完后朝观众）= 新左页 = pages[pageIndex+1]
//   左右静态层：
//     pre 阶段：左=leftPage、右=rightPage（翻动纸正面覆盖右侧；左侧不变）
//     post 阶段：左=pages[pageIndex+1]（新左页，也是翻动纸的背面）
//                右=pages[pageIndex+2]（新右页，原本压在翻动纸之下，翻纸离开后显露）
//   动画结束：提交 pageIndex += 2
//
// 翻"上一页"（prev）的视觉流程（对称）：
//   翻动的纸 = 当前左页所在那张纸，绕脊线从左翻到右。
//     纸正面 = 当前 leftPage = pages[pageIndex-1]
//     纸背面 = 新右页 = pages[pageIndex-2]
//   静态层：
//     pre：左=leftPage、右=rightPage
//     post：左=pages[pageIndex-3]（新左页，原本压在翻动纸之下）
//           右=pages[pageIndex-2]（新右页，也是翻动纸的背面）
//   动画结束：提交 pageIndex -= 2
//
// 封面单页展示（pageIndex=0）：
//   左空白、右=封面。按"下一页"时从封面直接翻到 pages[1]-pages[2] 对开。
//   此时翻动纸 正面=pages[0]（封面） 背面=pages[1]。
// ————————————————————————————————————————————————————————————
interface BookStageProps {
  pages: BookPage[];
  pageIndex: number;
  photos: Photo[];
  template: Template;
  flip: 'none' | 'next' | 'prev';
  phase: 'pre' | 'post';
  flipDuration: number;
  onPrev: () => void;
  onNext: () => void;
}

function BookStage({
  pages,
  pageIndex,
  photos,
  template,
  flip,
  phase,
  flipDuration,
  onPrev,
  onNext,
}: BookStageProps) {
  const isCover = pageIndex === 0;

  // —— 容器测量：根据可用宽高按 3:2（双页书本）比例夹紧，
  //    既不超过父级宽度，也不超过父级高度，用户无需滚动就能看到完整书本。
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const aw = rect.width;
      const ah = rect.height;
      if (aw <= 0 || ah <= 0) return;
      // 双页书本宽高比 = 3:2（每页 3:4，两页并排 → 6:4 = 3:2）
      const RATIO = 3 / 2;
      let w = aw;
      let h = w / RATIO;
      if (h > ah) {
        h = ah;
        w = h * RATIO;
      }
      // 留一点内边距，避免贴到父级边缘
      const pad = 0.98;
      setSize({ w: Math.floor(w * pad), h: Math.floor(h * pad) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // 当前对开页
  const leftPage: BookPage | null = isCover ? null : pages[pageIndex - 1] ?? null;
  const rightPage: BookPage | null = pages[pageIndex] ?? null;

  // 下一次对开（翻 next 后）
  //   从封面(0)翻到下一对开：左=pages[1]，右=pages[2]
  //   从普通对开(i)翻到下一对开：左=pages[i+1]，右=pages[i+2]
  const nextLeft: BookPage | null = pages[pageIndex + 1] ?? null;
  const nextRight: BookPage | null = pages[pageIndex + 2] ?? null;

  // 上一次对开（翻 prev 后）
  //   从普通对开(i)翻到上一对开：左=pages[i-3]，右=pages[i-2]
  //   pageIndex 可能回到 0（封面）：此时左=null（书皮内侧），右=pages[0]（封面）
  const prevWillBeCover = pageIndex - 2 <= 0;
  const prevLeft: BookPage | null = prevWillBeCover
    ? null
    : pages[pageIndex - 3] ?? null;
  const prevRight: BookPage | null = prevWillBeCover
    ? pages[0] ?? null
    : pages[pageIndex - 2] ?? null;

  // ---- 根据翻页阶段，决定左右静态层应该显示什么 ----
  let leftStatic: BookPage | null = leftPage;
  let rightStatic: BookPage | null = rightPage;
  if (flip === 'next' && phase === 'post') {
    leftStatic = nextLeft;
    rightStatic = nextRight;
  } else if (flip === 'prev' && phase === 'post') {
    leftStatic = prevLeft;
    rightStatic = prevRight;
  }

  const book = (node: BookPage | null) => {
    if (!node) {
      // 书皮内侧：空白卡纸质感
      return (
        <div
          className="w-full h-full"
          style={{
            background:
              'linear-gradient(135deg, #f6f1e6 0%, #ece4d1 100%)',
          }}
        />
      );
    }
    return <PageView page={node} photos={photos} template={template} babyName="小满" dateRange="2024.03 – 2024.12" />;
  };

  return (
    <div
      ref={stageRef}
      className="w-full h-full flex items-center justify-center select-none"
    >
      <div
        className="relative"
        style={{
          width: size ? `${size.w}px` : '100%',
          height: size ? `${size.h}px` : '100%',
          // 没测量出来前先隐藏，避免闪一下超出的状态
          visibility: size ? 'visible' : 'hidden',
          perspective: '2400px',
        }}
      >
        {/* 整本书的阴影底 */}
        <div className="absolute inset-0 rounded-md shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] pointer-events-none" />

        {/*
          预热层：把"下一对开"和"上一对开"的页面提前挂载到 DOM，
          让浏览器提前完成图片解码/渲染。
          注意：不能使用 visibility:hidden —— 那样浏览器会跳过 paint/decode，
          起不到预热效果。改为把整个预热层 translate 移出可视区，
          浏览器仍会完整执行布局/paint/图片 decode，点击翻页时立刻就位。
        */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: 'translate3d(-300vw, 0, 0)',
            zIndex: 0,
          }}
        >
          <div className="absolute top-0 left-0 h-full w-1/2 overflow-hidden">
            {book(nextLeft)}
          </div>
          <div className="absolute top-0 right-0 h-full w-1/2 overflow-hidden">
            {book(nextRight)}
          </div>
          <div className="absolute top-0 left-0 h-full w-1/2 overflow-hidden">
            {book(prevLeft)}
          </div>
          <div className="absolute top-0 right-0 h-full w-1/2 overflow-hidden">
            {book(prevRight)}
          </div>
        </div>

        {/* 左页（静态） */}
        <div
          className="absolute top-0 left-0 h-full w-1/2 overflow-hidden bg-white"
          style={{
            boxShadow: 'inset -4px 0 10px -8px rgba(0,0,0,0.12)',
          }}
        >
          {book(leftStatic)}
        </div>

        {/* 右页（静态） */}
        <div
          className="absolute top-0 right-0 h-full w-1/2 overflow-hidden bg-white"
          style={{
            boxShadow: 'inset 4px 0 10px -8px rgba(0,0,0,0.12)',
          }}
        >
          {book(rightStatic)}
        </div>

        {/* 中缝（书脊阴影）—— 柔化为极淡的纸张折痕感，避免一条突兀黑条 */}
        <div
          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-4 pointer-events-none"
          style={{
            background:
              'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.06) 45%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.06) 55%, rgba(0,0,0,0) 100%)',
            mixBlendMode: 'multiply',
            zIndex: 5,
          }}
        />

        {/* 翻动的那一页 —— 宽度为一半，绕脊线旋转 180°
            翻 next：纸在右半区，正面=rightPage、背面=nextLeft
            翻 prev：纸在左半区，正面=leftPage、背面=prevRight
        */}
        {flip === 'next' && (
          <div
            className="absolute top-0 right-0 h-full w-1/2"
            style={{ perspective: '2400px', zIndex: 30 }}
          >
            <FlippingLeaf
              side="right"
              duration={flipDuration}
              front={book(rightPage)}
              back={book(nextLeft)}
            />
          </div>
        )}
        {flip === 'prev' && (
          <div
            className="absolute top-0 left-0 h-full w-1/2"
            style={{ perspective: '2400px', zIndex: 30 }}
          >
            <FlippingLeaf
              side="left"
              duration={flipDuration}
              front={book(leftPage)}
              back={book(prevRight)}
            />
          </div>
        )}

        {/* 左右两半点击热区（触发翻页） */}
        <button
          className="absolute top-0 left-0 h-full w-1/2 cursor-w-resize focus:outline-none"
          onClick={onPrev}
          disabled={pageIndex === 0 || flip !== 'none'}
          aria-label="上一页"
          style={{ background: 'transparent', zIndex: 40 }}
        />
        <button
          className="absolute top-0 right-0 h-full w-1/2 cursor-e-resize focus:outline-none"
          onClick={onNext}
          disabled={pageIndex >= pages.length - 1 || flip !== 'none'}
          aria-label="下一页"
          style={{ background: 'transparent', zIndex: 40 }}
        />
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————
// FlippingLeaf：一张正在翻动的纸
//   side='right' —— 绕左边缘（脊部）向左翻（next）
//   side='left'  —— 绕右边缘（脊部）向右翻（prev）
//   front = 翻动前的正面；back = 翻完露出的新页面
//   动画时长 duration ms 内从 0° → ±180°
// ————————————————————————————————————————————————————————————
interface FlippingLeafProps {
  side: 'left' | 'right';
  duration: number;
  front: React.ReactNode;
  back: React.ReactNode;
}

function FlippingLeaf({ side, duration, front, back }: FlippingLeafProps) {
  // 用 ref/class 名触发一次性的 CSS keyframe 动画（避免 state 开销）
  const animName = side === 'right' ? 'bb-flip-next' : 'bb-flip-prev';
  // transformOrigin：
  //   next：绕左边缘翻转，origin = 'left center'
  //   prev：绕右边缘翻转，origin = 'right center'
  const origin = side === 'right' ? 'left center' : 'right center';

  return (
    <div
      className="absolute inset-0"
      style={{
        transformStyle: 'preserve-3d',
        transformOrigin: origin,
        animation: `${animName} ${duration}ms cubic-bezier(0.45, 0.05, 0.2, 1) forwards`,
        willChange: 'transform',
        zIndex: 20,
      }}
    >
      {/* 正面 */}
      <div
        className="absolute inset-0 overflow-hidden bg-white"
        style={{
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          boxShadow:
            side === 'right'
              ? 'inset 4px 0 10px -8px rgba(0,0,0,0.12)'
              : 'inset -4px 0 10px -8px rgba(0,0,0,0.12)',
        }}
      >
        {front}
        {/* 翻动时的明暗渐变高光（跟随动画的静态叠层，已能模拟卷纸感） */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              side === 'right'
                ? 'linear-gradient(to right, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 30%, rgba(255,255,255,0) 70%)'
                : 'linear-gradient(to left, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 30%, rgba(255,255,255,0) 70%)',
            animation: `bb-flip-shade-front ${duration}ms ease-in-out forwards`,
          }}
        />
      </div>

      {/* 背面（翻到 90° 后露出） */}
      <div
        className="absolute inset-0 overflow-hidden bg-white"
        style={{
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          boxShadow:
            side === 'right'
              ? 'inset -4px 0 10px -8px rgba(0,0,0,0.12)'
              : 'inset 4px 0 10px -8px rgba(0,0,0,0.12)',
        }}
      >
        {back}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              side === 'right'
                ? 'linear-gradient(to left, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 30%, rgba(255,255,255,0) 70%)'
                : 'linear-gradient(to right, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.05) 30%, rgba(255,255,255,0) 70%)',
            animation: `bb-flip-shade-back ${duration}ms ease-in-out forwards`,
          }}
        />
      </div>
    </div>
  );
}

// ———————————————————————————————————————————————
// 示例数据：完整 20+ 页示例画册，涵盖全部版式交错穿插
// 使用内嵌 SVG 宝宝插画（SAMPLE_PHOTOS），100% 离线可用，不会因网络失败变空白
// ———————————————————————————————————————————————
function buildSample(template: Template | null): {
  samplePhotos: Photo[];
  previewPages: BookPage[];
} {
  if (!template) return { samplePhotos: [], previewPages: [] };

  // 复用全局 12 张宝宝题材示例插画 + 该模板专属封面图
  const coverPhoto = getCoverPhotoForTemplate(template.id);
  const samplePhotos: Photo[] = [coverPhoto, ...SAMPLE_PHOTOS];

  const allIds = samplePhotos.map((p) => p.id);
  // pick 专指内容页（跳过封面专属图），索引从 1 开始映射到 SAMPLE_PHOTOS
  const pick = (indices: number[]) =>
    indices.map((i) => allIds[(i % SAMPLE_PHOTOS.length) + 1]);

  // 22 页示例画册：封面 + 5 章节（每章 3-4 页混合版式）+ 尾页
  // 规则：相邻页 layout 尽量不重复
  const previewPages: BookPage[] = [
    // —— 封面（使用模板专属封面图）
    {
      id: 'pv-cover',
      layout: 'cover',
      photoIds: [coverPhoto.id],
      title: template.defaultTitle,
      subtitle: template.defaultSubtitle,
    },

    // ====== 第一章：初见 ======
    {
      id: 'pv-ch1',
      layout: 'text',
      photoIds: [],
      title: '第一章 · 初见',
      caption: '你像一颗小星星，悄悄地落进了我们的生活。',
    },
    {
      id: 'pv-1-1',
      layout: 'single',
      photoIds: pick([0]),
      caption: '第一声啼哭，是世上最动听的旋律。',
    },
    {
      id: 'pv-1-2',
      layout: 'single-portrait',
      photoIds: pick([1]),
      caption: '小小的手，轻轻握住了我们的心。',
    },
    {
      id: 'pv-1-3',
      layout: 'double',
      photoIds: pick([2, 3]),
      caption: '初来乍到，请多指教。',
    },

    // ====== 第二章：日常 ======
    {
      id: 'pv-ch2',
      layout: 'text',
      photoIds: [],
      title: '第二章 · 日常',
      caption: '每一个平凡的日子，都因你而闪闪发光。',
    },
    {
      id: 'pv-2-1',
      layout: 'triple',
      photoIds: pick([4, 5, 6]),
      caption: '吃、笑、睡 —— 你的三件大事。',
    },
    {
      id: 'pv-2-2',
      layout: 'single',
      photoIds: pick([7]),
      caption: '阳光正好，你也刚刚好。',
    },
    {
      id: 'pv-2-3',
      layout: 'grid4',
      photoIds: pick([0, 4, 7, 10]),
      caption: '一天四个样，每一面都可爱。',
    },

    // ====== 第三章：成长 ======
    {
      id: 'pv-ch3',
      layout: 'text',
      photoIds: [],
      title: '第三章 · 成长',
      caption: '长得慢一点呀，让我把你多看几眼。',
    },
    {
      id: 'pv-3-1',
      layout: 'single-portrait',
      photoIds: pick([8]),
      caption: '今天又学会了一个新本领。',
    },
    {
      id: 'pv-3-2',
      layout: 'double',
      photoIds: pick([9, 10]),
      caption: '坐起来了，站起来了，走起来了。',
    },
    {
      id: 'pv-3-3',
      layout: 'single',
      photoIds: pick([11]),
      caption: '小小的你，装着大大的世界。',
    },

    // ====== 第四章：笑与泪 ======
    {
      id: 'pv-ch4',
      layout: 'text',
      photoIds: [],
      title: '第四章 · 笑与泪',
      caption: '你的每一种表情，我们都想珍藏。',
    },
    {
      id: 'pv-4-1',
      layout: 'triple',
      photoIds: pick([2, 5, 9]),
      caption: '开心、委屈、又开心 —— 就是小孩子。',
    },
    {
      id: 'pv-4-2',
      layout: 'single',
      photoIds: pick([3]),
      caption: '你笑起来的样子，是这个世界最动人的风景。',
    },
    {
      id: 'pv-4-3',
      layout: 'single-portrait',
      photoIds: pick([6]),
      caption: '眼泪擦干，我们继续向前跑。',
    },

    // ====== 第五章：一起 ======
    {
      id: 'pv-ch5',
      layout: 'text',
      photoIds: [],
      title: '第五章 · 一起',
      caption: '所有的节日、旅途、晚安，都因你有了意义。',
    },
    {
      id: 'pv-5-1',
      layout: 'grid4',
      photoIds: pick([1, 3, 6, 8]),
      caption: '四季流转，有你相伴。',
    },
    {
      id: 'pv-5-2',
      layout: 'double',
      photoIds: pick([11, 0]),
      caption: '牵着你的手，慢慢走。',
    },
    {
      id: 'pv-5-3',
      layout: 'single',
      photoIds: pick([7]),
      caption: '谢谢你，让我们成为了父母。',
    },

    // —— 尾页
    {
      id: 'pv-ending',
      layout: 'ending',
      photoIds: [],
      title: '致我最爱的宝贝',
      caption: '愿你被世界温柔以待，也愿你眼里总有光 —— 这本画册，是我们给你的第一封情书。',
    },
  ];

  return { samplePhotos, previewPages };
}
