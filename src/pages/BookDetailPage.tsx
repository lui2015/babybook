import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { getBook, saveBook, deleteBook } from '../storage';
import { useTemplateRegistry } from '../TemplateRegistry';
import { PageView } from '../components/PageView';
import { BookFlip } from '../components/BookFlip';
import { exportBookToPdf } from '../exportPdf';
import { applyBookTheme } from '../bookTheme';
import { saveFile, dataUrlToBlob, isMobileLike } from '../utils/saveFile';
import type { Book } from '../types';

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getTemplate } = useTemplateRegistry();
  const [book, setBook] = useState<Book | null>(null);
  const [index, setIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 是否对画册做 90° 旋转（仅手机伪全屏 + 物理竖屏时为 true）。
  // 画册是 3:2 横向对开，手机原生竖屏直接全屏会很扁，旋转后视觉上变成横屏铺满。
  const [rotateForFullscreen, setRotateForFullscreen] = useState(false);

  // 监听原生全屏状态（处理 ESC 退出 / 浏览器自身退出）
  // 注意：iOS Safari 不支持 Element.requestFullscreen（document.fullscreenElement 永远是 undefined），
  // 这里只能用来同步「桌面 Chrome / 安卓 Chrome」的原生全屏退出。
  useEffect(() => {
    const onChange = () => {
      // 只有从原生全屏退出时才把状态置回 false；进入则由 toggleFullscreen 自己置 true。
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // iOS Safari 伪全屏时，监听 ESC（外接键盘）/ 安卓返回键 popstate 也算退出
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // 进入伪全屏时锁定 body 滚动，退出时解锁
  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  async function toggleFullscreen() {
    const el = fullscreenRef.current;
    if (!el) return;

    // —— 退出 —— //
    if (isFullscreen) {
      // 如果当前在原生全屏里，调用浏览器 API 退出；否则直接关 CSS 伪全屏
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch (e) {
          console.error('exitFullscreen failed', e);
        }
      }
      setIsFullscreen(false);
      setRotateForFullscreen(false);
      return;
    }

    // —— 进入 —— //
    // 旋转条件判定（仅在「进入瞬间」决定一次，后续 orientationchange 会动态再算）：
    //  1) 视口当前是「竖屏」：宽 < 高
    //  2) 是「窄屏 / 触屏设备」：宽度 < 768px（避免桌面竖屏显示器误判）
    const shouldRotate =
      typeof window !== 'undefined' &&
      window.innerWidth < window.innerHeight &&
      window.innerWidth < 768;
    setRotateForFullscreen(shouldRotate);

    // 优先尝试浏览器原生 Fullscreen API（桌面 Chrome / Edge / 安卓 Chrome 都支持）。
    // iOS Safari 上 el.requestFullscreen 是 undefined，直接走 CSS 伪全屏分支。
    const requestFn =
      el.requestFullscreen ||
      // @ts-expect-error - 兼容老 Webkit
      el.webkitRequestFullscreen ||
      // @ts-expect-error - 兼容旧 Edge
      el.msRequestFullscreen;

    if (typeof requestFn === 'function') {
      try {
        await requestFn.call(el, { navigationUI: 'hide' } as FullscreenOptions);
        setIsFullscreen(true);
        return;
      } catch (e) {
        // 被用户拒绝 / 当前文档不允许 → 静默回退 CSS 伪全屏
        console.warn('native fullscreen failed, falling back to css', e);
      }
    }

    // 兜底：CSS 伪全屏（iOS Safari 唯一可用方案）
    setIsFullscreen(true);
  }

  // 全屏过程中用户旋转手机：动态调整 rotate 标志
  // - 用户从竖屏转到横屏：取消旋转（让 orientation 自然铺满）
  // - 用户从横屏转回竖屏（窄屏）：重新启用旋转
  useEffect(() => {
    if (!isFullscreen) return;
    const onResize = () => {
      const shouldRotate =
        window.innerWidth < window.innerHeight && window.innerWidth < 768;
      setRotateForFullscreen(shouldRotate);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [isFullscreen]);

  // 加载画册
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getBook(id).then((b) => {
      if (cancelled) return;
      if (!b) {
        navigate('/my', { replace: true });
        return;
      }
      setBook(b);
    });
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // 旧链接兼容：?edit=1 → 跳转到新的编辑器页面
  useEffect(() => {
    if (!book) return;
    if (searchParams.get('edit') === '1') {
      navigate(`/book/${book.id}/edit`, { replace: true });
    }
  }, [book, searchParams, navigate]);

  // 画册加载后：一次性对全量图片发起 decode，保证任何页的图片都已解码就位
  useEffect(() => {
    if (!book) return;
    const urls = Array.from(new Set(book.photos.map((p) => p.src).filter(Boolean)));
    urls.forEach((src) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      if (img.decode) img.decode().catch(() => {});
    });
  }, [book]);

  if (!book) {
    return <div className="py-20 text-center text-neutral-500">加载中…</div>;
  }
  const rawTemplate = getTemplate(book.templateId);
  if (!rawTemplate) {
    return <div className="py-20 text-center text-rose-600">模板不存在</div>;
  }
  // 应用画册级主题覆盖：颜色 / 字体 / 背景图案
  const template = applyBookTheme(book, rawTemplate);

  const total = book.pages.length;

  async function renameBook() {
    const t = prompt('重命名画册', book!.title);
    if (!t || t === book!.title) return;
    const updated = { ...book!, title: t, updatedAt: Date.now() };
    await saveBook(updated);
    setBook(updated);
  }

  async function removeBook() {
    if (!confirm('确定删除此画册？')) return;
    await deleteBook(book!.id);
    navigate('/my');
  }

  async function exportCurrentPage() {
    if (!pageRef.current) return;
    const target =
      pageRef.current.querySelector<HTMLElement>('[data-active="true"]') ?? pageRef.current;
    setExporting(true);
    setExportHint('正在截取当前页…');
    try {
      const canvas = await html2canvas(target, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });
      const url = canvas.toDataURL('image/png');
      await downloadDataUrl(url, `${book!.title}-第${index + 1}页.png`);
    } finally {
      setExporting(false);
      setExportHint(null);
    }
  }

  async function exportLongImage() {
    setExporting(true);
    setExportHint('正在合成长图…');
    try {
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-99999px';
      container.style.top = '0';
      container.style.width = '480px';
      document.body.appendChild(container);

      const root = document.createElement('div');
      root.style.display = 'flex';
      root.style.flexDirection = 'column';
      root.style.gap = '20px';
      root.style.padding = '20px';
      root.style.background = template.colors.bg;
      container.appendChild(root);

      book!.pages.forEach((p) => {
        const el = document.createElement('div');
        el.style.width = '440px';
        el.style.height = '587px';
        root.appendChild(el);
        const r = createRoot(el);
        r.render(
          <PageView
            page={p}
            photos={book!.photos}
            template={template}
            babyName={book!.babyName}
            dateRange={book!.dateRange}
            photoFrameColor={book!.theme?.photoFrameColor ?? null}
          />,
        );
      });

      await new Promise((r) => setTimeout(r, 800));
      const canvas = await html2canvas(root, {
        backgroundColor: template.colors.bg,
        scale: 1.5,
        useCORS: true,
      });
      document.body.removeChild(container);
      const url = canvas.toDataURL('image/png');
      await downloadDataUrl(url, `${book!.title}-长图.png`);
    } catch (e) {
      console.error(e);
      alert('导出失败，请重试');
    } finally {
      setExporting(false);
      setExportHint(null);
    }
  }

  async function exportPdf() {
    setExporting(true);
    setExportHint(`正在生成 PDF（0/${total}）…`);
    // 移动端：把保存阶段的提示信息延迟到生成完后再 alert，避免遮挡
    let pendingNotice: string | null = null;
    try {
      const result = await exportBookToPdf(
        book!,
        template,
        (done, t) => {
          setExportHint(`正在生成 PDF（${done}/${t}）…`);
        },
        (msg) => {
          // saveFile 给的提示（如"右上角分享 → 存储到文件"）
          pendingNotice = msg;
        },
      );
      // 根据保存结果给出最终反馈
      if (result.kind === 'wechat-blocked') {
        alert(
          '当前为微信/QQ 内置浏览器，无法直接下载 PDF。\n请点击右上角「···」→「在浏览器打开」后再点击下载。',
        );
      } else if (result.kind === 'failed') {
        alert('PDF 保存失败，请稍后重试或在浏览器中打开本页面。');
      } else if (pendingNotice) {
        // 通常是"在新窗口打开了 PDF，请右上角分享 → 存储到文件"
        alert(pendingNotice);
      }
    } catch (e) {
      console.error(e);
      alert('PDF 生成失败，请重试');
    } finally {
      setExporting(false);
      setExportHint(null);
    }
  }

  function printBook() {
    window.print();
  }

  function shareBook() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: book!.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      alert('画册链接已复制到剪贴板');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-4 sm:py-6 book-detail-root">
      {/* 打印专用样式（仅打印时生效） */}
      <style>{PRINT_CSS}</style>
      {/* 全屏预览样式 */}
      <style>{FULLSCREEN_CSS}</style>

      {/* 工具栏：窄屏先标题独占一行，再让按钮组横向滚动；桌面恢复 wrap */}
      <div className="mb-4 sm:mb-5 no-print space-y-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold truncate">{book.title}</h1>
          <div className="text-[11px] sm:text-xs text-neutral-500 truncate">
            {template.name} · {total} 页 · 创建于 {formatDate(book.createdAt)}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto sm:flex-wrap pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:overflow-visible">
          <ToolBtn onClick={renameBook}>重命名</ToolBtn>
          <ToolBtn onClick={() => navigate(`/book/${book!.id}/edit`)} primary>
            ✎ 编辑画册
          </ToolBtn>
          <ToolBtn onClick={shareBook}>分享</ToolBtn>
          <ToolBtn onClick={toggleFullscreen}>
            {isFullscreen ? '退出全屏' : '全屏预览'}
          </ToolBtn>
          <ToolBtn onClick={exportCurrentPage} disabled={exporting}>
            保存当前页
          </ToolBtn>
          <ToolBtn onClick={exportLongImage} disabled={exporting}>
            导出长图
          </ToolBtn>
          <ToolBtn onClick={exportPdf} disabled={exporting}>
            下载 PDF
          </ToolBtn>
          <ToolBtn onClick={printBook} disabled={exporting}>
            打印
          </ToolBtn>
          <ToolBtn onClick={removeBook} danger>
            删除
          </ToolBtn>
        </div>
      </div>

      {/* 导出进度提示 */}
      {exportHint && (
        <div className="mb-4 text-sm text-rose bg-rose/10 border border-rose/30 rounded-xl px-4 py-2 no-print">
          {exportHint}
        </div>
      )}

      {/* 主视图（使用共用翻页组件）—— 同时作为全屏容器 */}
      <div
        ref={fullscreenRef}
        className={`no-print book-stage-wrap ${isFullscreen ? 'is-fullscreen' : ''} ${
          isFullscreen && rotateForFullscreen ? 'is-fullscreen-rotated' : ''
        }`}
        onDoubleClick={() => {
          if (isFullscreen) return; // 全屏下双击不进编辑器，避免误触
          navigate(`/book/${book!.id}/edit`);
        }}
        title={isFullscreen ? '' : '双击进入编辑器'}
      >
        {/* 旋转层：仅在 .is-fullscreen-rotated 下生效；非旋转模式时 .rotate-layer 是恒等变换。
            把 BookFlip 套在这一层里，避免旋转影响外层的退出按钮定位。 */}
        <div className="rotate-layer">
          <BookFlip
            book={book}
            template={template}
            index={index}
            onIndexChange={setIndex}
            stageRef={pageRef}
            minStageHeight="60vh"
            // 旋转模式下，用户视觉上的横向滑对应物理纵向滑，需要把 swipe 轴切到 y。
            swipeAxis={isFullscreen && rotateForFullscreen ? 'y' : 'x'}
          />
        </div>
        {isFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="fs-exit-btn"
            aria-label="退出全屏"
            title="退出全屏（Esc）"
          >
            ✕ 退出全屏
          </button>
        )}
      </div>
      <div className="text-center text-xs text-neutral-400 mt-1 no-print">
        提示：点击上方「编辑画册」或双击画面进入编辑器，可修改文字、排版、配色与字体
      </div>

      {/* 打印专用：所有页顺序平铺（每页一页 A4） */}
      <div className="print-only">
        {book.pages.map((p) => (
          <div key={p.id} className="print-page">
            <div className="print-page-inner">
              <PageView
                page={p}
                photos={book.photos}
                template={template}
                babyName={book.babyName}
                dateRange={book.dateRange}
                photoFrameColor={book.theme?.photoFrameColor ?? null}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  disabled,
  danger,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
}) {
  const cls = primary
    ? 'border-rose bg-rose text-white hover:brightness-105'
    : danger
      ? 'border-rose/30 text-rose hover:bg-rose/5'
      : 'border-neutral-200 text-neutral-700 hover:border-neutral-400 bg-white';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      // 关键点：
      //  1) whitespace-nowrap：避免在窄屏 flex 容器里被「按字断行」压成竖排
      //  2) flex-shrink-0：横向滚动条容器中不被挤压
      //  3) 手机端用更紧凑的 px/py/text-xs，桌面端 sm: 恢复
      className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm border transition ${cls} disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function downloadDataUrl(url: string, filename: string) {
  // 桌面：直接 a.download。
  // 移动端：把 dataURL 转 Blob 走 saveFile（Web Share / 新窗口打开 / 微信提示）。
  if (!isMobileLike()) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    return Promise.resolve();
  }
  return saveDataUrlOnMobile(url, filename);
}

async function saveDataUrlOnMobile(url: string, filename: string): Promise<void> {
  let pendingNotice: string | null = null;
  try {
    const blob = dataUrlToBlob(url);
    const result = await saveFile({
      blob,
      filename,
      notify: (msg) => {
        pendingNotice = msg;
      },
    });
    if (result.kind === 'wechat-blocked') {
      alert(
        '当前为微信/QQ 内置浏览器，无法直接下载图片。\n请点击右上角「···」→「在浏览器打开」后再尝试。',
      );
    } else if (result.kind === 'failed') {
      alert('图片保存失败，请稍后重试。');
    } else if (pendingNotice) {
      alert(pendingNotice);
    }
  } catch (e) {
    console.error(e);
    alert('图片保存失败，请稍后重试。');
  }
}

function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 全屏预览样式：
 *  - 桌面 / 安卓 Chrome：调用浏览器 Fullscreen API（requestFullscreen），由 :fullscreen 伪类生效。
 *  - iOS Safari：Element.requestFullscreen 是 undefined，无法走原生全屏；
 *    走「CSS 伪全屏」回退——给 .book-stage-wrap 加 .is-fullscreen 类，用 position:fixed 把它抬到屏幕顶层。
 *  - 共用部分：max-w-3xl 解除、缩略图条隐藏、页码反白，两种模式都生效。
 */
const FULLSCREEN_CSS = `
.book-stage-wrap { position: relative; }
/* 原生全屏（桌面 Chrome / 安卓 Chrome）：浏览器自动把元素提升到屏幕顶层，
   我们只需要把它撑满 + 涂黑底色 */
.book-stage-wrap:fullscreen {
  width: 100vw;
  height: 100vh;
  background: #000;
  padding: 0;
  overflow: auto;
}
/* iOS Safari 兜底的 CSS 伪全屏：
   iOS 不支持 Element.requestFullscreen，所以我们用 position: fixed 把这个容器抬到屏幕顶层。
   这里同时使用 100vh 和 100dvh：dvh 在支持的浏览器里会自动减去地址栏的高度，避免底部被 iOS UI 遮住。 */
.book-stage-wrap.is-fullscreen:not(:fullscreen) {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: #000;
  padding: 0;
  overflow: auto;
  /* 防止 iOS 上滚动穿透 / 橡皮筋 */
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
/* 注意：不要给 .book-stage-wrap 的直接子 div 强加 width/height/flex，
   因为 BookFlip 根节点内部是「主视图 + 页码 + 缩略图条」三段纵向堆叠，
   一旦外层强行 flex 居中或 100vh，就会把对开页压成一条。
   这里我们只通过 .bookflip-stage 这个对开舞台自己来撑大尺寸。 */

/* —— 全屏下隐藏缩略图条 + 页码（铺满优先，简化 UI） —— //
 * 不论是原生全屏、CSS 伪全屏还是旋转模式，都隐藏缩略图条；
 * 页码会被退出按钮替代信息——保留也意义不大，干脆全屏下隐藏，把所有空间留给画册。 */
.book-stage-wrap:fullscreen [class*="scrollbar-hide"],
.book-stage-wrap.is-fullscreen [class*="scrollbar-hide"] {
  display: none !important;
}
/* 全屏下也隐藏页码（释放高度给画册铺满） */
.book-stage-wrap:fullscreen .bookflip-pageno,
.book-stage-wrap.is-fullscreen .bookflip-pageno {
  display: none !important;
}
/* 全屏下移除 BookFlip 主视图卡片自身的 padding/圆角（避免边距吃掉空间） */
.book-stage-wrap:fullscreen .bookflip-card,
.book-stage-wrap.is-fullscreen .bookflip-card {
  padding: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  min-height: 0 !important;
}

/* 全屏下让翻书舞台按视口尺寸反推宽度，保证对开 3:2 完整可见：
   - 桌面 / 安卓原生全屏（未旋转）：宽度上限 = min(98vw, 视口高度 * 1.5)
   取两者最小值，让画册尽量大同时不溢出 */
.book-stage-wrap:fullscreen .bookflip-stage,
.book-stage-wrap.is-fullscreen:not(.is-fullscreen-rotated) .bookflip-stage {
  max-width: min(98vw, calc(100vh * 1.5)) !important;
  max-width: min(98vw, calc(100dvh * 1.5)) !important;
}

/* —— 手机伪全屏「旋转 90°」模式 —— //
 * iOS Safari 不支持 Screen Orientation lock，所以我们用 CSS transform 把画册旋转 90°，
 * 视觉上变成横屏铺满。
 *
 * 实现要点：
 *  1) 外层 .book-stage-wrap.is-fullscreen 已经是 position:fixed; inset:0; 100vw × 100dvh。
 *  2) 内层 .rotate-layer 自身是 100dvh × 100vw 的"逻辑横屏画布"，
 *     用 transform: rotate(90deg) translate(0, -100vw) + transform-origin: top left
 *     把它旋转到与物理视口对齐。
 *  3) 旋转层内部用 flex 居中 BookFlip，BookFlip 各层都不再有 padding，
 *     '.bookflip-stage' 的 max-width 用 vh/vw（注意：这层内的 vh/vw 仍是物理视口的，
 *     旋转后视觉上对应物理 vh = 旋转层 width，物理 vw = 旋转层 height）。
 *  4) 退出按钮（.fs-exit-btn）不在 .rotate-layer 里，仍然在视觉右上角，不受旋转影响。
 */
.book-stage-wrap.is-fullscreen-rotated {
  /* 容器自身保持 100vw × 100dvh 不变，旋转交给内层处理 */
  overflow: hidden;
}
.book-stage-wrap.is-fullscreen-rotated .rotate-layer {
  position: absolute;
  top: 0;
  left: 0;
  /* 旋转层尺寸 = 旋转后视觉的"宽×高" */
  width: 100vh;       /* 旧浏览器回退 */
  width: 100dvh;
  height: 100vw;
  transform-origin: top left;
  /* 顺时针旋转 90°，再把内容平移回视口（rotate 后 y 变成 -100vw 起点） */
  transform: rotate(90deg) translate(0, -100vw);
  /* 内部用 flex 居中并铺满 */
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
}
/* 旋转层下 BookFlip 根（一个普通的 div，包含 style + 主视图 + 页码 + 缩略图条）：
   - 显式 100% 宽高
   - 用 flex 让主视图卡片('.bookflip-card')居中并占满 */
.book-stage-wrap.is-fullscreen-rotated .rotate-layer > div {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 主视图卡片在旋转模式下：去掉 padding/min-height，撑满旋转层（前面已有通用规则会把
   .bookflip-card 的 padding/bg/min-height 抹平，这里再保证 width/height 铺满） */
.book-stage-wrap.is-fullscreen-rotated .bookflip-card {
  width: 100% !important;
  height: 100% !important;
}
/* 旋转后画册可用宽度 = 物理视口高度（100vh / 100dvh），可用高度 = 物理视口宽度（100vw）。
   3:2 反推：宽度上限 = min(98 * dvh, 100vw * 1.5)。 */
.book-stage-wrap.is-fullscreen-rotated .bookflip-stage {
  max-width: min(98vh, calc(100vw * 1.5)) !important;
  max-width: min(98dvh, calc(100vw * 1.5)) !important;
  /* 同时保证宽度真的撑到上限（默认 max-w-3xl 被覆盖，再加 width: 100%） */
  width: 100% !important;
}
/* 退出全屏按钮（仅在全屏时显示） */
.fs-exit-btn {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483647;
  padding: 8px 14px;
  border-radius: 9999px;
  background: rgba(0,0,0,0.55);
  color: #fff;
  font-size: 13px;
  border: 1px solid rgba(255,255,255,0.25);
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background .15s;
}
.fs-exit-btn:hover { background: rgba(0,0,0,0.75); }
`;

/**
 * 打印样式：
 *  - 默认屏幕下 .print-only 隐藏；.no-print 显示。
 *  - @media print 下反过来：.no-print 隐藏，.print-only 按 A4 纵向每页一页输出。
 *  - 每一页画册按 3:4 等比填满 A4 版心（去除浏览器默认页边，交由打印机/用户在浏览器打印对话框设置）。
 */
const PRINT_CSS = `
.print-only { display: none; }
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  .book-detail-root { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .print-only { display: block; }
  .print-page {
    width: 210mm;
    height: 297mm;
    page-break-after: always;
    break-after: page;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #fff;
  }
  .print-page:last-child { page-break-after: auto; break-after: auto; }
  .print-page-inner {
    /* A4 纵向版心：宽 186mm 时高 248mm (3:4)，两边各留 12mm，上下 24.5mm */
    width: 186mm;
    height: 248mm;
  }
}
`;
