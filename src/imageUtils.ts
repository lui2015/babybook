import type { Photo } from './types';

const uid = () => Math.random().toString(36).slice(2, 10);

/** 读取一张图片为 Photo（含宽高比），并缩放到最大 1600px 的 JPEG dataURL 以节省存储 */
export async function fileToPhoto(file: File, maxEdge = 1600): Promise<Photo> {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);
  const { width, height } = img;

  // 缩放
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, targetW, targetH);
  const compressed = canvas.toDataURL('image/jpeg', 0.85);

  return {
    id: uid(),
    src: compressed,
    width: targetW,
    height: targetH,
    ratio: targetW / targetH,
    takenAt: file.lastModified,
  };
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 批量处理，限制并发避免卡顿 */
export async function filesToPhotos(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<Photo[]> {
  const photos: Photo[] = [];
  const concurrency = 3;
  let idx = 0;

  async function worker() {
    while (idx < files.length) {
      const i = idx++;
      try {
        const photo = await fileToPhoto(files[i]);
        photos[i] = photo;
      } catch (e) {
        console.warn('图片处理失败', files[i].name, e);
      }
      onProgress?.(photos.filter(Boolean).length, files.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return photos.filter(Boolean);
}
