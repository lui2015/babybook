// CloudBase Web SDK 单例封装
// - 全局共享一份 app/auth/db 实例
// - 配置 publishableKey 后，前端可直接调用登录/数据库/存储 API
import cloudbase from '@cloudbase/js-sdk';

/**
 * 环境与公开密钥（前端可见，无安全风险——这是 publishable key 而非 secret key）
 * 来自：CloudBase 控制台 → 环境设置 → 应用密钥
 */
export const CLOUDBASE_ENV_ID = 'lyman-4gf3txgne39abc0e';
export const CLOUDBASE_REGION = 'ap-shanghai';
const PUBLISHABLE_KEY =
  'eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL2x5bWFuLTRnZjN0eGduZTM5YWJjMGUuYXAtc2hhbmdoYWkudGNiLWFwaS50ZW5jZW50Y2xvdWRhcGkuY29tIiwic3ViIjoiYW5vbiIsImF1ZCI6Imx5bWFuLTRnZjN0eGduZTM5YWJjMGUiLCJleHAiOjQwODIwMjk3MjIsImlhdCI6MTc3ODM0NjUyMiwibm9uY2UiOiJiVW9DNHBUVFNkeXMtUHRZOE9YTHZnIiwiYXRfaGFzaCI6ImJVb0M0cFRUU2R5cy1QdFk4T1hMdmciLCJuYW1lIjoiQW5vbnltb3VzIiwic2NvcGUiOiJhbm9ueW1vdXMiLCJwcm9qZWN0X2lkIjoibHltYW4tNGdmM3R4Z25lMzlhYmMwZSIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJ1c2VyX3R5cGUiOiIiLCJjbGllbnRfdHlwZSI6ImNsaWVudF91c2VyIiwiaXNfc3lzdGVtX2FkbWluIjpmYWxzZX0.clL0cOuVI3OFxHIk4VwtXlDp7W40YXgtgkz04-0JQvlZwkSzT55tw8p5Qpv8sXq9dv1GO4dQNi42b2dRMn56y3PM_katomZS2CmzhgjPR-Tm-GGUs0J7TqO6Nm0Ktiuc36JXdYbcADQRBom1gLVgJRSZ0WXyMNWVEbMl9-RYJxcT0nK3n2RZtw8qTH6APoXf0zL1en_tj2FSoA68lK3MXixFLa4Cu0Fk1ZnIkoAqjVChwP_EnTJchHDw_IPMnzyjDwrrDOnzKIKk9GGIuPKcHv2j3lTZaFgiEOgxEPhAHSPXgTOjVZO3gNSlLmwWiNi_d0V6fTdK6G8zA9dpZDzR9A';

/** 单例 app */
export const cbApp = cloudbase.init({
  env: CLOUDBASE_ENV_ID,
  region: CLOUDBASE_REGION,
  // 必填：公开密钥，让未登录访客也能初始化 SDK（再决定是否登录）
  accessKey: PUBLISHABLE_KEY,
  // 必填：让 OAuth 回调能从 URL 自动恢复 session（即使我们目前不接 OAuth，也保留为 SDK 推荐配置）
  auth: { detectSessionInUrl: true },
});

/** Auth 实例：默认持久化到 localStorage（刷新页面保持登录态） */
export const cbAuth = cbApp.auth({ persistence: 'local' });

/** 数据库实例 */
export const cbDb = cbApp.database();
