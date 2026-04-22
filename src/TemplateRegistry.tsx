// 模板注册表 Context
// - 统一对外暴露「内置 + 用户自定义」全部模板
// - 其它页面（TemplatesPage、CreatePage、BookDetailPage、MyBooksPage）
//   通过 useAllTemplates() 读取，无需关心模板来自哪里
// - 自定义模板变化后（新增/编辑/删除），调用 refresh() 重新加载

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Template } from './types';
import { TEMPLATES as BUILTIN_TEMPLATES } from './templates';
import { listUserTemplates, type UserTemplate } from './userTemplates';

interface TemplateRegistryValue {
  /** 内置模板（只读） */
  builtinTemplates: Template[];
  /** 用户自定义模板（按 updatedAt 倒序） */
  userTemplates: UserTemplate[];
  /** 内置 + 自定义 合并后的全部模板（用户模板排在前面） */
  allTemplates: Template[];
  /** 通过 id 获取模板（内置优先，找不到再查用户模板） */
  getTemplate: (id: string) => Template | undefined;
  /** 用户模板列表变化后主动刷新 */
  refresh: () => Promise<void>;
}

const Ctx = createContext<TemplateRegistryValue | null>(null);

export function TemplateRegistryProvider({ children }: { children: ReactNode }) {
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);

  const refresh = useCallback(async () => {
    const list = await listUserTemplates();
    setUserTemplates(list);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<TemplateRegistryValue>(() => {
    const all: Template[] = [...userTemplates, ...BUILTIN_TEMPLATES];
    const byId = new Map<string, Template>();
    all.forEach((t) => byId.set(t.id, t));
    return {
      builtinTemplates: BUILTIN_TEMPLATES,
      userTemplates,
      allTemplates: all,
      getTemplate: (id: string) => byId.get(id),
      refresh,
    };
  }, [userTemplates, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTemplateRegistry(): TemplateRegistryValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      'useTemplateRegistry must be used within <TemplateRegistryProvider>',
    );
  }
  return v;
}
