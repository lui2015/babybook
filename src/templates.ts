import type { Template } from './types';

/**
 * 10 款模板，覆盖 5 大分类，每个模板都有明显不同的：
 *   - style（骨架：watercolor/cartoon/minimal/vintage/festival-cn/festival-xmas）
 *   - colors（鲜明对比的主色调）
 *   - backgroundPattern（有辨识度的底纹）
 */
export const TEMPLATES: Template[] = [
  /* ———— 1. 水彩温馨：暖粉+暖橙，柔光晕染 ———— */
  {
    id: 'tpl_warm_watercolor',
    name: '水彩温馨',
    category: '温馨手绘',
    style: 'watercolor',
    description: '粉橙水彩晕染，手写斜贴标签，温馨治愈',
    isFree: true,
    colors: {
      bg: '#FFF1E6',
      paper: '#FFF8F0',
      primary: '#E76F51',
      accent: '#F4A261',
      text: '#4A2C1E',
    },
    fontFamily: { title: 'Caveat, Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(ellipse at 10% 0%, #FFCFB5 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, #FFE2B8 0%, transparent 55%), radial-gradient(ellipse at 50% 50%, #FFD6C4 0%, transparent 70%)',
    decorations: ['🌸', '🍃', '✿'],
    defaultTitle: '宝贝的温暖时光',
    defaultSubtitle: 'Sweet Moments',
  },

  /* ———— 2. 手绘童趣：薄荷绿+嫩黄，绘本风 ———— */
  {
    id: 'tpl_hand_sketch',
    name: '手绘童趣',
    category: '温馨手绘',
    style: 'watercolor',
    description: '薄荷绿嫩黄，像翻开一本温柔的绘本',
    isFree: true,
    colors: {
      bg: '#EEF7E8',
      paper: '#F9FDF4',
      primary: '#6BAF6E',
      accent: '#F2C94C',
      text: '#2F4A2A',
    },
    fontFamily: { title: 'Caveat, cursive', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 20% 15%, #C9E4B2 0 120px, transparent 120px), radial-gradient(circle at 85% 85%, #FFEDB3 0 100px, transparent 100px), repeating-linear-gradient(45deg, transparent 0 20px, rgba(107,175,110,0.05) 20px 22px)',
    decorations: ['🌿', '✏️', '☁️'],
    defaultTitle: '小小绘本',
    defaultSubtitle: 'My Little Story',
  },

  /* ———— 3. 糖果卡通：桃粉+天蓝，高饱和 ———— */
  {
    id: 'tpl_candy_cartoon',
    name: '糖果卡通',
    category: '萌趣卡通',
    style: 'cartoon',
    description: '桃粉天蓝撞色，气泡对话框+糖果圆角，生日首选',
    isFree: true,
    colors: {
      bg: '#FFE3EE',
      paper: '#FFFFFF',
      primary: '#FF5C8A',
      accent: '#3BB4E8',
      text: '#2B1930',
    },
    fontFamily: { title: 'Caveat, cursive', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 15% 10%, #FFB0CC 0 80px, transparent 80px), radial-gradient(circle at 85% 85%, #A8DCFF 0 90px, transparent 90px), repeating-linear-gradient(135deg, transparent 0 24px, rgba(255,92,138,0.07) 24px 28px)',
    decorations: ['🎈', '🍭', '⭐', '🎂'],
    defaultTitle: '我的生日派对',
    defaultSubtitle: 'Happy Birthday',
  },

  /* ———— 4. 小动物朋友：亮黄+藏青+橘红，高对比童书 ———— */
  {
    id: 'tpl_animal_friends',
    name: '小动物朋友',
    category: '萌趣卡通',
    style: 'cartoon',
    description: '亮黄藏青橘红撞色，像经典童书插画',
    isFree: false,
    colors: {
      bg: '#FFF7D6',
      paper: '#FFFDF0',
      primary: '#2E4E8A',
      accent: '#FF7043',
      text: '#1A2A45',
    },
    fontFamily: { title: 'Caveat, cursive', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 12% 12%, #FFD770 0 100px, transparent 100px), radial-gradient(circle at 88% 88%, #FFB095 0 100px, transparent 100px)',
    decorations: ['🐻', '🦊', '🐰', '🐥'],
    defaultTitle: '我的动物朋友们',
    defaultSubtitle: 'My Little Friends',
  },

  /* ———— 5. 清新极简：米白 + 正黑 + 一抹正红（日系杂志） ———— */
  {
    id: 'tpl_minimal_fresh',
    name: '清新极简',
    category: '清新文艺',
    style: 'minimal',
    description: '黑红撞色 × 大面积留白，日系杂志质感',
    isFree: true,
    colors: {
      bg: '#EFECE6',
      paper: '#FDFCF8',
      primary: '#1A1A1A',
      accent: '#C8342B',
      text: '#1A1A1A',
    },
    fontFamily: { title: 'Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'linear-gradient(180deg, #F4F1EB 0%, #FDFCF8 60%)',
    decorations: ['·', '—'],
    defaultTitle: '时光慢慢',
    defaultSubtitle: 'Slow Moments',
  },

  /* ———— 6. 晴空旅行：深青+沙黄（地中海旅拍） ———— */
  {
    id: 'tpl_sky_travel',
    name: '晴空旅行',
    category: '清新文艺',
    style: 'minimal',
    description: '地中海深青沙黄，旅途画册',
    isFree: false,
    colors: {
      bg: '#E3ECEF',
      paper: '#FBFAF3',
      primary: '#0E5A6E',
      accent: '#E4B363',
      text: '#0E2A33',
    },
    fontFamily: { title: 'Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'linear-gradient(180deg, #C9DDE3 0%, #FBFAF3 70%)',
    decorations: ['✈', '☁', '🌊'],
    defaultTitle: '旅行日记',
    defaultSubtitle: 'Journey Diary',
  },

  /* ———— 7. 复古胶片：深棕牛皮纸 + 米白（整页深色纸） ———— */
  {
    id: 'tpl_vintage_film',
    name: '复古胶片',
    category: '复古胶片',
    style: 'vintage',
    description: '深棕胶片纸 × Polaroid 白边 × 打字机体',
    isFree: true,
    colors: {
      bg: '#1F1A16',
      paper: '#2B2320',
      primary: '#E9D8B3',
      accent: '#D4A24C',
      text: '#F2E7D0',
    },
    fontFamily: { title: 'Courier New, Courier, monospace', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'repeating-linear-gradient(0deg, rgba(233,216,179,0.04) 0 2px, transparent 2px 5px), radial-gradient(ellipse at 30% 30%, rgba(212,162,76,0.08) 0%, transparent 60%)',
    decorations: ['●', '◆'],
    defaultTitle: '童年纪事',
    defaultSubtitle: 'Memories',
  },

  /* ———— 8. 牛皮纸笔记：暖牛皮纸黄 + 深墨 ———— */
  {
    id: 'tpl_old_paper',
    name: '牛皮纸笔记',
    category: '复古胶片',
    style: 'vintage',
    description: '牛皮纸色 × 深墨打字，手工日记感',
    isFree: false,
    colors: {
      bg: '#D8C29D',
      paper: '#ECD9B2',
      primary: '#5A3A1E',
      accent: '#A0522D',
      text: '#3E2A14',
    },
    fontFamily: { title: 'Courier New, Courier, monospace', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'repeating-linear-gradient(90deg, rgba(90,58,30,0.06) 0 40px, transparent 40px 80px), repeating-linear-gradient(0deg, rgba(90,58,30,0.05) 0 40px, transparent 40px 80px), radial-gradient(ellipse at 50% 50%, rgba(160,82,45,0.12) 0%, transparent 70%)',
    decorations: ['✒', '✽'],
    defaultTitle: '成长笔记',
    defaultSubtitle: 'Growth Notes',
  },

  /* ———— 9. 新年中国红：饱和红 + 金 + 浅云纹 ———— */
  {
    id: 'tpl_newyear_red',
    name: '新年中国红',
    category: '节日主题',
    style: 'festival-cn',
    description: '饱和中国红 × 金色装饰 × 竖排楷体',
    isFree: true,
    colors: {
      bg: '#FFEBE3',
      paper: '#FFF6EF',
      primary: '#B71C1C',
      accent: '#D4A017',
      text: '#4A1414',
    },
    fontFamily: { title: 'STKaiti, KaiTi, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 15% 15%, rgba(183,28,28,0.12) 0 140px, transparent 140px), radial-gradient(circle at 85% 85%, rgba(212,160,23,0.15) 0 120px, transparent 120px), repeating-linear-gradient(45deg, transparent 0 30px, rgba(183,28,28,0.04) 30px 34px)',
    decorations: ['🧧', '🏮', '🎊', '✨'],
    defaultTitle: '新年好',
    defaultSubtitle: 'Happy New Year',
  },

  /* ———— 10. 圣诞之夜：深绿底 + 酒红 + 金雪花 ———— */
  {
    id: 'tpl_christmas',
    name: '圣诞之夜',
    category: '节日主题',
    style: 'festival-xmas',
    description: '深松绿 × 酒红 × 金雪花，圣诞仪式感',
    isFree: false,
    colors: {
      bg: '#0E3B24',
      paper: '#133E29',
      primary: '#E63946',
      accent: '#F2C94C',
      text: '#F2F7F0',
    },
    fontFamily: { title: 'Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 20% 20%, rgba(242,201,76,0.15) 0 80px, transparent 80px), radial-gradient(circle at 80% 75%, rgba(230,57,70,0.18) 0 100px, transparent 100px), repeating-linear-gradient(30deg, rgba(242,201,76,0.05) 0 2px, transparent 2px 22px)',
    decorations: ['🎄', '🎁', '❄', '✨'],
    defaultTitle: '圣诞快乐',
    defaultSubtitle: 'Merry Christmas',
  },
];

export const TEMPLATE_CATEGORIES: Array<Template['category']> = [
  '温馨手绘',
  '萌趣卡通',
  '清新文艺',
  '复古胶片',
  '节日主题',
];

export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
