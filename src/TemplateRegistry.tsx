// 模板注册表 Context
// - 统一对外暴露「内置 + 用户自定义」全部模板
// - 其它页面（TemplatesPage、CreatePage、BookDetailPage、MyBooksPage）
//   通过 useAllTemplates() 读取，无需关心模板来自哪里
// - 自定义模板变化后（新增/编辑/删除），调用 refresh() 重新加载
// - 登录态变化时（拿到云端身份 / 切账号 / 退出），自动重新拉取
//   并在首次拿到云端身份时把本地遗留模板静默迁移到云端

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Template } from './types';
import { TEMPLATES as BUILTIN_TEMPLATES } from './templates';
import {
  hasLocalTemplates,
  listUserTemplates,
  migrateLocalTemplatesToCloud,
  type UserTemplate,
} from './userTemplates';
import { useAuth } from './AuthContext';

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
  const { user, loading: authLoading } = useAuth();
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  // 已经为某个 uid 完成过本地→云端的迁移检测，避免反复触发
  const migratedUidRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await listUserTemplates();
    setUserTemplates(list);
  }, []);

  // 登录态拿到 uid 后再首刷；同时在首次进入云端身份时静默迁移本地遗留模板
  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    (async () => {
      // 当前已登录（含匿名云端身份）：检查是否有本地遗留模板需要迁
      if (user?.uid && migratedUidRef.current !== user.uid) {
        migratedUidRef.current = user.uid;
        try {
          if (await hasLocalTemplates()) {
            await migrateLocalTemplatesToCloud();
          }
        } catch (err) {
          // 迁移失败不阻塞列表加载，下次登录会再尝试
          console.warn('[TemplateRegistry] migrate failed', err);
        }
      }
      if (!cancelled) {
        await refresh();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.uid, refresh]);

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
