import type { BookPage, Photo, PageLayoutType, Template } from './types';

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
