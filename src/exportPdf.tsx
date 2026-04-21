import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { PageView } from './components/PageView';
import type { Book, Template } from './types';

/**
 * 将整本画册导出为多页 PDF（可直接用于打印）。
 *
 * 实现要点：
 *  - 每一页画册按 720×960px（3:4）离屏渲染成 HTMLElement；
 *  - html2canvas 以 scale=2 截成高清位图（相当于 300 DPI 左右）；
 *  - jsPDF 使用 A4 纵向 (210×297 mm)，每页画册等比缩放并居中；
 *  - 首页自动使用模板的 bg 颜色作为页边底色（打印观感更整体）。
 */
export async function exportBookToPdf(
  book: Book,
  template: Template,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  // ———— 1. 离屏挂载容器 ————
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = '720px';
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);

  const pageEls: HTMLElement[] = [];
  const roots: ReturnType<typeof createRoot>[] = [];
  book.pages.forEach((p) => {
    const el = document.createElement('div');
    el.style.width = '720px';
    el.style.height = '960px';
    el.style.marginBottom = '4px';
    host.appendChild(el);
    const r = createRoot(el);
    r.render(
      <PageView
        page={p}
        photos={book.photos}
        template={template}
        babyName={book.babyName}
        dateRange={book.dateRange}
        width={720}
        height={960}
      />,
    );
    pageEls.push(el);
    roots.push(r);
  });

  // 等 React 渲染 + 图片/字体 decode
  await new Promise((r) => setTimeout(r, 600));
  await waitForImages(host);

  // ———— 2. 准备 A4 纵向 PDF ————
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const A4_W = 210;
  const A4_H = 297;
  // 画册页 3:4 等比适配到 A4 版心（两侧留 12mm 边距）
  const margin = 12;
  const maxW = A4_W - margin * 2; // 186
  const maxH = A4_H - margin * 2; // 273
  // 3:4 → 186 宽时高 = 248；仍 < 273，采用宽优先
  const drawW = maxW;
  const drawH = drawW * (4 / 3); // 248
  const offsetX = margin;
  const offsetY = (A4_H - drawH) / 2;

  try {
    for (let i = 0; i < pageEls.length; i++) {
      const el = pageEls[i];
      const canvas = await html2canvas(el, {
        backgroundColor: template.colors.paper,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage();
      // A4 默认白底；画册页自身带背景色（相当于贴在白纸中央），印刷更通用
      pdf.addImage(imgData, 'JPEG', offsetX, offsetY, drawW, drawH, undefined, 'FAST');
      onProgress?.(i + 1, pageEls.length);
    }

    pdf.save(`${book.title}.pdf`);
  } finally {
    // 清理 React 根 + DOM
    roots.forEach((r) => r.unmount());
    document.body.removeChild(host);
  }
}

/** 等待容器内所有 <img> 加载完成（成功或失败都算完） */
async function waitForImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    }),
  );
  // 主动 decode（若失败忽略）
  await Promise.all(
    imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())),
  );
}
