// 多图版式（2/3/4/5/6 图）的骨架变体清单
//
// - 每个变体只描述「照片块的位置、尺寸、偏移」，不涉及风格装饰（相框/气泡）
// - PageView 在每个 styleless 的多图版式里，按 variant 渲染不同骨架
// - 自定义模板编辑器读取本清单，生成缩略图让用户挑选
//
// 约定：每个 layout 的第一个变体作为默认方案（与历史行为保持兼容）

export interface VariantDef {
  /** 变体 id，保存到 template.layoutVariants 里 */
  id: string;
  /** 展示名（编辑器用） */
  label: string;
  /** 一句话描述（编辑器悬浮 / 帮助文案） */
  hint: string;
}

export const VARIANTS: {
  double: VariantDef[];
  triple: VariantDef[];
  grid4: VariantDef[];
  grid5: VariantDef[];
  grid6: VariantDef[];
} = {
  double: [
    { id: 'equal', label: '等分并排', hint: '两张图左右等分，经典对称' },
    { id: 'big-small', label: '主次 7:3', hint: '左大右小，重点突出' },
    { id: 'stack-overlap', label: '错落重叠', hint: '两张方图错位叠放，杂志感' },
  ],
  triple: [
    { id: 'big-two', label: '一大两小', hint: '左侧 4:5 主图，右侧两张 1:1 小图' },
    { id: 'row', label: '横向三联', hint: '三张图等分成行，呼应连贯' },
    { id: 'scatter', label: '自由散摆', hint: '三张方图错落偏移，随性贴纸感' },
  ],
  grid4: [
    { id: 'grid-2x2', label: '2×2 方阵', hint: '四张 1:1 等分，整齐干净' },
    { id: 'scatter', label: '散摆贴纸', hint: '四张方图微旋错落，像手账拼贴' },
    { id: 'hero-right', label: '左三右一', hint: '左侧三张拼竖条 + 右侧一张大图' },
  ],
  grid5: [
    { id: 'hero-left', label: '左主右四', hint: '左侧 4:5 大图 + 右侧 2×2 小图' },
    { id: 'hero-center', label: '中心焦点', hint: '中央大图被四张小图环绕' },
    { id: 'top1-bottom4', label: '上一下四', hint: '顶部横幅主图 + 底部四张小图' },
  ],
  grid6: [
    { id: 'grid-3x2', label: '3×2 方阵', hint: '六张 1:1 等分，照片墙' },
    { id: 'hero-left-5', label: '左主右五', hint: '左侧 4:5 大图 + 右侧 5 张迷你图' },
    { id: 'mosaic', label: '马赛克拼贴', hint: '两张主图 + 四张副图的大小错落拼贴' },
  ],
};

/** 取某个 layout 的默认变体 id（第一个） */
export function defaultVariantId(
  layout: keyof typeof VARIANTS,
): string {
  return VARIANTS[layout][0].id;
}
