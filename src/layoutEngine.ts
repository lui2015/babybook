import type {
  BookPage,
  CustomVariant,
  Overlay,
  OverlayPhoto,
  Photo,
  PageLayoutType,
  Template,
} from './types';

/**
 * 智能排版引擎
 * 策略：
 *  1. 封面：选择横图/正方形、标记过封面优先
 *  2. 内页：根据横竖比和照片数自动匹配版式
 *     - 横图优先用 single 大图
 *     - 2 张相邻且都较窄 → double
 *     - 3 张 → triple
 *     - 4 张 → grid4
 *  3. 每隔若干页插入 1 个纯文字抒情页（可选）
 *  4. 最后 1 页为 ending 寄语页
 */

const uid = () => Math.random().toString(36).slice(2, 10);

interface LayoutOptions {
  /** 是否在中间插入文字页 */
  insertTextPages?: boolean;
  /** 模板（用于决定默认文案） */
  template?: Template;
  /** 宝宝姓名 */
  babyName?: string;
  /** 日期范围 */
  dateRange?: string;
}

/** 选择最合适的封面照片：标记优先，其次横图/正方形，最后第一张 */
function pickCover(photos: Photo[]): Photo {
  const marked = photos.find((p) => p.isCover);
  if (marked) return marked;
  const landscape = photos.find((p) => p.ratio >= 0.9 && p.ratio <= 1.6);
  return landscape ?? photos[0];
}

/** 将照片按版式分组 */
function groupPhotos(photos: Photo[]): Array<{ layout: PageLayoutType; photos: Photo[] }> {
  const groups: Array<{ layout: PageLayoutType; photos: Photo[] }> = [];
  let i = 0;

  while (i < photos.length) {
    const remaining = photos.length - i;
    const p = photos[i];

    // 横图/大尺寸 → 单图占整页
    if (p.ratio >= 1.25) {
      groups.push({ layout: 'single', photos: [p] });
      i += 1;
      continue;
    }

    // 6 张都接近方形 → 六宫格
    if (
      remaining >= 6 &&
      photos.slice(i, i + 6).every((x) => x.ratio >= 0.6 && x.ratio <= 1.4)
    ) {
      groups.push({ layout: 'grid6', photos: photos.slice(i, i + 6) });
      i += 6;
      continue;
    }

    // 5 张接近方形 → 五图
    if (
      remaining >= 5 &&
      photos.slice(i, i + 5).every((x) => x.ratio >= 0.6 && x.ratio <= 1.4)
    ) {
      groups.push({ layout: 'grid5', photos: photos.slice(i, i + 5) });
      i += 5;
      continue;
    }

    // 如果剩余 ≥ 4 且接下来 4 张都比较接近方形 → 拼贴 4 格
    if (
      remaining >= 4 &&
      photos.slice(i, i + 4).every((x) => x.ratio >= 0.6 && x.ratio <= 1.4)
    ) {
      groups.push({ layout: 'grid4', photos: photos.slice(i, i + 4) });
      i += 4;
      continue;
    }

    // 3 张
    if (remaining >= 3) {
      groups.push({ layout: 'triple', photos: photos.slice(i, i + 3) });
      i += 3;
      continue;
    }

    // 2 张竖图 → double 并排
    if (remaining >= 2 && p.ratio < 1.0) {
      groups.push({ layout: 'double', photos: photos.slice(i, i + 2) });
      i += 2;
      continue;
    }

    // 单张竖图 → 竖版单图
    groups.push({
      layout: p.ratio < 0.95 ? 'single-portrait' : 'single',
      photos: [p],
    });
    i += 1;
  }

  return groups;
}

/** 默认抒情文案池 */
const CAPTIONS = [
  '时间太慢，慢到能数清你每一次笑。',
  '你是爸爸妈妈最温柔的软肋，也是最坚硬的铠甲。',
  '愿你一生有山可靠，有路可走，有梦可做。',
  '小小的你，装着大大的世界。',
  '每一个平凡的日子，因你而闪闪发光。',
  '你笑起来的样子，是这个世界最动人的风景。',
];

/** 生成完整画册页面 */
export function generatePages(photos: Photo[], options: LayoutOptions = {}): BookPage[] {
  if (photos.length === 0) return [];

  // 优先级：模板带自由布局页（template.pages） → 直接按模板页结构实例化
  // 这是「自定义模板编辑器」生成的模板的渲染入口。
  const tplPages = options.template?.pages;
  if (tplPages && tplPages.length > 0) {
    return instantiateFromTemplatePages(photos, options);
  }

  const pages: BookPage[] = [];
  const tpl = options.template;

  // 1. 封面
  const cover = pickCover(photos);
  pages.push({
    id: uid(),
    layout: 'cover',
    photoIds: [cover.id],
    title: tpl?.defaultTitle ?? (options.babyName ? `${options.babyName}的画册` : '我的画册'),
    subtitle: options.dateRange || tpl?.defaultSubtitle || '',
  });

  // 2. 内页：排除封面后分组
  const innerPhotos = photos.filter((p) => p.id !== cover.id);
  const groups = groupPhotos(innerPhotos);

  groups.forEach((g, idx) => {
    pages.push({
      id: uid(),
      layout: g.layout,
      photoIds: g.photos.map((p) => p.id),
      caption: CAPTIONS[idx % CAPTIONS.length],
    });

    // 每 4 个图页插入 1 页纯文字
    if (options.insertTextPages && (idx + 1) % 4 === 0 && idx < groups.length - 1) {
      pages.push({
        id: uid(),
        layout: 'text',
        photoIds: [],
        title: '成长，是一场温柔的旅行',
        caption: CAPTIONS[(idx + 10) % CAPTIONS.length],
      });
    }
  });

  // 3. 尾页
  pages.push({
    id: uid(),
    layout: 'ending',
    photoIds: [],
    title: '致我最爱的宝贝',
    caption: '愿你被世界温柔以待，也愿你眼里总有光。',
  });

  return pages;
}

/**
 * 按模板的自由布局页（template.pages）实例化画册。
 *
 * 规则：
 *  - 完全保留模板预设的页数和每页的 overlays 几何布局；
 *  - 把所有页中的 OverlayPhoto 槽位（按页顺序、再按 overlays 顺序）依次绑定用户照片；
 *  - 当用户照片数 < 槽位数时，剩余槽位保留为 placeholder（PageView 会渲染占位）；
 *  - 当用户照片数 > 槽位数时，多余照片会循环回填首页槽位（避免照片被丢弃）。
 *
 * 文字 overlay 原样保留（用模板里设计的文案）。
 */
function instantiateFromTemplatePages(
  photos: Photo[],
  options: LayoutOptions,
): BookPage[] {
  const tpl = options.template!;
  const tplPages = tpl.pages!;

  // 计算所有 photo 槽位数
  const totalSlots = tplPages.reduce(
    (sum, p) => sum + p.overlays.filter((o) => o.kind === 'photo').length,
    0,
  );

  // 给每个槽位顺序绑一张照片
  const photoIdsBySlot: string[] = [];
  for (let i = 0; i < totalSlots; i++) {
    photoIdsBySlot.push(photos[i % photos.length].id);
  }

  // 替换封面页第一张图片为"用户标记的封面"（如果有），让封面更智能
  const cover = pickCover(photos);
  if (totalSlots > 0) photoIdsBySlot[0] = cover.id;

  let slotCursor = 0;
  return tplPages.map((tp, pageIdx) => {
    // —— 封面页：直接走 PageView 内置的 cover 版式 ——
    // 取该页第一张 OverlayPhoto 槽位绑定的照片作为封面图；若该页没有图片槽位，则退回到全局封面照
    if (tp.kind === 'cover') {
      const firstPhotoOv = tp.overlays.find((o) => o.kind === 'photo') as
        | OverlayPhoto
        | undefined;
      let coverPhotoId: string;
      if (firstPhotoOv) {
        coverPhotoId = photoIdsBySlot[slotCursor] ?? cover.id;
        slotCursor += 1;
        // 跳过该页其它图片槽位（封面版式只用 1 张）
        const restPhotoCount = tp.overlays.filter((o) => o.kind === 'photo').length - 1;
        slotCursor += Math.max(0, restPhotoCount);
      } else {
        coverPhotoId = cover.id;
      }
      return {
        id: uid(),
        layout: 'cover',
        photoIds: [coverPhotoId],
        variant: tp.coverVariant,
        title: tpl.defaultTitle ?? (options.babyName ? `${options.babyName}的画册` : '我的画册'),
        subtitle: options.dateRange || tpl.defaultSubtitle || '',
      };
    }

    const pagePhotoIds: string[] = [];
    const overlays: Overlay[] = tp.overlays.map((ov) => {
      if (ov.kind !== 'photo') return ov;
      const boundPhotoId = photoIdsBySlot[slotCursor] ?? photos[0].id;
      slotCursor += 1;
      pagePhotoIds.push(boundPhotoId);
      const filled: OverlayPhoto = {
        ...ov,
        photoId: boundPhotoId,
        placeholder: false,
      };
      return filled;
    });

    return {
      id: uid(),
      layout: 'free',
      photoIds: pagePhotoIds,
      // 仅首页用模板默认标题/副标题作为 BookPage 级字段（导出/分享时可读取）
      ...(pageIdx === 0
        ? {
            title:
              tpl.defaultTitle ?? (options.babyName ? `${options.babyName}的画册` : '我的画册'),
            subtitle: options.dateRange || tpl.defaultSubtitle || '',
          }
        : {}),
      overlays,
    };
  });
}

/* ============================================================
 *  convertPageToFree
 *
 *  把一页从「骨架版式（single/double/triple/grid…）」转成
 *  「自由摆放（free + OverlayPhoto[]）」，每张照片成为一个可拖动 / 缩放 /
 *  旋转的相框。原 layout 记录到 prevLayout 字段以便"还原默认排版"。
 *
 *  - 几何按版式推导成接近原视觉的 % 坐标（左上角 x/y + 宽 w/高 h）；
 *  - 形状沿用 page.photoShapes（不再使用 photoFocus，因 OverlayPhoto 用裁剪 cover 自适应）；
 *  - 文字 caption / overlays（OverlayText）保留，不变；
 *  - 已是 free 的页直接返回原页（幂等）。
 * ============================================================ */
export function convertPageToFree(page: BookPage): BookPage {
  if (page.layout === 'free') return page;

  // 不可转换的非"图片版式"（cover/text/ending）保持原样，由 UI 不暴露按钮即可
  if (page.layout === 'cover' || page.layout === 'text' || page.layout === 'ending') {
    return page;
  }

  const prevOverlays: Overlay[] = page.overlays ?? [];
  // 保留原 OverlayText（避免丢用户已写的自由文字）
  const keptTextOverlays = prevOverlays.filter((o) => o.kind === 'text');

  const photoIds = page.photoIds ?? [];
  const slots = layoutSlotGeometry(page.layout, photoIds.length);

  const photoOverlays: OverlayPhoto[] = photoIds.slice(0, slots.length).map((pid, i) => {
    const g = slots[i];
    const shape = page.photoShapes?.[i];
    return {
      id: uid(),
      kind: 'photo',
      photoId: pid,
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      rotation: 0,
      shape,
      // 默认柔和阴影 + 适度白边，转成自由摆放后看起来仍像"相框"
      borderColor: '#ffffff',
      borderWidth: 6,
      borderStyle: 'solid',
      borderRadius: shape === 'rounded' ? 12 : 0,
      shadow: 'soft',
      placeholder: false,
    } as OverlayPhoto;
  });

  return {
    ...page,
    layout: 'free',
    prevLayout: page.layout,
    overlays: [...photoOverlays, ...keptTextOverlays],
    // 自由布局下 photoFocus 不再生效（OverlayPhoto 自带 cover 裁剪）
    photoFocus: undefined,
  };
}

/**
 * 根据骨架版式推导每个 photo slot 的近似几何（%）。
 * 数值不必与原版式像素级一致 —— 只要切换后照片不堆叠、初始观感合理即可，
 * 后续用户会自由拖动调整。
 */
function layoutSlotGeometry(
  layout: PageLayoutType,
  count: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  const n = Math.max(0, count);
  if (n === 0) return [];

  switch (layout) {
    case 'single':
    case 'single-portrait':
      // 单图：略带留白居中
      return [{ x: 8, y: 10, w: 84, h: 70 }];

    case 'double': {
      // 双图：上下错落叠加（接近常见杂志风），第二张稍往右下偏移
      const w = 58;
      const h = 50;
      return [
        { x: 6, y: 8, w, h },
        { x: 36, y: 38, w, h },
      ].slice(0, n);
    }

    case 'triple': {
      // 三图：左 1 大 + 右上下 2 小
      const slots = [
        { x: 6, y: 10, w: 50, h: 70 },
        { x: 60, y: 10, w: 34, h: 33 },
        { x: 60, y: 47, w: 34, h: 33 },
      ];
      return slots.slice(0, n);
    }

    case 'grid4': {
      // 2x2 网格
      const w = 40;
      const h = 36;
      const xs = [8, 52];
      const ys = [10, 50];
      const out = [] as Array<{ x: number; y: number; w: number; h: number }>;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          out.push({ x: xs[c], y: ys[r], w, h });
        }
      }
      return out.slice(0, n);
    }

    case 'grid5': {
      // 上 2 下 3
      const slots = [
        { x: 8, y: 8, w: 40, h: 38 },
        { x: 52, y: 8, w: 40, h: 38 },
        { x: 6, y: 52, w: 28, h: 32 },
        { x: 36, y: 52, w: 28, h: 32 },
        { x: 66, y: 52, w: 28, h: 32 },
      ];
      return slots.slice(0, n);
    }

    case 'grid6': {
      // 3x2
      const w = 27;
      const h = 36;
      const xs = [7, 36.5, 66];
      const ys = [10, 52];
      const out = [] as Array<{ x: number; y: number; w: number; h: number }>;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          out.push({ x: xs[c], y: ys[r], w, h });
        }
      }
      return out.slice(0, n);
    }

    default: {
      // 兜底：整页平均切成 n 张横排
      const margin = 6;
      const totalW = 100 - margin * 2;
      const gap = 2;
      const w = (totalW - gap * (n - 1)) / n;
      const h = 60;
      return Array.from({ length: n }, (_, i) => ({
        x: margin + i * (w + gap),
        y: 20,
        w,
        h,
      }));
    }
  }
}

/**
 * 把已转成 free 的页"还原"回原骨架版式（依赖 prevLayout）。
 * - 若 prevLayout 缺失或当前不是 free，原样返回；
 * - 还原时丢弃 photo overlays，但保留用户在 free 期间编辑的 OverlayText（写回 overlays）。
 */
export function restorePageFromFree(page: BookPage): BookPage {
  if (page.layout !== 'free' || !page.prevLayout) return page;
  const keptTextOverlays = (page.overlays ?? []).filter((o) => o.kind === 'text');
  return {
    ...page,
    layout: page.prevLayout,
    prevLayout: undefined,
    overlays: keptTextOverlays.length ? keptTextOverlays : undefined,
  };
}

/* ============================================================
 *  自定义版式变体（CustomVariant）工具
 *
 *  使用流程：
 *    1) 用户在某页（非 free）开启「自由摆放」→ 该页变 layout='free' + OverlayPhoto[]，
 *       prevLayout 记下原 layout（如 'triple'）。
 *    2) 用户拖框调整后，点「另存为我的变体」→ extractCustomVariantFromPage(page, label)
 *       生成 CustomVariant，slots 以原 layout 作为绑定 layout（即 prevLayout）。
 *    3) 之后任意同 layout 的页都可在「版式变体」面板里点选这个自定义变体 →
 *       applyCustomVariantToPage(page, cv) 把页面切到 free + 套用 slots，
 *       并记下 customVariantId 用于 UI 高亮。
 * ============================================================ */

/**
 * 从一页（必须是 free 且 prevLayout 是图片版式）抽取出 CustomVariant。
 * 返回 null 表示不可抽取（不是 free 模式 / 缺 prevLayout / 没有 OverlayPhoto）。
 */
export function extractCustomVariantFromPage(
  page: BookPage,
  label: string,
): CustomVariant | null {
  if (page.layout !== 'free') return null;
  // 必须能"绑回"一个图片版式，否则它就只是任意 free 页，不属于"某 layout 的变体"
  const targetLayout: PageLayoutType | undefined = page.prevLayout;
  if (!targetLayout || targetLayout === 'free' || targetLayout === 'cover'
    || targetLayout === 'text' || targetLayout === 'ending') {
    return null;
  }

  const photoOverlays = (page.overlays ?? []).filter(
    (o): o is OverlayPhoto => o.kind === 'photo',
  );
  if (photoOverlays.length === 0) return null;

  return {
    id: uid(),
    label: label.trim() || '我的变体',
    layout: targetLayout,
    slots: photoOverlays.map((o) => ({
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      rotation: o.rotation,
      shape: o.shape,
      borderColor: o.borderColor,
      borderWidth: o.borderWidth,
      borderStyle: o.borderStyle,
      borderRadius: o.borderRadius,
      shadow: o.shadow,
    })),
    createdAt: Date.now(),
  };
}

/**
 * 把页面套用到指定 CustomVariant：layout=free + 按 slots 顺序生成 OverlayPhoto。
 *
 *  - 若当前页已是 free，先丢掉旧的 photo overlays（保留 OverlayText）；
 *  - prevLayout 设为 cv.layout，以便用户后续能"还原"回该骨架；
 *  - photoIds 数量不足 cv.slots 时只渲染前 N 个槽位；
 *    photoIds 多于 slots 时多余照片暂时隐藏（用户可继续手动添加 / 改回内置变体）。
 */
export function applyCustomVariantToPage(
  page: BookPage,
  cv: CustomVariant,
): BookPage {
  const photoIds = page.photoIds ?? [];
  const keptText = (page.overlays ?? []).filter((o) => o.kind === 'text');

  const photoOverlays: OverlayPhoto[] = photoIds
    .slice(0, cv.slots.length)
    .map((pid, i) => {
      const s = cv.slots[i];
      return {
        id: uid(),
        kind: 'photo',
        photoId: pid,
        x: s.x,
        y: s.y,
        w: s.w,
        h: s.h,
        rotation: s.rotation ?? 0,
        shape: s.shape,
        borderColor: s.borderColor,
        borderWidth: s.borderWidth,
        borderStyle: s.borderStyle,
        borderRadius: s.borderRadius,
        shadow: s.shadow,
        placeholder: false,
      } as OverlayPhoto;
    });

  return {
    ...page,
    layout: 'free',
    prevLayout: cv.layout,
    customVariantId: cv.id,
    variant: undefined,
    photoFocus: undefined,
    overlays: [...photoOverlays, ...keptText],
  };
}

