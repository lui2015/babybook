// 核心数据类型定义

/** 用户上传的照片 */
export interface Photo {
  id: string;
  /** DataURL / ObjectURL / 云存储临时 URL（已登录从云端 hydrate 后），便于直接渲染 */
  src: string;
  /**
   * 仅当 src 是从云存储 fileID 解析出的临时 URL 时存在；
   * 用于在写回云端前还原回 cloud:// 协议的 fileID（避免把临时 URL 当 src 持久化）。
   * 未登录/纯本地画册不会有此字段。
   */
  srcCloud?: string;
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
  | 'grid5'
  | 'grid6'
  | 'text'
  | 'ending';

/**
 * 多图版式的骨架变体 id
 * - 每个 layout 有若干预设（例如 double: 'equal' | 'big-small' | 'stack'）
 * - 变体只决定「照片块的位置/尺寸/偏移」，相框/气泡等风格装饰仍由 style 负责
 */
export interface LayoutVariants {
  double?: string;
  triple?: string;
  grid4?: string;
  grid5?: string;
  grid6?: string;
}

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
  /**
   * 多图版式的骨架变体选择；缺省时使用各 layout 的默认变体。
   * 仅作用于用户"自定义模板"；内置模板可以不填，保持向后兼容。
   */
  layoutVariants?: LayoutVariants;
}

/**
 * 单张照片在当前页的"相框形状"，按 slot 独立设置。
 * - rect    : 保持版式本身的比例（默认，通常是方形/4:5 长方形）
 * - rounded : 圆角方（保持版式比例，仅加大圆角）
 * - circle  : 圆形（强制 1:1）
 * - heart   : 心形（强制 1:1，clip-path）
 * - star    : 五角星（强制 1:1，clip-path）
 * - hexagon : 六边形（强制 1:1，clip-path）
 */
export type PhotoShape = 'rect' | 'rounded' | 'circle' | 'heart' | 'star' | 'hexagon';

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
  /**
   * 文字字号倍率（仅作用于本页对应字段），1 = 模板默认。
   * 用户在「文字」Tab 中为每个字段单独调节。范围 0.6 ~ 1.8。
   * 通过 CSS zoom 实现，对所有版式下该字段及其相邻装饰自动等比缩放。
   */
  titleScale?: number;
  subtitleScale?: number;
  captionScale?: number;
  /**
   * 多图版式的骨架变体（double/triple/grid4/grid5/grid6）。
   * 不填则继承 template.layoutVariants 的选择。
   * 由编辑器逐页设定。
   */
  variant?: string;
  /**
   * 每个 slot 的相框形状（与 photoIds 按索引对齐）。
   * undefined 或缺省项表示使用该版式的默认形状（通常是 'rect'）。
   * 非矩形形状会强制 1:1 比例以避免变形。
   */
  photoShapes?: (PhotoShape | undefined)[];
  /**
   * 每个 slot 的"焦点位置"（与 photoIds 按索引对齐），用于
   * `object-position`。x/y 单位为百分比 0~100，默认 {x:50, y:50}（居中）。
   * 当照片比例与相框不符（cover 模式裁切），用户可通过拖动调整看哪一块画面。
   * undefined 表示使用默认居中。
   */
  photoFocus?: (PhotoFocus | undefined)[];
  /**
   * 自由叠层元素：在版式骨架之上叠加的自定义画框 / 文字块，
   * 用户可自由拖动、缩放、旋转、删除。与版式骨架完全正交（不会改 photoIds）。
   * 渲染顺序按数组顺序，越后越靠上。
   */
  overlays?: Overlay[];
}

/** 自由叠层：照片画框 / 自定义文字 */
export type Overlay = OverlayPhoto | OverlayText;

/** 所有叠层共用的几何信息（百分比，相对于"页面容器"宽高） */
export interface OverlayBase {
  id: string;
  /** 左上角 X，单位 % (0~100) */
  x: number;
  /** 左上角 Y，单位 % (0~100) */
  y: number;
  /** 宽度，单位 %（相对于页面宽度） */
  w: number;
  /** 高度，单位 %（相对于页面高度） */
  h: number;
  /** 旋转角度（顺时针为正，单位 deg），未设置时为 0 */
  rotation?: number;
}

export interface OverlayPhoto extends OverlayBase {
  kind: 'photo';
  /** 引用 book.photos 中的照片 id */
  photoId: string;
  /** 画框形状；不填默认 rect */
  shape?: PhotoShape;
  /** 边框颜色；不填则用模板默认（通常 white / paper） */
  borderColor?: string | null;
  /** 边框宽度（px），不填用 4px */
  borderWidth?: number;
}

export interface OverlayText extends OverlayBase {
  kind: 'text';
  text: string;
  /** 字号（单位 px，按"页面 720px 设计宽度"基准缩放） */
  fontSize?: number;
  /** 字色（hex） */
  color?: string;
  /** 字体族（CSS font-family，与现有 FONT_OPTIONS 兼容） */
  fontFamily?: string;
  /** 加粗 */
  bold?: boolean;
  /** 斜体 */
  italic?: boolean;
  /** 文本对齐 */
  align?: 'left' | 'center' | 'right';
  /** 背景色（含 'transparent'） */
  background?: string;
}

/** 照片在相框内的对焦位置（object-position 百分比） */
export interface PhotoFocus {
  /** 0~100，0=最左，100=最右，50=水平居中 */
  x: number;
  /** 0~100，0=最上，100=最下，50=垂直居中 */
  y: number;
}

/** 画册级主题覆盖 —— 编辑器里用户在当前画册上的自定义，覆盖模板默认值 */
export interface BookThemeOverride {
  colors?: Partial<Template['colors']>;
  fontFamily?: Partial<Template['fontFamily']>;
  /** 背景图案 CSS（字符串或 'none' 清除），不填继承模板 */
  backgroundPattern?: string | null;
  /**
   * 图片相框颜色覆盖。
   * - undefined / null：跟随模板默认（各 style 自行决定用 primary / paper / 固定灰 等）
   * - 十六进制色串（如 '#E63946'）：强制覆盖所有 style 的主边框/描边/相框纸色
   */
  photoFrameColor?: string | null;
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
  /** 编辑器里的主题自定义，可选 */
  theme?: BookThemeOverride;
  createdAt: number;
  updatedAt: number;
}
