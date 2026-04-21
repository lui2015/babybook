import { useEffect, useRef, useState } from 'react';
import type { BookPage, Template } from '../types';

interface Props {
  /** 当前编辑的页（未变化时也要回传同一 id，外部靠 id 定位） */
  page: BookPage;
  template: Template;
  /** 画册级别字段（可在此顺便改） */
  bookTitle: string;
  babyName: string;
  dateRange: string;
  /** 当前页是画册的第几页（1 起） */
  pageNumber: number;
  totalPages: number;
  open: boolean;
  onClose: () => void;
  /** 单字段回调：编辑过程中高频触发，外部自己决定防抖落库策略 */
  onPageChange: (patch: Partial<Pick<BookPage, 'title' | 'subtitle' | 'caption'>>) => void;
  onBookMetaChange: (patch: Partial<{ title: string; babyName: string; dateRange: string }>) => void;
}

/**
 * 画册页文字编辑抽屉：
 * - 按当前页 layout 动态显示可编辑字段（封面/文字页/普通图文页各不同）
 * - 同时支持编辑画册标题/宝宝名/日期（画册级元数据）
 * - 所有输入都是受控组件：onChange -> 向上冒泡 patch，外部统一落库（带防抖）
 * - 移动端底部抽屉、桌面右侧抽屉（通过响应式 className 切换）
 */
export function PageTextEditor({
  page,
  template,
  bookTitle,
  babyName,
  dateRange,
  pageNumber,
  totalPages,
  open,
  onClose,
  onPageChange,
  onBookMetaChange,
}: Props) {
  // 根据 layout 决定展示哪些字段
  const showTitle = page.layout === 'cover' || page.layout === 'text' || page.layout === 'ending';
  const showSubtitle = page.layout === 'cover';
  const showCaption =
    page.layout !== 'cover'; // 除封面外，其它版式都有 caption（图片页：配文；text/ending：正文）

  const captionLabel = (() => {
    if (page.layout === 'text') return '正文';
    if (page.layout === 'ending') return '寄语';
    return '照片配文';
  })();

  // ESC 关闭
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* 遮罩：点击关闭 */}
      <div
        className="fixed inset-0 bg-black/30 z-40 no-print"
        onClick={onClose}
        aria-hidden
      />
      {/* 抽屉 */}
      <div
        ref={panelRef}
        className="fixed z-50 bg-white shadow-2xl border-l border-neutral-200 no-print
          sm:top-0 sm:right-0 sm:h-full sm:w-[360px] sm:rounded-l-2xl
          bottom-0 left-0 right-0 max-h-[82vh] rounded-t-2xl sm:rounded-t-none
          overflow-y-auto animate-slide-in"
        role="dialog"
        aria-label="编辑页面文字"
      >
        {/* 头部 */}
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-5 py-3 flex items-center justify-between">
          <div>
            <div className="font-display font-bold text-base">编辑文字</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              第 {pageNumber} / {totalPages} 页 · {layoutLabel(page.layout)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-neutral-100 text-neutral-500 text-xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 当前页字段 */}
          <section>
            <SectionHeader label="当前页文字" hint="改动实时保存到本地" />

            {showTitle && (
              <Field
                label={page.layout === 'cover' ? '封面标题' : '页面标题'}
                placeholder={template.defaultTitle}
              >
                <input
                  className={inputCls}
                  value={page.title ?? ''}
                  onChange={(e) => onPageChange({ title: e.target.value })}
                  placeholder={template.defaultTitle}
                  maxLength={40}
                />
              </Field>
            )}

            {showSubtitle && (
              <Field label="副标题" placeholder={template.defaultSubtitle}>
                <input
                  className={inputCls}
                  value={page.subtitle ?? ''}
                  onChange={(e) => onPageChange({ subtitle: e.target.value })}
                  placeholder={template.defaultSubtitle}
                  maxLength={60}
                />
              </Field>
            )}

            {showCaption && (
              <Field label={captionLabel}>
                <textarea
                  className={`${inputCls} min-h-[96px] resize-y leading-relaxed`}
                  value={page.caption ?? ''}
                  onChange={(e) => onPageChange({ caption: e.target.value })}
                  placeholder={
                    page.layout === 'text' || page.layout === 'ending'
                      ? '写下这一刻的故事…'
                      : '为这张/这组照片写一句话'
                  }
                  maxLength={page.layout === 'text' || page.layout === 'ending' ? 240 : 120}
                />
              </Field>
            )}

            {!showTitle && !showCaption && (
              <div className="text-xs text-neutral-400 py-6 text-center border border-dashed border-neutral-200 rounded-lg">
                此页暂无可编辑的文字
              </div>
            )}
          </section>

          {/* 画册级元数据 */}
          <section>
            <SectionHeader label="画册信息" hint="对所有页生效" />
            <Field label="画册标题">
              <input
                className={inputCls}
                value={bookTitle}
                onChange={(e) => onBookMetaChange({ title: e.target.value })}
                maxLength={40}
              />
            </Field>
            <Field label="宝宝名">
              <input
                className={inputCls}
                value={babyName}
                onChange={(e) => onBookMetaChange({ babyName: e.target.value })}
                maxLength={20}
              />
            </Field>
            <Field label="日期区间">
              <input
                className={inputCls}
                value={dateRange}
                onChange={(e) => onBookMetaChange({ dateRange: e.target.value })}
                placeholder="如：2024·春"
                maxLength={40}
              />
            </Field>
          </section>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-neutral-100 px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-rose text-white text-sm font-medium hover:brightness-105"
          >
            完成
          </button>
        </div>
      </div>
      <style>{ANIM_CSS}</style>
    </>
  );
}

/* ------------------------------- 小件 ------------------------------- */

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-neutral-800 tracking-wide">{label}</div>
      {hint && <div className="text-[11px] text-neutral-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  placeholder?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block mb-3">
      <div className="text-[11px] text-neutral-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-800 ' +
  'focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/20 transition placeholder:text-neutral-300';

function layoutLabel(layout: BookPage['layout']): string {
  switch (layout) {
    case 'cover':
      return '封面';
    case 'single':
      return '单图';
    case 'single-portrait':
      return '竖图图文';
    case 'double':
      return '双图';
    case 'triple':
      return '三图';
    case 'grid4':
      return '四格';
    case 'text':
      return '文字页';
    case 'ending':
      return '尾页';
  }
}

const ANIM_CSS = `
@keyframes slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
@keyframes slide-in-bottom {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
.animate-slide-in {
  animation: slide-in-bottom 280ms cubic-bezier(0.2, 0.7, 0.2, 1);
}
@media (min-width: 640px) {
  .animate-slide-in {
    animation: slide-in-right 280ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
}
`;
