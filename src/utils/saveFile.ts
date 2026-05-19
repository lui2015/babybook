/**
 * 跨端文件保存工具。
 *
 * 背景：
 *   - 桌面浏览器：`<a download>` + Blob URL 工作良好。
 *   - iOS Safari：忽略 download 属性，会"在当前页打开 PDF"，看起来像下载失败。
 *   - 微信 / QQ / 企业微信 WebView：禁用 <a download>，点击无反应。
 *   - 安卓 Chrome：基本 OK，但部分 WebView 偏弱。
 *
 * 策略（移动端）：
 *   1) 优先 Web Share API（navigator.canShare({ files })）→ 系统级"存到文件 / 发送 / 保存到相册"
 *   2) Fallback：新窗口打开 Blob URL（让浏览器走原生 PDF / 图片预览，用户长按或右上角"···"保存）
 *   3) 微信 WebView：直接提示外部浏览器打开（它对 a.download 和大部分 Blob URL 行为不可控）
 */

export type SaveFileResult =
  | { kind: 'downloaded' }      // 桌面：a.download 已触发
  | { kind: 'shared' }          // 移动：用户走了系统分享
  | { kind: 'opened-new-tab' }  // 移动：新窗口打开了 Blob，等用户手动保存
  | { kind: 'wechat-blocked' }  // 微信内置 WebView，需用户外部浏览器打开
  | { kind: 'failed'; reason: string };

export interface SaveFileOptions {
  blob: Blob;
  filename: string;
  /** 弹给用户的提示函数；不传则不提示。 */
  notify?: (msg: string) => void;
}

const isClient = typeof window !== 'undefined';

/** 是否手机/平板（按 UA + 触摸 + 屏宽综合判断，不强依赖单一指标）。 */
export function isMobileLike(): boolean {
  if (!isClient) return false;
  const ua = navigator.userAgent || '';
  // 常见移动端 UA 关键字
  if (/Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(ua)) return true;
  // iPad 在 iPadOS 13+ 默认伪装成 macOS Safari，靠触屏点数兜底
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  // 兜底：窄屏 + 触屏
  if (window.innerWidth < 820 && 'ontouchstart' in window) return true;
  return false;
}

/** 是否在微信 / 企业微信 / QQ 内置浏览器里。 */
export function isWeChatLike(): boolean {
  if (!isClient) return false;
  const ua = navigator.userAgent || '';
  return /MicroMessenger|WeChat|wxwork|QQ\//i.test(ua);
}

/**
 * 保存（或让用户保存）一个文件。
 * 函数总是 resolve，不抛错；可以从返回结果里读到具体路径。
 */
export async function saveFile(opts: SaveFileOptions): Promise<SaveFileResult> {
  const { blob, filename, notify } = opts;

  // ---------- 桌面端：直接走传统下载 ----------
  if (!isMobileLike()) {
    try {
      triggerAnchorDownload(blob, filename);
      return { kind: 'downloaded' };
    } catch (e) {
      // 桌面也偶发失败（极少数浏览器扩展拦截），fallback 新开窗口
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { kind: 'opened-new-tab', ...({ reason: String(e) } as object) } as SaveFileResult;
    }
  }

  // ---------- 微信 / 企业微信 / QQ 内置 WebView：直接提示 ----------
  if (isWeChatLike()) {
    notify?.('当前为微信/QQ 内置浏览器，无法直接下载。请点击右上角「···」选择「在浏览器打开」后再下载。');
    return { kind: 'wechat-blocked' };
  }

  // ---------- 移动端：优先 Web Share API ----------
  // 注意：必须通过 File（不是 Blob）才能触发文件分享面板；
  //       且必须在用户手势同步链路里调用——本函数始终从用户点击触发，所以 OK。
  try {
    // 类型层面 navigator.canShare 不在所有 lib.dom 里，这里 any 处理
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    };
    if (nav.share && nav.canShare) {
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: filename });
        return { kind: 'shared' };
      }
    }
  } catch (e) {
    // 用户取消分享会走到这里——也当作"用户已经处理"，不再退回新窗口，避免重复弹出
    const msg = String(e);
    if (/abort|cancel/i.test(msg)) return { kind: 'shared' };
    // 真异常则继续走 fallback
    console.warn('[saveFile] Web Share 失败，回退新窗口：', e);
  }

  // ---------- Fallback：新窗口打开 Blob，让用户在原生预览里手动保存 ----------
  try {
    const url = URL.createObjectURL(blob);
    // 在新标签里打开；浏览器会走原生 PDF / 图片预览
    const w = window.open(url, '_blank');
    // 部分 iOS 弹窗拦截会返回 null：那就当前页跳转
    if (!w) {
      window.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    notify?.(
      '文件已在新页面打开。' +
        (isIOS()
          ? '请点击右上角「分享」→「存储到文件」即可保存。'
          : '请点击页面右上角菜单选择「下载」/「保存」。'),
    );
    return { kind: 'opened-new-tab' };
  } catch (e) {
    notify?.('保存失败，请稍后重试或在浏览器中打开本页面。');
    return { kind: 'failed', reason: String(e) };
  }
}

function triggerAnchorDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

function isIOS(): boolean {
  if (!isClient) return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ 伪装成 Mac
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

/** 把 dataURL（如 canvas.toDataURL 的结果）转成 Blob。 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/.exec(dataUrl);
  if (!m) throw new Error('Invalid data URL');
  const mime = m[1] || 'application/octet-stream';
  const isBase64 = !!m[2];
  const data = m[3];
  if (isBase64) {
    const binary = atob(data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(data)], { type: mime });
}
