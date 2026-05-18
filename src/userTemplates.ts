// 用户自定义模板持久化（双后端：本地 IndexedDB / 云端 CloudBase）
// ----------------------------------------------------------------
// 与画册存储（storage.ts）保持一致的策略：
//   - 未登录（理论上不会发生：SDK 会自动建立匿名 session）：写本地 IndexedDB
//   - 已登录（含匿名 session）：写云端集合 `userTemplates`
//
// 数据形状：
//   - 文档 = { tplId, data: UserTemplate, createdAt, updatedAt }
//   - tplId 即 UserTemplate.id（业务侧主键），云端按 _openid 自动隔离
//
// 安全：`userTemplates` 集合在 CloudBase 控制台需设为 PRIVATE
//       （仅创建者本人可读写），与 books 集合一致。
// ----------------------------------------------------------------

import { get, set, del, keys } from 'idb-keyval';
import type { Template } from './types';
import { cbAuth, cbDb } from './cloudbase';

const TPL_PREFIX = 'babybook:tpl:';
const COLLECTION = 'userTemplates';

/** 自定义模板在本地存储时追加的元数据 */
export interface UserTemplate extends Template {
  /** 标识该模板是用户创建的（运行时总是 true） */
  isUser: true;
  /** 创建/更新时间（毫秒） */
  createdAt: number;
  updatedAt: number;
}

/** 生成一个唯一的自定义模板 id */
export function createUserTemplateId(): string {
  return `tpl_user_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 是否是用户自定义模板 id */
export function isUserTemplateId(id: string): boolean {
  return id.startsWith('tpl_user_');
}

// =============================================================
// 是否具备"云端身份"——只要 SDK 拿到任何 session（含匿名）即视为已登录
// =============================================================
async function isLoggedIn(): Promise<boolean> {
  try {
    const state = (await cbAuth.getLoginState()) as any;
    return !!state && !!state.uid;
  } catch {
    return false;
  }
}

// =============================================================
// 本地后端（IndexedDB）
// =============================================================
async function localSave(tpl: UserTemplate): Promise<void> {
  await set(TPL_PREFIX + tpl.id, tpl);
}
async function localGet(id: string): Promise<UserTemplate | undefined> {
  return (await get(TPL_PREFIX + id)) as UserTemplate | undefined;
}
async function localDel(id: string): Promise<void> {
  await del(TPL_PREFIX + id);
}
async function localList(): Promise<UserTemplate[]> {
  const allKeys = await keys();
  const tplKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(TPL_PREFIX),
  ) as string[];
  const list = await Promise.all(
    tplKeys.map((k) => get(k) as Promise<UserTemplate>),
  );
  return list.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const localTemplateStore = {
  save: localSave,
  get: localGet,
  del: localDel,
  list: localList,
};

// =============================================================
// 云端后端（NoSQL）
// 模板 JSON 体积较小（无大图，封面通常是 SVG dataURL <60KB），
// 直接整体写入文档；不走云存储。
// =============================================================
async function cloudSave(tpl: UserTemplate): Promise<void> {
  const state = (await cbAuth.getLoginState()) as any;
  if (!state?.uid) throw new Error('未登录，无法保存模板到云端');

  const updatedAt = Date.now();
  const toWrite: UserTemplate = { ...tpl, updatedAt };

  const existing = await cbDb
    .collection(COLLECTION)
    .where({ tplId: toWrite.id })
    .limit(1)
    .get();
  const docs = (existing as any)?.data ?? [];
  if (docs.length === 0) {
    await cbDb.collection(COLLECTION).add({
      tplId: toWrite.id,
      data: toWrite,
      createdAt: toWrite.createdAt,
      updatedAt,
    });
  } else {
    const _id = docs[0]._id;
    await cbDb
      .collection(COLLECTION)
      .doc(_id)
      .update({
        data: toWrite,
        updatedAt,
      });
  }
}

async function cloudGet(id: string): Promise<UserTemplate | undefined> {
  const res = await cbDb
    .collection(COLLECTION)
    .where({ tplId: id })
    .limit(1)
    .get();
  const docs = (res as any)?.data ?? [];
  if (docs.length === 0) return undefined;
  return docs[0].data as UserTemplate;
}

async function cloudDel(id: string): Promise<void> {
  const res = await cbDb
    .collection(COLLECTION)
    .where({ tplId: id })
    .limit(1)
    .get();
  const docs = (res as any)?.data ?? [];
  if (docs.length === 0) return;
  const _id = docs[0]._id;
  await cbDb.collection(COLLECTION).doc(_id).remove();
}

async function cloudList(): Promise<UserTemplate[]> {
  const res = await cbDb
    .collection(COLLECTION)
    .orderBy('updatedAt', 'desc')
    .limit(200)
    .get();
  const docs = (res as any)?.data ?? [];
  return docs
    .map((d: any) => d.data as UserTemplate)
    .filter(Boolean);
}

export const cloudTemplateStore = {
  save: cloudSave,
  get: cloudGet,
  del: cloudDel,
  list: cloudList,
};

// =============================================================
// 顶层 API：根据登录态自动路由
// =============================================================
export async function saveUserTemplate(tpl: UserTemplate): Promise<void> {
  if (await isLoggedIn()) return cloudSave(tpl);
  return localSave(tpl);
}

export async function getUserTemplate(
  id: string,
): Promise<UserTemplate | undefined> {
  if (await isLoggedIn()) {
    // 云端找不到再回退本地，便于"刚登录但还没迁移"的兼容场景
    const cloud = await cloudGet(id);
    if (cloud) return cloud;
    return localGet(id);
  }
  return localGet(id);
}

export async function deleteUserTemplate(id: string): Promise<void> {
  if (await isLoggedIn()) {
    // 同时清掉云端与本地遗留，避免"删了又被本地版本顶回来"
    await cloudDel(id);
    await localDel(id).catch(() => undefined);
    return;
  }
  return localDel(id);
}

export async function listUserTemplates(): Promise<UserTemplate[]> {
  if (await isLoggedIn()) return cloudList();
  return localList();
}

// =============================================================
// 数据迁移：把本地的自定义模板上传到云端
// =============================================================
/**
 * 一键把当前浏览器 IndexedDB 里的所有自定义模板搬到云端。
 * - 仅在已登录态调用
 * - 不会自动删本地（保留容灾，与画册迁移行为一致）
 * 返回：成功 / 失败 / 总数
 */
export async function migrateLocalTemplatesToCloud(): Promise<{
  success: number;
  failed: number;
  total: number;
}> {
  const local = await localList();
  let success = 0;
  let failed = 0;
  for (const t of local) {
    try {
      await cloudSave(t);
      success++;
    } catch (err) {
      console.warn('[userTemplates] migrate failed', t.id, err);
      failed++;
    }
  }
  return { success, failed, total: local.length };
}

/** 是否还有本地遗留自定义模板（用于首次登录提示） */
export async function hasLocalTemplates(): Promise<boolean> {
  const list = await localList();
  return list.length > 0;
}
