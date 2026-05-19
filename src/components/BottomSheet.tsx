import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * 通用底部抽屉（移动端）。
 *
 * 设计要点：
 * - 通过 React Portal 渲染到 document.body，彻底脱离父级 stacking context（避免被 sticky header / Hero 覆盖）。
 * - 高度自适应内容，最大不超过 85dvh，溢出时内部滚动。
 * - 打开时锁住 body 滚动，关闭时恢复。
 * - 支持 Esc / 点遮罩 关闭。
 * - 适配安全区（bottom inset）。
 *
 * 仅在小屏（<768px）使用，桌面端不调用此组件即可。
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  /** 顶部右上角的额外操作（如「重置」按钮）。可选 */
  headerExtra,
  /** 抽屉最大高度，默认 85dvh。某些场景（如「页面缩略图」）希望更高 */
  maxHeight = '85dvh',
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  maxHeight?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const overlay = (
    <>
      {/* 遮罩 */}
      <div
        className={`fixed inset-0 z-[110] transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={onClose}
        aria-hidden={!open}
      />
      {/* 抽屉本体：从底部滑出 */}
      <div
        className={`fixed left-0 right-0 bottom-0 z-[111] flex flex-col rounded-t-2xl shadow-2xl transition-transform bb-safe-bottom ${
          open ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
        style={{
          background: 'var(--bb-surface-strong, #fff)',
          color: 'var(--bb-fg, #111)',
          maxHeight,
          // 让 transition 平滑
          transitionDuration: '220ms',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        {/* 顶部 grabber */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <span className="block w-10 h-1 rounded-full bg-neutral-300" />
        </div>
        {(title || headerExtra) && (
          <div
            className="shrink-0 px-4 pb-2 flex items-center gap-3 border-b"
            style={{ borderColor: 'var(--bb-border, rgba(0,0,0,0.06))' }}
          >
            <div className="font-display font-bold text-base flex-1 truncate">
              {title}
            </div>
            <div className="flex items-center gap-2">{headerExtra}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100"
            >
              ✕
            </button>
          </div>
        )}
        {/* 内容（自滚动） */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
}
