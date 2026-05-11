// 全局登录态 Context（匿名 + 用户名/密码混合方案）
// ----------------------------------------------------------------
// 当前 CloudBase 环境开启了 AnonymousLogin + UserNameLogin 两种登录方式。
// 应用的"零摩擦"策略：
//   1) 浏览器首次访问 → SDK 用 publishableKey 自动建立匿名 session（uid_A），
//      用户立刻就能创建画册，画册数据按 _openid 隔离，绑定到 uid_A。
//   2) 用户在「升级为正式账号」里输入用户名+密码 → 调 signUp({ username,
//      password, anonymous_token })，CloudBase 把当前 uid_A 升级为正式账号
//      （**uid 保持不变**），原来匿名时存的画册数据无缝继承。
//   3) 在新设备/新浏览器，用户用「登录已有账号」走
//      signInWithPassword({ username, password })，恢复同一份云端画册。
//
// 所以"已登录"语义有两层：
//   - isAuthenticated: 已经拿到任意 cloudbase session（含匿名）→ storage 走云端
//   - isAnonymous:     该 session 是匿名身份（未升级）→ UI 上提示用户升级
//
// 注：getSession() 在没有真实登录、只有 publishableKey 自动建立的访客 token
// 时会返回 session === undefined，但 cloudbase SDK 接到 publishableKey 后
// 在某些版本下也会创建一个真正的 anonymous session。我们以 getLoginState()
// 拿到的 uid 作为「能往云端写的身份凭证」，并通过 onAuthStateChange + getUser
// 读取最新的 is_anonymous 标记。
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
  /** 用户名（仅正式账号有；匿名时为空） */
  username: string | null;
  /** 展示名：正式账号显示用户名/昵称；匿名显示"云端账户 #xxxx" */
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
   * 把当前匿名 session **升级**为正式用户名/密码账号。
   * 关键：uid 不变，云端数据自动继承。
   * 失败时抛错给上层 UI 显示。
   */
  upgradeToAccount: (params: {
    username: string;
    password: string;
    nickname?: string;
  }) => Promise<void>;
  /** 用用户名/密码登录已有账号（在新设备恢复云端数据） */
  signInWithUsername: (params: {
    username: string;
    password: string;
  }) => Promise<void>;
  /** 退出登录：清掉当前 session，让 SDK 重新建立一个新匿名 session */
  signOut: () => Promise<void>;
  /**
   * 重置云端账户：清掉当前匿名 session，重新拿一个新的。
   * 等价于"换一个云端身份"——之前那份云数据不会被删，但当前浏览器再也访问不到。
   * 仅匿名状态下显示。
   */
  resetAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** 把 SDK 内部 user 对象转成精简结构 */
function toAuthUser(
  uid: string,
  isAnonymous: boolean,
  username: string | null,
  nickname: string | null,
): AuthUser {
  const tail = uid?.slice(-4) || '0000';
  let displayName: string;
  if (isAnonymous) {
    displayName = `云端账户 #${tail}`;
  } else {
    displayName = nickname || username || `账户 #${tail}`;
  }
  return {
    uid,
    username,
    displayName,
    isAnonymous,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const initedRef = useRef(false);

  /**
   * 拉取当前用户最新身份信息：
   * - 用 getLoginState 拿 uid（即使匿名也有）
   * - 用 getUser 拿 is_anonymous / user_metadata.username / nickname（升级后这些字段会变）
   */
  const refreshUser = useCallback(async () => {
    try {
      const loginState = (await cbAuth.getLoginState()) as any;
      if (!loginState?.uid) {
        setUser(null);
        return;
      }
      const uid: string = loginState.uid;

      // 默认从 loginState 推断 anonymous，再用 getUser 校准
      let isAnon =
        loginState.loginType === 'ANONYMOUS' ||
        loginState.loginType === 'anonymous' ||
        !loginState.loginType;
      let username: string | null = null;
      let nickname: string | null = null;

      try {
        const userRes = (await (cbAuth as any).getUser?.()) as any;
        const u = userRes?.data?.user;
        if (u) {
          if (typeof u.is_anonymous === 'boolean') isAnon = u.is_anonymous;
          username = u.user_metadata?.username || null;
          nickname = u.user_metadata?.nickName || u.user_metadata?.name || null;
        }
      } catch {
        // getUser 在老版本可能不存在，忽略
      }

      setUser(toAuthUser(uid, isAnon, username, nickname));
    } catch (err) {
      console.warn('[auth] refreshUser failed', err);
      setUser(null);
    }
  }, []);

  // 首屏初始化
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        await refreshUser();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // 状态订阅：登录/登出/token 刷新/USER_UPDATED 都会触发
    const sub = (cbAuth as any).onAuthStateChange?.(
      (event: string, _session: any) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          // 登出后页面整体刷新，让 SDK 凭 publishableKey 重建匿名 session
          // 由调用方决定是否 reload，这里只清 state
          return;
        }
        // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED / BIND_IDENTITY 都重拉一次
        refreshUser();
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
  }, [refreshUser]);

  /**
   * 升级：把当前匿名 session 注册成正式账号。
   * 用 anonymous_token = 当前 session 的 access_token，让服务端识别"在原 uid 上设置用户名/密码"，
   * 这样云端数据（按 _openid 写）自动继承。
   */
  const upgradeToAccount = useCallback(
    async ({
      username,
      password,
      nickname,
    }: {
      username: string;
      password: string;
      nickname?: string;
    }) => {
      // 拿到匿名 session 的 access_token
      const sessionRes = (await (cbAuth as any).getSession?.()) as any;
      const anonymousToken: string | undefined =
        sessionRes?.data?.session?.access_token;

      const params: any = { username, password };
      if (nickname) params.nickname = nickname;
      if (anonymousToken) params.anonymous_token = anonymousToken;

      const res = (await cbAuth.signUp(params)) as any;
      if (res?.error) {
        throw new Error(res.error.message || '注册失败');
      }
      // signUp 成功后通常会自动登录；保险起见，如果当前 session 没刷新就显式 signInWithPassword
      // 先尝试 refreshUser 看 is_anonymous 是否已经变 false
      await refreshUser();
      if (!cbAuthIsRegistered()) {
        // 兜底：再走一次密码登录把 session 顶替成正式账号
        const loginRes = (await (cbAuth as any).signInWithPassword?.({
          username,
          password,
        })) as any;
        if (loginRes?.error) {
          throw new Error(
            '注册成功但自动登录失败，请退出后重新登录：' +
              (loginRes.error.message || ''),
          );
        }
        await refreshUser();
      }
    },
    [refreshUser],
  );

  /** 在新设备/新浏览器：用户名+密码登录已有账号 */
  const signInWithUsername = useCallback(
    async ({
      username,
      password,
    }: {
      username: string;
      password: string;
    }) => {
      const res = (await (cbAuth as any).signInWithPassword?.({
        username,
        password,
      })) as any;
      if (res?.error) {
        throw new Error(res.error.message || '登录失败，请检查用户名/密码');
      }
      await refreshUser();
    },
    [refreshUser],
  );

  /** 退出登录：登出 → 整页刷新（让 SDK 重建匿名 session） */
  const signOut = useCallback(async () => {
    try {
      await cbAuth.signOut();
    } catch (err) {
      console.warn('[auth] signOut failed', err);
    }
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  /** 重置匿名账户：登出 → 整页刷新拿一个全新匿名 uid */
  const resetAccount = useCallback(async () => {
    try {
      await cbAuth.signOut();
    } catch (err) {
      console.warn('[auth] signOut failed', err);
    }
    setUser(null);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      upgradeToAccount,
      signInWithUsername,
      signOut,
      resetAccount,
    }),
    [user, loading, upgradeToAccount, signInWithUsername, signOut, resetAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** 同步检测：当前 SDK 内 session 是否已是正式账号（非匿名） */
function cbAuthIsRegistered(): boolean {
  try {
    const ls = (cbAuth as any).getLoginStateSync?.();
    const lt = ls?.loginType;
    if (!lt) return false;
    return lt !== 'ANONYMOUS' && lt !== 'anonymous';
  } catch {
    return false;
  }
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
