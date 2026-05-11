// 全局登录态 Context（匿名云端账户方案）
// ----------------------------------------------------------------
// 当前 CloudBase 环境后端不允许纯 username/password 注册（必须邮箱/手机号 + OTP），
// 出于"零摩擦"考虑，本应用统一走 **匿名登录**：
//   - 浏览器首次访问时 SDK 会自动用 publishableKey 拿到一个匿名 session
//   - session 持久化到 localStorage（cbAuth 已配 persistence: 'local'），
//     即同一浏览器后续访问仍是同一个匿名 uid
//   - 数据库写入由后端 _openid 自动隔离，每个浏览器对应独立的云端数据
//
// 因此这里的"已登录"语义改成 = "已经拿到任何 cloudbase session（含匿名）"，
// 上层不再需要登录页。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { cbAuth } from './cloudbase';

/** 当前云端身份（精简） */
export interface AuthUser {
  uid: string;
  /** 展示名（匿名时是 "云端账户" + uid 末 4 位） */
  displayName: string;
  /** 是否匿名会话 */
  isAnonymous: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** 初始化中（首屏判断登录态） */
  loading: boolean;
  /**
   * 是否已绑定云端身份。
   * 匿名方案下：只要拿到任何 session（含匿名）即视为 true，
   * 用于路由 storage 走云端而不是本地 IndexedDB。
   */
  isAuthenticated: boolean;
  /**
   * 重置云端账户：清掉当前匿名 session，重新拿一个新的。
   * 等价于"换一个云端身份"——之前那份云数据不会被删，但当前浏览器再也访问不到。
   */
  resetAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** 把 SDK 内部 user 对象转成精简结构 */
function toAuthUser(uid: string, isAnonymous: boolean): AuthUser {
  // 匿名时给一个稳定的展示名，方便用户辨识
  const tail = uid?.slice(-4) || '0000';
  return {
    uid,
    displayName: isAnonymous ? `云端账户 #${tail}` : `账户 #${tail}`,
    isAnonymous,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const initedRef = useRef(false);

  // 首屏：恢复持久化登录态（拿不到就静默兜底，让 SDK 后续自动建立匿名 session）
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        // SDK 类型定义滞后；运行时返回 { uid, loginType, ... }
        const loginState = (await cbAuth.getLoginState()) as any;
        if (cancelled) return;
        if (loginState && loginState.uid) {
          const isAnon =
            loginState.loginType === 'ANONYMOUS' ||
            loginState.loginType === 'anonymous' ||
            !loginState.loginType;
          setUser(toAuthUser(loginState.uid, isAnon));
        } else {
          setUser(null);
        }
      } catch (err) {
        console.warn('[auth] getLoginState failed', err);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // 状态订阅：登录/登出/token 刷新都会触发
    const sub = (cbAuth as any).onAuthStateChange?.(
      (event: string, session: any) => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          return;
        }
        const raw = session.user;
        if (!raw?.id) return;
        setUser(toAuthUser(raw.id, !!raw.is_anonymous));
      },
    );

    return () => {
      cancelled = true;
      try {
        const anySub: any = sub;
        if (anySub?.data?.subscription?.unsubscribe) {
          anySub.data.subscription.unsubscribe();
        } else if (typeof anySub?.unsubscribe === 'function') {
          anySub.unsubscribe();
        }
      } catch {
        /* ignore */
      }
    };
  }, []);

  /** 重置账户：登出 -> 让 SDK 下次再次拿一个全新的匿名 uid */
  const resetAccount = useCallback(async () => {
    try {
      await cbAuth.signOut();
    } catch (err) {
      console.warn('[auth] signOut failed', err);
    }
    setUser(null);
    // 简单粗暴地刷新整页：让 SDK 在下一次启动时基于 publishableKey 重建匿名 session
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      // 匿名也算"有云端身份" -> storage 走云端
      isAuthenticated: !!user,
      resetAccount,
    }),
    [user, loading, resetAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
