import type { Book, Template } from './types';

/**
 * 把 Book 上的主题覆盖（book.theme）合并到模板之上。
 *
 * - 用户模板/内置模板保持不变，避免修改原引用
 * - 只覆盖提供的字段；未覆盖的字段继承模板
 * - backgroundPattern 取值约定：
 *    - undefined / null → 继承模板的 backgroundPattern
 *    - ''（空字符串）  → 视为"取消背景图案"
 */
export function applyBookTheme(book: Book, template: Template): Template {
  const override = book.theme;
  if (!override) return template;

  const mergedColors = {
    ...template.colors,
    ...(override.colors ?? {}),
  };

  const mergedFont = {
    ...template.fontFamily,
    ...(override.fontFamily ?? {}),
  };

  let backgroundPattern = template.backgroundPattern;
  if (override.backgroundPattern !== undefined && override.backgroundPattern !== null) {
    backgroundPattern = override.backgroundPattern || undefined;
  }

  return {
    ...template,
    colors: mergedColors,
    fontFamily: mergedFont,
    backgroundPattern,
  };
}
