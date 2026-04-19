// 核心数据类型定义

/** 用户上传的照片 */
export interface Photo {
  id: string;
  /** DataURL 或 ObjectURL，便于直接渲染 */
  src: string;
  width: number;
  height: number;
  /** 宽高比，便于排版决策 */
  ratio: number;
  /** 用户可手动标记为封面 */
  isCover?: boolean;
  /** 拍摄时间（若能读到 EXIF），此处简化为上传时间 */
  takenAt?: number;
}

/** 模板分类 */
export type TemplateCategory =
  | '温馨手绘'
  | '萌趣卡通'
  | '清新文艺'
  | '复古胶片'
  | '节日主题';

/** 模板视觉风格：决定版式的骨架结构（不仅仅是配色） */
export type TemplateStyle =
  | 'watercolor'    // 水彩手绘：手写斜贴标签 + 柔和圆角相框
  | 'cartoon'       // 萌趣卡通：气泡对话框 + 圆角糖果边
  | 'minimal'       // 清新极简：杂志式排版 + 大留白 + 细分割线
  | 'vintage'       // 复古胶片：polaroid 白边 + 打字机体 + 日期印章
  | 'festival-cn'   // 中国红：红边框 + 竖排标题 + 印章
  | 'festival-xmas'; // 圣诞：雪花边 + 松枝丝带

/** 单页版式类型 */
export type PageLayoutType =
  | 'cover'
  | 'single'
  | 'single-portrait'
  | 'double'
  | 'triple'
  | 'grid4'
  | 'text'
  | 'ending';

/** 模板定义 */
export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  /** 视觉风格代号，决定版式骨架 */
  style: TemplateStyle;
  description: string;
  isFree: boolean;
  /** 主题色 */
  colors: {
    bg: string;
    paper: string;
    primary: string;
    accent: string;
    text: string;
  };
  /** 字体族 */
  fontFamily: {
    title: string;
    body: string;
  };
  /** 背景图案（CSS） */
  backgroundPattern?: string;
  /** 装饰元素（emoji 或字符） */
  decorations: string[];
  /** 默认标题文案 */
  defaultTitle: string;
  defaultSubtitle: string;
  /**
   * 该模板专属的示例封面图 src（通常是内嵌 SVG Data URL）。
   * 用于模板预览封面，使每个模板都有主题鲜明、带宝宝形象的封面图。
   * 若未提供，预览时会退回到通用 SAMPLE_PHOTOS[0]。
   */
  coverPhotoSrc?: string;
}

/** 画册中的一页 */
export interface BookPage {
  id: string;
  layout: PageLayoutType;
  /** 放置在此页的照片 id 列表（按版式决定数量） */
  photoIds: string[];
  /** 文案（标题 / 正文） */
  title?: string;
  subtitle?: string;
  caption?: string;
}

/** 画册 */
export interface Book {
  id: string;
  title: string;
  babyName: string;
  dateRange: string;
  templateId: string;
  pages: BookPage[];
  /** 照片资源表（仅保存缩略 dataURL，限制存储大小） */
  photos: Photo[];
  createdAt: number;
  updatedAt: number;
}
