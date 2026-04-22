// 用户自定义模板持久化
// - 存储于 IndexedDB（复用 idb-keyval）
// - key 前缀：babybook:tpl:<id>
// - 自定义模板 id 统一前缀 `tpl_user_`，与内置模板区分
// - 数据结构复用 Template 定义（types.ts），新增 isUser + updatedAt 两个字段

import { get, set, del, keys } from 'idb-keyval';
import type { Template } from './types';

const TPL_PREFIX = 'babybook:tpl:';

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

export async function saveUserTemplate(tpl: UserTemplate): Promise<void> {
  await set(TPL_PREFIX + tpl.id, tpl);
}

export async function getUserTemplate(id: string): Promise<UserTemplate | undefined> {
  return (await get(TPL_PREFIX + id)) as UserTemplate | undefined;
}

export async function deleteUserTemplate(id: string): Promise<void> {
  await del(TPL_PREFIX + id);
}

export async function listUserTemplates(): Promise<UserTemplate[]> {
  const allKeys = await keys();
  const tplKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(TPL_PREFIX),
  ) as string[];
  const list = await Promise.all(tplKeys.map((k) => get(k) as Promise<UserTemplate>));
  return list
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
