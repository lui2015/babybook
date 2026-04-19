import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useNavigate, useParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { getBook, saveBook, deleteBook } from '../storage';
import { getTemplateById } from '../templates';
import { PageView } from '../components/PageView';
import type { Book } from '../types';

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [index, setIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

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
    const urls = Array.from(
      new Set(book.photos.map((p) => p.src).filter(Boolean)),
    );
    urls.forEach((src) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      // 主动解码（若失败静默忽略）
      if (img.decode) img.decode().catch(() => {});
    });
  }, [book]);

  if (!book) {
    return <div className="py-20 text-center text-neutral-500">加载中…</div>;
  }
  const template = getTemplateById(book.templateId);
  if (!template) {
    return <div className="py-20 text-center text-rose-600">模板不存在</div>;
  }

  const total = book.pages.length;

  function go(delta: number) {
    setIndex((i) => Math.max(0, Math.min(total - 1, i + delta)));
  }

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
    // 只截取当前激活的那一页（pageRef 内有多页预渲染）
    const target = pageRef.current.querySelector<HTMLElement>('[data-active="true"]') ?? pageRef.current;
    setExporting(true);
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
    }
  }

  async function exportLongImage() {
    setExporting(true);
    try {
      // 临时渲染所有页
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

      // 使用 React 动态渲染每一页
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

      // 等图片/字体加载
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
    }
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
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold">{book.title}</h1>
          <div className="text-xs text-neutral-500">
            {template.name} · {total} 页 · 创建于 {formatDate(book.createdAt)}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ToolBtn onClick={renameBook}>重命名</ToolBtn>
          <ToolBtn onClick={shareBook}>分享</ToolBtn>
          <ToolBtn onClick={exportCurrentPage} disabled={exporting}>
            {exporting ? '导出中…' : '保存当前页'}
          </ToolBtn>
          <ToolBtn onClick={exportLongImage} disabled={exporting}>
            导出长图
          </ToolBtn>
          <ToolBtn onClick={removeBook} danger>
            删除
          </ToolBtn>
        </div>
      </div>

      {/* 主视图 */}
      <div
        className="rounded-3xl p-6 sm:p-10 flex items-center justify-center min-h-[60vh]"
        style={{ background: template.colors.bg }}
      >
        <div className="flex items-center gap-4 w-full">
          <NavArrow onClick={() => go(-1)} disabled={index === 0} dir="left" />
          <div className="flex-1 max-w-md mx-auto" ref={pageRef}>
            {/*
              全量堆叠预渲染：
              - 所有页一开始就挂载，并保持在屏内同一位置叠放。
              - 非当前页 opacity:0（仅当前页 opacity:1），切换时用纯 opacity 过渡
                （无 scale / blur / translate，避免"跳动"错觉）。
              - 由于所有页都以主视图的大尺寸存在于 DOM 中，浏览器在首次布局时
                就会按大尺寸对图片完成 decode + 光栅化，翻页切换只是改 opacity，
                合成器直接拿现成位图上屏，视觉上稳定、不抖动。
              - 注意不使用 overflow:hidden（避免 containment 优化）。
            */}
            <div className="relative aspect-[3/4] w-full">
              {book.pages.map((p, i) => {
                const isActive = i === index;
                return (
                  <div
                    key={p.id}
                    data-active={isActive ? 'true' : 'false'}
                    aria-hidden={!isActive}
                    className="absolute inset-0"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transition: 'opacity 260ms ease-out',
                      pointerEvents: isActive ? 'auto' : 'none',
                      zIndex: isActive ? 2 : 1,
                      // 关键：即使 opacity:0，也保留在布局中，图片已按大尺寸解码
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
              onClick={() => setIndex(i)}
              className={`flex-shrink-0 w-16 aspect-[3/4] rounded overflow-hidden border-2 transition ${
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

function ToolBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-full text-sm border transition ${
        danger
          ? 'border-rose/30 text-rose hover:bg-rose/5'
          : 'border-neutral-200 text-neutral-700 hover:border-neutral-400 bg-white'
      } disabled:opacity-40`}
    >
      {children}
    </button>
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
      className="w-10 h-10 rounded-full bg-white/70 backdrop-blur border border-white hover:bg-white disabled:opacity-30 transition flex-shrink-0 text-xl"
    >
      {dir === 'left' ? '‹' : '›'}
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
