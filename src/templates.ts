import type { Template } from './types';

/**
 * 30 款内置模板，覆盖 5 大分类，每个模板都有明显不同的：
 *   - style（骨架：watercolor/cartoon/minimal/vintage/festival-cn/festival-xmas）
 *   - colors（鲜明对比的主色调）
 *   - backgroundPattern（有辨识度的底纹）
 *   - decorations / fontFamily / 文案
 *
 * 分类与 style 分布（保证骨架与配色都不重复）：
 *   温馨手绘 × 6   watercolor
 *   萌趣卡通 × 6   cartoon
 *   清新文艺 × 6   minimal
 *   复古胶片 × 6   vintage
 *   节日主题 × 6   festival-cn × 5 + festival-xmas × 1
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

  /* ====================== 温馨手绘 · 补 4 款 ====================== */

  /* ———— 11. 奶油云朵：奶白 + 天空蓝，绵柔 ———— */
  {
    id: 'tpl_cream_cloud',
    name: '奶油云朵',
    category: '温馨手绘',
    style: 'watercolor',
    description: '奶白天空蓝，软绵绵的云朵水彩',
    isFree: true,
    colors: {
      bg: '#F4F9FF',
      paper: '#FDFEFF',
      primary: '#6AA6DE',
      accent: '#FFD6E0',
      text: '#2F4A66',
    },
    fontFamily: { title: 'Caveat, cursive', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(ellipse at 15% 20%, #D8EAFF 0%, transparent 55%), radial-gradient(ellipse at 85% 80%, #FFE7EE 0%, transparent 55%), radial-gradient(circle at 50% 50%, rgba(106,166,222,0.04) 0%, transparent 70%)',
    decorations: ['☁️', '🌈', '✨', '🎈'],
    defaultTitle: '飘在云朵上',
    defaultSubtitle: 'On the Clouds',
  },

  /* ———— 12. 樱花和风：樱粉 + 抹茶绿 ———— */
  {
    id: 'tpl_sakura_zen',
    name: '樱花和风',
    category: '温馨手绘',
    style: 'watercolor',
    description: '樱粉与抹茶绿，和风水彩小确幸',
    isFree: false,
    colors: {
      bg: '#FDEEF1',
      paper: '#FFF8F9',
      primary: '#D88AA4',
      accent: '#9CBF94',
      text: '#4A2C34',
    },
    fontFamily: { title: 'Caveat, Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 18% 15%, #F7C8D6 0 110px, transparent 110px), radial-gradient(circle at 88% 90%, #CCE4C3 0 100px, transparent 100px), repeating-linear-gradient(60deg, transparent 0 24px, rgba(216,138,164,0.05) 24px 26px)',
    decorations: ['🌸', '🍃', '🎏'],
    defaultTitle: '樱花季',
    defaultSubtitle: 'Sakura Days',
  },

  /* ———— 13. 牛奶咖啡：奶咖色调 + 暖棕 ———— */
  {
    id: 'tpl_milk_coffee',
    name: '牛奶咖啡',
    category: '温馨手绘',
    style: 'watercolor',
    description: '奶咖色调与暖棕，拿铁拉花般的柔和',
    isFree: true,
    colors: {
      bg: '#F6EEE1',
      paper: '#FBF5EA',
      primary: '#8C5A3C',
      accent: '#D9B382',
      text: '#3E2A1A',
    },
    fontFamily: { title: 'Caveat, cursive', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(ellipse at 20% 30%, #EEDBB8 0%, transparent 60%), radial-gradient(ellipse at 85% 75%, #E4C79D 0%, transparent 55%), repeating-linear-gradient(15deg, transparent 0 22px, rgba(140,90,60,0.04) 22px 24px)',
    decorations: ['☕', '🥛', '🍪'],
    defaultTitle: '日常小时光',
    defaultSubtitle: 'Daily Latte',
  },

  /* ———— 14. 薰衣草之梦：紫调柔雾 ———— */
  {
    id: 'tpl_lavender_dream',
    name: '薰衣草之梦',
    category: '温馨手绘',
    style: 'watercolor',
    description: '梦幻薰衣草紫，柔雾般的睡前故事',
    isFree: false,
    colors: {
      bg: '#EFE8FB',
      paper: '#FAF6FF',
      primary: '#8A6BC1',
      accent: '#C9A7E8',
      text: '#2F2244',
    },
    fontFamily: { title: 'Caveat, Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(ellipse at 12% 10%, #D8C5F5 0%, transparent 55%), radial-gradient(ellipse at 88% 90%, #E7D3FA 0%, transparent 55%), radial-gradient(circle at 50% 50%, rgba(138,107,193,0.05) 0%, transparent 70%)',
    decorations: ['💜', '🌙', '✨', '🪻'],
    defaultTitle: '晚安宝贝',
    defaultSubtitle: 'Sweet Dream',
  },

  /* ====================== 萌趣卡通 · 补 4 款 ====================== */

  /* ———— 15. 恐龙世界：亮绿 + 火山橙 ———— */
  {
    id: 'tpl_dino_world',
    name: '恐龙世界',
    category: '萌趣卡通',
    style: 'cartoon',
    description: '亮绿与火山橙，勇敢小探险家',
    isFree: true,
    colors: {
      bg: '#E6F5D8',
      paper: '#FAFFF1',
      primary: '#3E8E41',
      accent: '#F26419',
      text: '#1B3A18',
    },
    fontFamily: { title: 'Caveat, cursive', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 15% 15%, #C2E2A0 0 90px, transparent 90px), radial-gradient(circle at 82% 85%, #FFCBA4 0 100px, transparent 100px), repeating-linear-gradient(45deg, transparent 0 26px, rgba(62,142,65,0.06) 26px 30px)',
    decorations: ['🦖', '🦕', '🌋', '🌿'],
    defaultTitle: '恐龙大冒险',
    defaultSubtitle: 'Dino Adventure',
  },

  /* ———— 16. 海底小世界：海蓝 + 珊瑚橘 ———— */
  {
    id: 'tpl_under_sea',
    name: '海底小世界',
    category: '萌趣卡通',
    style: 'cartoon',
    description: '海蓝与珊瑚橘，水泡和热带鱼游来游去',
    isFree: true,
    colors: {
      bg: '#DFF3FA',
      paper: '#F5FBFE',
      primary: '#0F75A8',
      accent: '#FF9770',
      text: '#0A2E43',
    },
    fontFamily: { title: 'Caveat, cursive', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 18% 12%, #B4E1F2 0 90px, transparent 90px), radial-gradient(circle at 85% 82%, #FFCAB0 0 90px, transparent 90px), repeating-radial-gradient(circle at 50% 50%, transparent 0 30px, rgba(15,117,168,0.05) 30px 32px)',
    decorations: ['🐠', '🐙', '🐚', '🫧'],
    defaultTitle: '海底大冒险',
    defaultSubtitle: 'Under the Sea',
  },

  /* ———— 17. 太空奇遇：深蓝紫 + 星黄 ———— */
  {
    id: 'tpl_space_odyssey',
    name: '太空奇遇',
    category: '萌趣卡通',
    style: 'cartoon',
    description: '深蓝紫夜空撒满星星，小小宇航员出发',
    isFree: false,
    colors: {
      bg: '#1B1A3D',
      paper: '#25244D',
      primary: '#FFD93D',
      accent: '#6BE2FF',
      text: '#F5F6FA',
    },
    fontFamily: { title: 'Caveat, cursive', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 20% 25%, rgba(255,217,61,0.20) 0 6px, transparent 6px), radial-gradient(circle at 40% 70%, rgba(107,226,255,0.20) 0 5px, transparent 5px), radial-gradient(circle at 75% 30%, rgba(255,255,255,0.18) 0 4px, transparent 4px), radial-gradient(circle at 88% 80%, rgba(255,217,61,0.18) 0 5px, transparent 5px), radial-gradient(ellipse at 50% 50%, rgba(107,226,255,0.08) 0%, transparent 70%)',
    decorations: ['🚀', '🌟', '🪐', '👨‍🚀'],
    defaultTitle: '小小宇航员',
    defaultSubtitle: 'To the Stars',
  },

  /* ———— 18. 水果嘉年华：西瓜红 + 柠檬黄 ———— */
  {
    id: 'tpl_fruit_carnival',
    name: '水果嘉年华',
    category: '萌趣卡通',
    style: 'cartoon',
    description: '西瓜红柠檬黄，清爽夏日水果派对',
    isFree: true,
    colors: {
      bg: '#FFF4D6',
      paper: '#FFFCF0',
      primary: '#E63946',
      accent: '#F4D35E',
      text: '#3A1E22',
    },
    fontFamily: { title: 'Caveat, cursive', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 12% 15%, #FFCDD2 0 85px, transparent 85px), radial-gradient(circle at 85% 80%, #FFF59D 0 95px, transparent 95px), repeating-linear-gradient(135deg, transparent 0 22px, rgba(230,57,70,0.05) 22px 26px)',
    decorations: ['🍉', '🍋', '🍓', '🍍'],
    defaultTitle: '水果派对',
    defaultSubtitle: 'Fruit Party',
  },

  /* ====================== 清新文艺 · 补 4 款 ====================== */

  /* ———— 19. 莫兰迪灰：高级雾霾灰 ———— */
  {
    id: 'tpl_morandi_gray',
    name: '莫兰迪灰',
    category: '清新文艺',
    style: 'minimal',
    description: '高级雾霾灰粉，莫兰迪色系杂志感',
    isFree: false,
    colors: {
      bg: '#E4E0DA',
      paper: '#F4F0EA',
      primary: '#6E6257',
      accent: '#C89A8A',
      text: '#2A241F',
    },
    fontFamily: { title: 'Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'linear-gradient(180deg, #DCD6CC 0%, #F4F0EA 70%)',
    decorations: ['·', '—', '○'],
    defaultTitle: '安静的成长',
    defaultSubtitle: 'Quiet Moments',
  },

  /* ———— 20. 北欧森林：雾松绿 + 原木 ———— */
  {
    id: 'tpl_nordic_forest',
    name: '北欧森林',
    category: '清新文艺',
    style: 'minimal',
    description: '雾松绿搭原木米，北欧极简温柔',
    isFree: true,
    colors: {
      bg: '#E7EDE4',
      paper: '#F7F9F4',
      primary: '#3E5E4E',
      accent: '#B38A5B',
      text: '#1E2E25',
    },
    fontFamily: { title: 'Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'linear-gradient(180deg, #D9E3D3 0%, #F7F9F4 70%), repeating-linear-gradient(90deg, rgba(62,94,78,0.03) 0 1px, transparent 1px 50px)',
    decorations: ['🌲', '·', '—'],
    defaultTitle: '森林小客',
    defaultSubtitle: 'In the Forest',
  },

  /* ———— 21. 晨雾浅灰：冷调性冷淡 ———— */
  {
    id: 'tpl_morning_fog',
    name: '晨雾浅灰',
    category: '清新文艺',
    style: 'minimal',
    description: '冷调浅灰 × 蓝灰点缀，极简性冷淡',
    isFree: true,
    colors: {
      bg: '#EEF0F2',
      paper: '#FAFBFC',
      primary: '#2F3E4D',
      accent: '#6FA3BF',
      text: '#1A252F',
    },
    fontFamily: { title: 'Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'linear-gradient(180deg, #E1E5EA 0%, #FAFBFC 65%)',
    decorations: ['·', '—'],
    defaultTitle: '晨间记事',
    defaultSubtitle: 'Morning Notes',
  },

  /* ———— 22. 米白日记：极纯净，几乎全白 ———— */
  {
    id: 'tpl_ivory_journal',
    name: '米白日记',
    category: '清新文艺',
    style: 'minimal',
    description: '几乎全白的米色纸面 × 细线条与极细衬线字',
    isFree: false,
    colors: {
      bg: '#FAF7F0',
      paper: '#FFFDF7',
      primary: '#2B2A28',
      accent: '#8B7A55',
      text: '#2B2A28',
    },
    fontFamily: { title: 'Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'linear-gradient(180deg, #F4EEE0 0%, #FFFDF7 55%), repeating-linear-gradient(0deg, rgba(43,42,40,0.03) 0 1px, transparent 1px 36px)',
    decorations: ['—', '·'],
    defaultTitle: '宝贝日记',
    defaultSubtitle: 'Baby Journal',
  },

  /* ====================== 复古胶片 · 补 4 款 ====================== */

  /* ———— 23. 柯达暖黄：80s 快照感 ———— */
  {
    id: 'tpl_kodak_warm',
    name: '柯达暖黄',
    category: '复古胶片',
    style: 'vintage',
    description: '柯达胶片暖黄 × 米白相纸，八十年代快照',
    isFree: true,
    colors: {
      bg: '#3A2A1A',
      paper: '#EADBBF',
      primary: '#C96B2A',
      accent: '#E7B961',
      text: '#2A1A0E',
    },
    fontFamily: { title: 'Courier New, Courier, monospace', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(ellipse at 30% 25%, rgba(231,185,97,0.22) 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(201,107,42,0.25) 0%, transparent 55%), repeating-linear-gradient(0deg, rgba(231,185,97,0.04) 0 2px, transparent 2px 6px)',
    decorations: ['📷', '●'],
    defaultTitle: '那年夏天',
    defaultSubtitle: 'Summer Of',
  },

  /* ———— 24. 黑白默片：无色 + 颗粒感 ———— */
  {
    id: 'tpl_noir_silent',
    name: '黑白默片',
    category: '复古胶片',
    style: 'vintage',
    description: '高对比黑白 × 胶片颗粒 × 默片老字',
    isFree: false,
    colors: {
      bg: '#111111',
      paper: '#F2F0EB',
      primary: '#111111',
      accent: '#8A8A8A',
      text: '#111111',
    },
    fontFamily: { title: 'Courier New, Courier, monospace', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.05) 0%, transparent 70%)',
    decorations: ['●', '◆', '■'],
    defaultTitle: '无声电影',
    defaultSubtitle: 'Silent Reel',
  },

  /* ———— 25. 赛博未来：霓虹品红 + 青 + 深紫黑 ———— */
  {
    id: 'tpl_cyber_future',
    name: '赛博未来',
    category: '复古胶片',
    style: 'vintage',
    description: '赛博朋克霓虹撞色，复古未来主义相册',
    isFree: false,
    colors: {
      bg: '#0B0420',
      paper: '#160A30',
      primary: '#FF2BD6',
      accent: '#22D3EE',
      text: '#F4F6FF',
    },
    fontFamily: { title: 'Courier New, Courier, monospace', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 15% 10%, rgba(255,43,214,0.30) 0%, transparent 55%), radial-gradient(ellipse at 90% 90%, rgba(34,211,238,0.25) 0%, transparent 55%), linear-gradient(rgba(255,43,214,0.06) 1px, transparent 1px) 0 0/48px 48px, linear-gradient(90deg, rgba(34,211,238,0.06) 1px, transparent 1px) 0 0/48px 48px',
    decorations: ['◆', '●', '★'],
    defaultTitle: '赛博纪事',
    defaultSubtitle: 'Neon Diary',
  },

  /* ———— 26. 旧书馆：墨绿 + 古书黄 ———— */
  {
    id: 'tpl_old_library',
    name: '旧书馆',
    category: '复古胶片',
    style: 'vintage',
    description: '墨绿皮面 × 古书黄相纸 × 打字机字',
    isFree: true,
    colors: {
      bg: '#1F3A2C',
      paper: '#EADEBE',
      primary: '#A97F2E',
      accent: '#C9A24A',
      text: '#2A2212',
    },
    fontFamily: { title: 'Courier New, Courier, monospace', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'repeating-linear-gradient(0deg, rgba(201,162,74,0.05) 0 1px, transparent 1px 4px), radial-gradient(ellipse at 25% 30%, rgba(201,162,74,0.14) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(169,127,46,0.15) 0%, transparent 55%)',
    decorations: ['✒', '§', '✽'],
    defaultTitle: '童年卷宗',
    defaultSubtitle: 'The Archive',
  },

  /* ====================== 节日主题 · 补 4 款 ====================== */

  /* ———— 27. 元宵花灯：橘红 + 金 + 暖光晕 ———— */
  {
    id: 'tpl_lantern_festival',
    name: '元宵花灯',
    category: '节日主题',
    style: 'festival-cn',
    description: '橘红花灯与金色光晕，元宵团圆夜',
    isFree: true,
    colors: {
      bg: '#2B1410',
      paper: '#FFF2E0',
      primary: '#E85D2F',
      accent: '#F5C03E',
      text: '#3A1810',
    },
    fontFamily: { title: 'STKaiti, KaiTi, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 18% 20%, rgba(245,192,62,0.30) 0 120px, transparent 120px), radial-gradient(circle at 82% 75%, rgba(232,93,47,0.35) 0 140px, transparent 140px), repeating-radial-gradient(circle at 50% 50%, transparent 0 40px, rgba(245,192,62,0.05) 40px 42px)',
    decorations: ['🏮', '🥟', '✨', '🌕'],
    defaultTitle: '元宵团圆',
    defaultSubtitle: 'Lantern Night',
  },

  /* ———— 28. 端午青竹：竹青 + 朱红粽结 ———— */
  {
    id: 'tpl_dragon_boat',
    name: '端午青竹',
    category: '节日主题',
    style: 'festival-cn',
    description: '竹青配朱红粽结，清雅又热闹',
    isFree: false,
    colors: {
      bg: '#E4EFDC',
      paper: '#F6FAEF',
      primary: '#386641',
      accent: '#BC4749',
      text: '#1F3021',
    },
    fontFamily: { title: 'STKaiti, KaiTi, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'repeating-linear-gradient(0deg, rgba(56,102,65,0.08) 0 1px, transparent 1px 34px), radial-gradient(circle at 15% 15%, rgba(188,71,73,0.14) 0 110px, transparent 110px), radial-gradient(circle at 88% 88%, rgba(56,102,65,0.14) 0 120px, transparent 120px)',
    decorations: ['🐉', '🍃', '🧧'],
    defaultTitle: '端午安康',
    defaultSubtitle: 'Dragon Boat',
  },

  /* ———— 29. 中秋月夜：深靛 + 月白 + 桂金 ———— */
  {
    id: 'tpl_midautumn',
    name: '中秋月夜',
    category: '节日主题',
    style: 'festival-cn',
    description: '深靛夜空 × 月白 × 桂金圆光',
    isFree: true,
    colors: {
      bg: '#1A2340',
      paper: '#F4F0E4',
      primary: '#D4A017',
      accent: '#EEDEA8',
      text: '#1A1410',
    },
    fontFamily: { title: 'STKaiti, KaiTi, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 80% 20%, rgba(238,222,168,0.65) 0 80px, transparent 82px), radial-gradient(circle at 80% 20%, rgba(238,222,168,0.25) 82px 120px, transparent 120px), radial-gradient(circle at 20% 80%, rgba(212,160,23,0.15) 0 120px, transparent 120px), repeating-linear-gradient(0deg, rgba(238,222,168,0.04) 0 1px, transparent 1px 40px)',
    decorations: ['🌕', '🥮', '🪷', '✨'],
    defaultTitle: '中秋月圆',
    defaultSubtitle: 'Mid-Autumn',
  },

  /* ———— 30. 万圣南瓜：墨紫 + 橙 + 蝙蝠黑 ———— */
  {
    id: 'tpl_halloween_pumpkin',
    name: '万圣南瓜',
    category: '节日主题',
    style: 'festival-xmas',
    description: '墨紫夜色 × 南瓜橙 × 蝙蝠黑，小怪兽出动',
    isFree: false,
    colors: {
      bg: '#1E0E2B',
      paper: '#2A1238',
      primary: '#F77F00',
      accent: '#C77DFF',
      text: '#F6ECFF',
    },
    fontFamily: { title: 'Playfair Display, serif', body: 'PingFang SC, sans-serif' },
    backgroundPattern:
      'radial-gradient(circle at 18% 25%, rgba(247,127,0,0.22) 0 90px, transparent 90px), radial-gradient(circle at 82% 78%, rgba(199,125,255,0.22) 0 110px, transparent 110px), repeating-linear-gradient(30deg, rgba(247,127,0,0.05) 0 2px, transparent 2px 24px)',
    decorations: ['🎃', '🦇', '👻', '🕸️'],
    defaultTitle: '不给糖就捣蛋',
    defaultSubtitle: 'Trick or Treat',
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
