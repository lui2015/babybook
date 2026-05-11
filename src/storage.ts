// 画册存储层（双后端：本地 IndexedDB / 云端 CloudBase）
// ----------------------------------------------------------------
// 策略：
//   - 未登录：保持原行为，画册存到 IndexedDB（idb-keyval），照片以 base64 内嵌
//   - 已登录：画册 JSON 存 NoSQL `books` 集合；照片上传到云存储，
//             JSON 里只保留 fileID；读取时再换临时 URL（短期缓存）
//   - 兼容性：上层调用 saveBook/getBook/deleteBook/listBooks 完全无感
//
// 安全规则：`books` 集合已设为 PRIVATE（仅创建者本人可读写），
//   云端按 `_openid` 自动隔离。
// ----------------------------------------------------------------
import { get, set, del, keys } from 'idb-keyval';
import type { Book, Photo } from './types';
import { cbApp, cbAuth, cbDb } from './cloudbase';

const BOOK_PREFIX = 'babybook:';
const COLLECTION = 'books';

// =============================================================
// 工具：判断当前是否已具备"云端身份"
// 当前应用走匿名登录方案：只要 SDK 已建立任何 session（含匿名）就视为已登录，
// 数据写到云端，由后端 _openid 自动按浏览器/会话隔离。
// =============================================================
async function isLoggedIn(): Promise<boolean> {
  try {
    // SDK 类型定义滞后；运行时返回 { uid, loginType, ... }
    const state = (await cbAuth.getLoginState()) as any;
    return !!state && !!state.uid;
  } catch {
    return false;
  }
}

// =============================================================
// 本地后端（IndexedDB），保留原实现，未登录用户继续用
// =============================================================
async function localSave(book: Book): Promise<void> {
  await set(BOOK_PREFIX + book.id, book);
}
async function localGet(id: string): Promise<Book | undefined> {
  return (await get(BOOK_PREFIX + id)) as Book | undefined;
}
async function localDel(id: string): Promise<void> {
  await del(BOOK_PREFIX + id);
}
async function localList(): Promise<Book[]> {
  const allKeys = await keys();
  const bookKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(BOOK_PREFIX),
  ) as string[];
  const books = await Promise.all(bookKeys.map((k) => get(k) as Promise<Book>));
  return books.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
}

// 显式给本地版本起别名供"双轨/迁移"使用
export const localStore = {
  save: localSave,
  get: localGet,
  del: localDel,
  list: localList,
};

// =============================================================
// 云端后端：照片上传 + 画册 JSON 存 NoSQL
// =============================================================

// 是 cloud:// 协议的 fileID（普通布尔，避免 TS 在"!isCloudFileId(...)" 时把变量收窄成 never）
function isCloudFileId(s: string | undefined | null): boolean {
  return !!s && typeof s === 'string' && s.startsWith('cloud://');
}

// 类型守卫版：仅在需要把 (string | undefined) narrow 成 string 时使用
function isCloudFileIdGuard(s: string | undefined | null): s is string {
  return !!s && typeof s === 'string' && s.startsWith('cloud://');
}

// 是 base64 dataURL（来自本地上传/SVG）
function isDataURL(s: string | undefined | null): boolean {
  return !!s && typeof s === 'string' && s.startsWith('data:');
}

// dataURL 的 mime 推断扩展名
function extFromMime(mime: string): string {
  if (!mime) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('svg')) return 'svg';
  return 'jpg';
}

// 把 dataURL 转 Blob（再转 File 才能给 SDK 上传）
function dataURLtoFile(dataURL: string, filename: string): File {
  const [meta, b64] = dataURL.split(',');
  const mimeMatch = meta.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binStr = atob(b64);
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = binStr.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

/**
 * 临时 URL 缓存（避免每次渲染都拉一遍）。
 * 注意：CloudBase 临时 URL 默认有效期较长，但仍会过期，所以本地缓存设上限。
 */
const tmpUrlCache = new Map<string, { url: string; expireAt: number }>();
const TMP_URL_TTL_MS = 30 * 60 * 1000; // 30 分钟，远小于云端默认 2 小时

/** 批量获取/缓存 fileID -> 临时 URL */
async function resolveTempUrls(fileIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const need: string[] = [];
  for (const fid of fileIds) {
    const hit = tmpUrlCache.get(fid);
    if (hit && hit.expireAt > now) {
      out.set(fid, hit.url);
    } else {
      need.push(fid);
    }
  }
  if (need.length === 0) return out;
  // 分批：单次最多 50 个
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    try {
      const res = await cbApp.getTempFileURL({
        fileList: batch.map((fileID) => ({ fileID, maxAge: 7200 })),
      });
      const list = (res as any)?.fileList ?? [];
      for (const item of list) {
        const fid = item.fileID;
        const url = item.tempFileURL || item.download_url || item.tempUrl;
        if (fid && url) {
          tmpUrlCache.set(fid, { url, expireAt: now + TMP_URL_TTL_MS });
          out.set(fid, url);
        }
      }
    } catch (err) {
      console.warn('[storage] getTempFileURL failed', err);
    }
  }
  return out;
}

/**
 * 把 Book 中所有照片的 src（如果是 base64）上传到云存储，
 * 替换为 cloud://... 形式；已是 fileID 的保持不变；
 * 内置 SVG dataURL 太小（<60KB）也保留为 dataURL（节省请求开销）。
 */
async function uploadBookPhotos(book: Book, uid: string): Promise<Book> {
  const SIZE_KEEP_INLINE = 60 * 1024; // 60KB 以下保留内嵌（SVG 等小图）
  const newPhotos: Photo[] = [];
  for (const p of book.photos) {
    const src = p.src;
    if (!isDataURL(src) || isCloudFileId(src)) {
      // 已经是 fileID 或 http(s) 链接，原样保留
      newPhotos.push(p);
      continue;
    }
    // dataURL：判断大小
    const approxBytes = Math.floor(
      (src.length - src.indexOf(',') - 1) * 0.75,
    );
    if (approxBytes < SIZE_KEEP_INLINE) {
      newPhotos.push(p);
      continue;
    }
    try {
      const mimeMatch = src.match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const ext = extFromMime(mime);
      const cloudPath = `users/${uid}/photos/${book.id}/${p.id}.${ext}`;
      const file = dataURLtoFile(src, `${p.id}.${ext}`);
      const upload = await cbApp.uploadFile({
        cloudPath,
        filePath: file as any, // Web SDK 接受 File
      });
      const fileID = (upload as any)?.fileID;
      if (fileID) {
        newPhotos.push({ ...p, src: fileID });
      } else {
        // 上传失败兜底：保留原 dataURL
        newPhotos.push(p);
      }
    } catch (err) {
      console.warn('[storage] photo upload failed, keep inline', p.id, err);
      newPhotos.push(p);
    }
  }
  return { ...book, photos: newPhotos };
}

/** 读取后把 photos 里的 fileID 换成临时 URL（仅在内存中替换，不回写云端） */
async function hydrateBookPhotoUrls(book: Book): Promise<Book> {
  const fileIds = book.photos
    .map((p) => p.src)
    .filter(isCloudFileIdGuard);
  if (fileIds.length === 0) return book;
  const map = await resolveTempUrls(fileIds);
  return {
    ...book,
    photos: book.photos.map((p) => {
      if (!isCloudFileId(p.src)) return p;
      const url = map.get(p.src);
      // 注意：把 src 临时换成可用 URL，但保留原 fileID 在 srcCloud（可选）以便回写
      return url ? { ...p, src: url, srcCloud: p.src } as Photo : p;
    }),
  };
}

/**
 * 在写入云端前，把 photo.srcCloud（fileID 备份）还原回 src。
 * 这样可以避免把"临时 URL"当成 src 写回数据库。
 */
function dehydrateBookPhotoUrls(book: Book): Book {
  return {
    ...book,
    photos: book.photos.map((p) => {
      const srcCloud = (p as any).srcCloud as string | undefined;
      if (srcCloud) {
        const { srcCloud: _omit, ...rest } = p as any;
        return { ...rest, src: srcCloud } as Photo;
      }
      return p;
    }),
  };
}

// 云端 CRUD ----------------------------------------------------

async function cloudSave(book: Book): Promise<void> {
  const state = (await cbAuth.getLoginState()) as any;
  if (!state?.uid) throw new Error('未登录，无法保存到云端');
  // 1) 上传新照片
  const baked = dehydrateBookPhotoUrls(book);
  const uploaded = await uploadBookPhotos(baked, state.uid);
  uploaded.updatedAt = Date.now();

  // 2) 写库：先查后存（按业务 id 而非 _id 检索）
  const existing = await cbDb
    .collection(COLLECTION)
    .where({ bookId: uploaded.id })
    .limit(1)
    .get();
  const docs = (existing as any)?.data ?? [];
  if (docs.length === 0) {
    await cbDb.collection(COLLECTION).add({
      bookId: uploaded.id,
      data: uploaded,
      updatedAt: uploaded.updatedAt,
      createdAt: uploaded.createdAt,
    });
  } else {
    const _id = docs[0]._id;
    await cbDb
      .collection(COLLECTION)
      .doc(_id)
      .update({
        data: uploaded,
        updatedAt: uploaded.updatedAt,
      });
  }
}

async function cloudGet(id: string): Promise<Book | undefined> {
  const res = await cbDb
    .collection(COLLECTION)
    .where({ bookId: id })
    .limit(1)
    .get();
  const docs = (res as any)?.data ?? [];
  if (docs.length === 0) return undefined;
  const book = docs[0].data as Book;
  return await hydrateBookPhotoUrls(book);
}

async function cloudDel(id: string): Promise<void> {
  // 先查 _id
  const res = await cbDb
    .collection(COLLECTION)
    .where({ bookId: id })
    .limit(1)
    .get();
  const docs = (res as any)?.data ?? [];
  if (docs.length === 0) return;
  const _id = docs[0]._id;
  // 顺手删除云存储里的相关图（best-effort）
  const book = docs[0].data as Book | undefined;
  const fileIds =
    book?.photos
      ?.map((p) => p.src)
      .filter(isCloudFileIdGuard) ?? [];
  if (fileIds.length > 0) {
    try {
      await cbApp.deleteFile({ fileList: fileIds });
    } catch (err) {
      console.warn('[storage] deleteFile failed', err);
    }
  }
  await cbDb.collection(COLLECTION).doc(_id).remove();
}

async function cloudList(): Promise<Book[]> {
  const res = await cbDb
    .collection(COLLECTION)
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();
  const docs = (res as any)?.data ?? [];
  const books: Book[] = docs.map((d: any) => d.data as Book);
  // 列表页通常只展示封面照（第一张），逐个 hydrate 太重——批量解析
  const allFileIds = new Set<string>();
  for (const b of books) {
    for (const p of b.photos) {
      if (isCloudFileId(p.src)) allFileIds.add(p.src);
    }
  }
  if (allFileIds.size === 0) return books;
  const map = await resolveTempUrls(Array.from(allFileIds));
  return books.map((b) => ({
    ...b,
    photos: b.photos.map((p) =>
      isCloudFileId(p.src) && map.has(p.src)
        ? ({ ...p, src: map.get(p.src)!, srcCloud: p.src } as Photo)
        : p,
    ),
  }));
}

// 显式给云端版本起别名供"双轨/迁移"使用
export const cloudStore = {
  save: cloudSave,
  get: cloudGet,
  del: cloudDel,
  list: cloudList,
};

// =============================================================
// 顶层 API：根据登录态自动路由
// =============================================================
export async function saveBook(book: Book): Promise<void> {
  if (await isLoggedIn()) return cloudSave(book);
  return localSave(book);
}
export async function getBook(id: string): Promise<Book | undefined> {
  if (await isLoggedIn()) return cloudGet(id);
  return localGet(id);
}
export async function deleteBook(id: string): Promise<void> {
  if (await isLoggedIn()) return cloudDel(id);
  return localDel(id);
}
export async function listBooks(): Promise<Book[]> {
  if (await isLoggedIn()) return cloudList();
  return localList();
}

// =============================================================
// 数据迁移：把本地的画册全部上传到云端
// =============================================================
/**
 * 一键把当前浏览器 IndexedDB 里所有画册搬到云端。
 * - 仅在已登录态调用
 * - 不会自动删本地（保留容灾）
 * 返回：实际成功上传的画册数量
 */
export async function migrateLocalBooksToCloud(): Promise<{
  success: number;
  failed: number;
  total: number;
}> {
  const local = await localList();
  let success = 0;
  let failed = 0;
  for (const b of local) {
    try {
      await cloudSave(b);
      success++;
    } catch (err) {
      console.warn('[storage] migrate book failed', b.id, err);
      failed++;
    }
  }
  return { success, failed, total: local.length };
}

/** 是否还有本地遗留画册（用于首次登录提示） */
export async function hasLocalBooks(): Promise<boolean> {
  const list = await localList();
  return list.length > 0;
}
