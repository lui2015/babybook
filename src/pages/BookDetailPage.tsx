import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useNavigate, useParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { getBook, saveBook, deleteBook } from '../storage';
import { useTemplateRegistry } from '../TemplateRegistry';
import { PageView } from '../components/PageView';
import { BookFlip } from '../components/BookFlip';
import { PageTextEditor } from '../components/PageTextEditor';
import { exportBookToPdf } from '../exportPdf';
import type { Book, BookPage } from '../types';

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getTemplate } = useTemplateRegistry();
  const [book, setBook] = useState<Book | null>(null);
  const [index, setIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  // 防抖落库定时器
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    getBook(id).then((b) => {
      if (!b) {
        alert('画册不存在');
        navigate('/my');
        return;
      }
      setBook(b);
    });
  }, [id, navigate]);

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

  // 组件卸载时，若还有未落库的改动，立即 flush
  useEffect(() => {
    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  if (!book) {
    return <div className="py-20 text-center text-neutral-500">加载中…</div>;
  }
  const template = getTemplate(book.templateId);
  if (!template) {
    return <div className="py-20 text-center text-rose-600">模板不存在</div>;
  }

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

  /**
   * 更新画册：先本地 state 即时刷新（UI 立刻变），再 600ms 防抖落 IndexedDB
   * 文字编辑是高频操作（逐字敲），不能每次输入都写 IDB。
   */
  function updateBookLocal(next: Book) {
    setBook(next);
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveBook(next).catch((e) => console.error('save book failed', e));
      saveTimerRef.current = null;
    }, 600);
  }

  /** 编辑器：更新当前页文字字段 */
  function handlePageChange(patch: Partial<Pick<BookPage, 'title' | 'subtitle' | 'caption'>>) {
    if (!book) return;
    const nextPages = book.pages.map((p, i) => (i === index ? { ...p, ...patch } : p));
    updateBookLocal({ ...book, pages: nextPages, updatedAt: Date.now() });
  }

  /** 编辑器：更新画册级元数据 */
  function handleBookMetaChange(patch: Partial<{ title: string; babyName: string; dateRange: string }>) {
    if (!book) return;
    updateBookLocal({ ...book, ...patch, updatedAt: Date.now() });
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
      downloadDataUrl(url, `${book!.title}-第${index + 1}页.png`);
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
      root.style.background = template!.colors.bg;
      container.appendChild(root);

      const pagesEl: HTMLElement[] = [];
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
            template={template!}
            babyName={book!.babyName}
            dateRange={book!.dateRange}
          />,
        );
        pagesEl.push(el);
      });

      await new Promise((r) => setTimeout(r, 800));
      const canvas = await html2canvas(root, {
        backgroundColor: template!.colors.bg,
        scale: 1.5,
        useCORS: true,
      });
      document.body.removeChild(container);
      const url = canvas.toDataURL('image/png');
      downloadDataUrl(url, `${book!.title}-长图.png`);
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
    try {
      await exportBookToPdf(book!, template!, (done, t) => {
        setExportHint(`正在生成 PDF（${done}/${t}）…`);
      });
    } catch (e) {
      console.error(e);
      alert('PDF 生成失败，请重试');
    } finally {
      setExporting(false);
      setExportHint(null);
    }
  }

  function printBook() {
    // 触发浏览器打印。打印样式在下方 <style> 里定义：
    //  - 隐藏工具栏/箭头/缩略图等 UI，只保留画册页；
    //  - 每页一页 A4，自动分页；
    //  - 画册页按 3:4 等比填满 A4 版心居中。
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
    <div className="mx-auto max-w-6xl px-4 py-6 book-detail-root">
      {/* 打印专用样式（仅打印时生效） */}
      <style>{PRINT_CSS}</style>

      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap no-print">
        <div>
          <h1 className="font-display text-2xl font-bold">{book.title}</h1>
          <div className="text-xs text-neutral-500">
            {template.name} · {total} 页 · 创建于 {formatDate(book.createdAt)}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ToolBtn onClick={renameBook}>重命名</ToolBtn>
          <ToolBtn onClick={() => setEditorOpen(true)}>编辑文字</ToolBtn>
          <ToolBtn onClick={shareBook}>分享</ToolBtn>
          <ToolBtn onClick={exportCurrentPage} disabled={exporting}>
            保存当前页
          </ToolBtn>
          <ToolBtn onClick={exportLongImage} disabled={exporting}>
            导出长图
          </ToolBtn>
          <ToolBtn onClick={exportPdf} disabled={exporting} primary>
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

      {/* 主视图（使用共用翻页组件） */}
      <div
        className="no-print"
        onDoubleClick={() => setEditorOpen(true)}
        title="双击可编辑当前页文字"
      >
        <BookFlip
          book={book}
          template={template}
          index={index}
          onIndexChange={setIndex}
          stageRef={pageRef}
          minStageHeight="60vh"
        />
      </div>
      <div className="text-center text-xs text-neutral-400 mt-1 no-print">
        提示：双击画面或点击上方「编辑文字」可修改每页的标题与配文
      </div>

      {/* 文字编辑抽屉 */}
      <PageTextEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        page={book.pages[index]}
        template={template}
        bookTitle={book.title}
        babyName={book.babyName}
        dateRange={book.dateRange}
        pageNumber={index + 1}
        totalPages={total}
        onPageChange={handlePageChange}
        onBookMetaChange={handleBookMetaChange}
      />

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
      className={`px-3 py-1.5 rounded-full text-sm border transition ${cls} disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function downloadDataUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
