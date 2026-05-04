import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { PageView } from './components/PageView';
import type { Book, Template } from './types';

/**
 * 将整本画册导出为多页 PDF（贴近印刷质量）。
 *
 * 过往问题（已修复）：
 *  - 离屏分辨率仅 720×960 × scale 2 ≈ 1440×1920，A4 打印仅 ~175 DPI，照片偏糊。
 *  - JPEG 0.92 + jsPDF 'FAST' 压缩会破坏背景渐变/阴影。
 *  - html2canvas 对 SVG mask-image / backdrop-filter / radial-gradient / repeating-linear-gradient
 *    支持有缺陷，导致圆形/心形等照片形状、装饰背景、半透明卡片"背景没了"。
 *
 * 现方案：
 *  - 保持离屏 720×960 的 CSS 渲染尺寸（与屏幕预览一致，字号/间距视觉效果不跑偏）；
 *    截图时用 pixelRatio=3 采样 → 2160×2880，对 210×280mm 版心约 260 DPI，印刷清晰度足够。
 *  - 优先用 html-to-image（`toPng`），它直接走 foreignObject + SVG，保留现代 CSS 细节更好：
 *    SVG mask（圆形/心形/星形照片）、radial/repeating linear gradient（水彩背景、胶片齿孔）、
 *    backdrop-filter / 阴影等都能稳住；失败时 fallback 到 html2canvas（scale=3）。
 *  - PNG + jsPDF 'NONE' 压缩，最大限度保质（代价是 PDF 更大，但印刷场景值得）。
 *  - PDF 页面按画册 3:4 比例 210×280mm 自定义，不再强塞 A4 留大片白边。
 */
export async function exportBookToPdf(
  book: Book,
  template: Template,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  // ———— 1. 离屏挂载容器 ————
  // 保持与预览一致的 CSS 尺寸；真正决定清晰度的是后面的 pixelRatio=3。
  const RENDER_W = 720;
  const RENDER_H = 960;
  const PIXEL_RATIO = 3;

  const host = document.createElement('div');
  host.setAttribute('data-pdf-export-host', '');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = `${RENDER_W}px`;
  host.style.pointerEvents = 'none';
  // 防止外部 body/root 的 transform / filter 对截图造成位移
  host.style.transform = 'none';
  host.style.filter = 'none';
  document.body.appendChild(host);

  const pageEls: HTMLElement[] = [];
  const roots: ReturnType<typeof createRoot>[] = [];
  book.pages.forEach((p) => {
    const el = document.createElement('div');
    el.style.width = `${RENDER_W}px`;
    el.style.height = `${RENDER_H}px`;
    el.style.marginBottom = '4px';
    // 保证背景色不透明，避免截图时透出页面底色
    el.style.background = template.colors.paper;
    host.appendChild(el);
    const r = createRoot(el);
    r.render(
      <PageView
        page={p}
        photos={book.photos}
        template={template}
        babyName={book.babyName}
        dateRange={book.dateRange}
        width={RENDER_W}
        height={RENDER_H}
        photoFrameColor={book.theme?.photoFrameColor ?? null}
      />,
    );
    pageEls.push(el);
    roots.push(r);
  });

  // 等 React 渲染 + 字体 ready + 图片 decode
  await new Promise((r) => setTimeout(r, 300));
  try {
    // Safari 下偶尔无此属性，兜底 no-op
    await (document as Document & { fonts?: { ready: Promise<void> } }).fonts?.ready;
  } catch {
    /* ignore */
  }
  await waitForImages(host);
  // 多等一帧，让样式/layout 稳定
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  // ———— 2. 准备 3:4 版心 PDF（贴合画册比例，不强塞 A4） ————
  // 物理尺寸 210×280mm：宽度同 A4，四周无多余白边，印刷装订更利落。
  const PDF_W = 210;
  const PDF_H = 280;
  const pdf = new jsPDF({ unit: 'mm', format: [PDF_W, PDF_H], orientation: 'portrait' });

  try {
    for (let i = 0; i < pageEls.length; i++) {
      const el = pageEls[i];
      const imgData = await snapshotElement(el, template.colors.paper, PIXEL_RATIO);
      if (i > 0) pdf.addPage([PDF_W, PDF_H], 'portrait');
      // 整页铺满：PNG + NONE 压缩，避免 jsPDF 再做一次有损编码
      pdf.addImage(imgData, 'PNG', 0, 0, PDF_W, PDF_H, undefined, 'NONE');
      onProgress?.(i + 1, pageEls.length);
    }

    pdf.save(`${book.title}.pdf`);
  } finally {
    // 清理 React 根 + DOM
    roots.forEach((r) => r.unmount());
    document.body.removeChild(host);
  }
}

/**
 * 把一个 DOM 节点转成高分辨率 PNG dataURL。
 * 首选 html-to-image（对现代 CSS / SVG mask 支持更好），
 * 失败时退回 html2canvas，双保险。
 */
async function snapshotElement(el: HTMLElement, bg: string, pixelRatio: number): Promise<string> {
  // 尝试 html-to-image（更高保真）
  try {
    const dataUrl = await toPng(el, {
      pixelRatio,
      cacheBust: true,
      backgroundColor: bg,
      skipFonts: false,
    });
    // 粗检：dataUrl 长度过短一般意味着渲染失败
    if (dataUrl && dataUrl.length > 2000) return dataUrl;
    throw new Error('html-to-image returned too-small data URL');
  } catch (e) {
    // fallback：html2canvas
    console.warn('[exportPdf] html-to-image failed, fallback to html2canvas:', e);
    const canvas = await html2canvas(el, {
      backgroundColor: bg,
      scale: pixelRatio,
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: el.offsetWidth,
      windowHeight: el.offsetHeight,
    });
    return canvas.toDataURL('image/png');
  }
}

/** 等待容器内所有 <img> 加载完成（成功或失败都算完）+ decode。 */
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
  await Promise.all(
    imgs.map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve())),
  );
}
