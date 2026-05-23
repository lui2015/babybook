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
  | 'ending'
  /**
   * 自由版式：页面无任何预设骨架，所有内容（照片框 / 文字）都通过 overlays 自由摆放。
   * 由「自定义模板编辑器」生成的 TemplatePage 默认使用此 layout。
   */
  | 'free';

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
  /**
   * 模板自定义页（自由布局）。
   * - 由「自定义模板编辑器」生成的页列表，每页都是 layout='free' + overlays 自由摆放。
   * - 创建画册时按此列表逐页实例化 BookPage（OverlayPhoto.photoId 会被替换为用户实际上传的照片 id）。
   * - 缺省 / 空数组 → 走旧的 layoutVariants 逻辑（兼容老数据）。
   */
  pages?: TemplatePage[];
}

/**
 * 自定义模板中的一页：固定 free 版式 + overlays。
 * 与 BookPage 的关系：BookPage 的 layout='free' 时会读取 page.overlays 直接渲染。
 * TemplatePage.overlays 中：
 *   - OverlayPhoto.photoId 在模板里仅作为"占位/绑定槽位编号"——用户用此模板创建画册时，
 *     编辑器会按 overlays 中 OverlayPhoto 的顺序，把用户上传的照片依次填入。
 *   - OverlayPhoto.placeholder=true 表示该槽位在模板里还没绑定真实照片，
 *     模板编辑器会渲染为灰底相框。
 */
export interface TemplatePage {
  /** 模板内页 id（稳定标识，用于排序/编辑） */
  id: string;
  /** 该页所需的最少照片数；由 overlays 中 OverlayPhoto 的数量自动决定 */
  photoSlotCount: number;
  /** 自由摆放的所有元素（照片框 + 文字块） */
  overlays: Overlay[];
  /** 该页特定的背景颜色覆盖（可选；不填用模板 paper 色） */
  background?: string | null;
  /**
   * 页类型：
   *   - 'free' （默认 / 缺省）：自由布局，按 overlays 渲染。
   *   - 'cover'：封面页。该页"无 overlays 自由元素"，统一走 PageView 内置 CoverLayout
   *     渲染，配合 coverVariant 选用某一种封面预设样式。
   *     模板编辑器里第 1 页可在「封面预设」与「自由自定义」间切换。
   */
  kind?: 'free' | 'cover';
  /**
   * 仅当 kind === 'cover' 时使用：选中的封面变体（与 BookEditor 中
   * COVER_VARIANT_OPTIONS 对齐：undefined=跟随模板 / 'minimal' / 'watercolor' /
   * 'cartoon' / 'vintage' / 'festival-cn' / 'festival-xmas' / 'poster' / 'filmstrip'）
   */
  coverVariant?: string;
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
  /**
   * 边框线型（仅 rect / rounded 形状下生效；异形会忽略）。
   * - 'solid'（默认）：实线
   * - 'dashed'：虚线
   * - 'dotted'：点线
   * - 'double'：双线
   * - 'none'：无边框（即便 borderWidth>0 也不画）
   */
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
  /**
   * 内圆角半径（百分比，0 ~ 50；仅 rect / rounded 生效）。
   * 不填或 shape='rounded' 时维持原默认 18%；shape='rect' 默认 0。
   */
  borderRadius?: number;
  /**
   * 阴影开关 / 强度。
   * - undefined / 'none'：无阴影
   * - 'soft'：柔和投影
   * - 'strong'：明显投影
   */
  shadow?: 'none' | 'soft' | 'strong';
  /**
   * 占位标记：仅出现在「模板编辑器」中。
   * - true：该 OverlayPhoto 是模板里设计的"图片槽位"，photoId 还未绑定真实照片，
   *   PageView 渲染时会显示为灰底相框 + 占位图标。
   * - 创建画册时，编辑器会按 overlays 顺序把 photoId 替换为用户上传的真实照片，
   *   并清掉本字段。
   */
  placeholder?: boolean;
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
