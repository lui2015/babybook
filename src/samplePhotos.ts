import type { Photo } from './types';

/**
 * 模板预览用的宝宝题材示例插画（全部为内嵌 SVG Data URL）
 *
 * 为什么不用网络图（例如 Unsplash）？
 *   - 网络图会因为国内网络、CDN 屏蔽或图片下线而失败 → 模板预览出现空白
 *   - 使用内嵌 SVG 可以做到「100% 离线可用 + 永远不会空白」
 *
 * 12 幅 SVG 插画覆盖常见宝宝生活场景：
 *   睡觉 / 微笑 / 爬行 / 吃饭 / 玩具 / 洗澡 / 出行 / 抱抱 / 气球 / 生日 / 读书 / 全家福
 * 每幅画面走「扁平插画」风格，主角是一个 Q 版宝宝，配色柔和、构图饱满，
 * 配合各种模板（水彩 / 卡通 / 极简 / 复古 / 节日）都能不违和。
 */

/** 生成一幅 SVG 插画并返回 data-url */
function makeSvg(inner: string, bg: string[]): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500' width='400' height='500'>
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='0' y2='1'>
        <stop offset='0%' stop-color='${bg[0]}'/>
        <stop offset='100%' stop-color='${bg[1]}'/>
      </linearGradient>
      <radialGradient id='cheek' cx='0.5' cy='0.5' r='0.5'>
        <stop offset='0%' stop-color='#ff9aa8' stop-opacity='0.8'/>
        <stop offset='100%' stop-color='#ff9aa8' stop-opacity='0'/>
      </radialGradient>
    </defs>
    <rect width='400' height='500' fill='url(#bg)'/>
    ${inner}
  </svg>`;
  // 使用 encodeURIComponent 避免特殊字符破坏 data-url
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 宝宝头部通用组件（皮肤色 + 腮红 + 眼睛 + 嘴） */
function baby(x: number, y: number, scale: number, opts: { mouth?: 'smile' | 'oh' | 'flat' | 'laugh' | 'sleep'; eyes?: 'open' | 'closed' | 'star'; hairColor?: string } = {}): string {
  const { mouth = 'smile', eyes = 'open', hairColor = '#6B3A1A' } = opts;
  const s = scale;
  const cx = x;
  const cy = y;
  // 头
  const head = `<ellipse cx='${cx}' cy='${cy}' rx='${60 * s}' ry='${58 * s}' fill='#FFE0C9'/>`;
  // 头发（刘海）
  const hair = `<path d='M ${cx - 52 * s} ${cy - 32 * s} Q ${cx - 20 * s} ${cy - 58 * s}, ${cx} ${cy - 40 * s} T ${cx + 52 * s} ${cy - 32 * s} Q ${cx + 30 * s} ${cy - 48 * s}, ${cx} ${cy - 50 * s} T ${cx - 52 * s} ${cy - 32 * s} Z' fill='${hairColor}'/>`;
  // 腮红
  const cheeks = `<circle cx='${cx - 28 * s}' cy='${cy + 8 * s}' r='${10 * s}' fill='url(#cheek)'/><circle cx='${cx + 28 * s}' cy='${cy + 8 * s}' r='${10 * s}' fill='url(#cheek)'/>`;
  // 眼
  let eyeSvg = '';
  if (eyes === 'open') {
    eyeSvg = `<circle cx='${cx - 18 * s}' cy='${cy - 4 * s}' r='${5 * s}' fill='#2a1c14'/><circle cx='${cx + 18 * s}' cy='${cy - 4 * s}' r='${5 * s}' fill='#2a1c14'/><circle cx='${cx - 16 * s}' cy='${cy - 6 * s}' r='${1.5 * s}' fill='#fff'/><circle cx='${cx + 20 * s}' cy='${cy - 6 * s}' r='${1.5 * s}' fill='#fff'/>`;
  } else if (eyes === 'closed') {
    eyeSvg = `<path d='M ${cx - 24 * s} ${cy - 3 * s} Q ${cx - 18 * s} ${cy + 3 * s}, ${cx - 12 * s} ${cy - 3 * s}' stroke='#2a1c14' stroke-width='${2 * s}' fill='none' stroke-linecap='round'/><path d='M ${cx + 12 * s} ${cy - 3 * s} Q ${cx + 18 * s} ${cy + 3 * s}, ${cx + 24 * s} ${cy - 3 * s}' stroke='#2a1c14' stroke-width='${2 * s}' fill='none' stroke-linecap='round'/>`;
  } else {
    // star eyes
    eyeSvg = `<text x='${cx - 22 * s}' y='${cy + 2 * s}' font-size='${16 * s}' fill='#2a1c14'>✦</text><text x='${cx + 10 * s}' y='${cy + 2 * s}' font-size='${16 * s}' fill='#2a1c14'>✦</text>`;
  }
  // 嘴
  let mouthSvg = '';
  if (mouth === 'smile') {
    mouthSvg = `<path d='M ${cx - 10 * s} ${cy + 18 * s} Q ${cx} ${cy + 26 * s}, ${cx + 10 * s} ${cy + 18 * s}' stroke='#B8514A' stroke-width='${2.5 * s}' fill='none' stroke-linecap='round'/>`;
  } else if (mouth === 'laugh') {
    mouthSvg = `<path d='M ${cx - 14 * s} ${cy + 14 * s} Q ${cx} ${cy + 30 * s}, ${cx + 14 * s} ${cy + 14 * s} Z' fill='#B8514A'/><path d='M ${cx - 10 * s} ${cy + 18 * s} Q ${cx} ${cy + 24 * s}, ${cx + 10 * s} ${cy + 18 * s}' fill='#fff' opacity='0.6'/>`;
  } else if (mouth === 'oh') {
    mouthSvg = `<ellipse cx='${cx}' cy='${cy + 20 * s}' rx='${5 * s}' ry='${7 * s}' fill='#B8514A'/>`;
  } else if (mouth === 'sleep') {
    mouthSvg = `<path d='M ${cx - 6 * s} ${cy + 18 * s} Q ${cx} ${cy + 22 * s}, ${cx + 6 * s} ${cy + 18 * s}' stroke='#B8514A' stroke-width='${2 * s}' fill='none' stroke-linecap='round'/>`;
  } else {
    mouthSvg = `<line x1='${cx - 8 * s}' y1='${cy + 20 * s}' x2='${cx + 8 * s}' y2='${cy + 20 * s}' stroke='#B8514A' stroke-width='${2.5 * s}' stroke-linecap='round'/>`;
  }
  return head + hair + cheeks + eyeSvg + mouthSvg;
}

/* ———— 12 幅插画 ———— */

// 1. 初生：襁褓中的熟睡宝宝
const sp1 = makeSvg(
  `<!-- 毛毯 -->
  <ellipse cx='200' cy='340' rx='160' ry='80' fill='#FFCFD7'/>
  <ellipse cx='200' cy='330' rx='140' ry='60' fill='#FFE0E6'/>
  <!-- 星星 -->
  <g fill='#FFFFFF' opacity='0.8'>
    <text x='40' y='60' font-size='22'>✦</text>
    <text x='340' y='90' font-size='18'>✦</text>
    <text x='60' y='150' font-size='14'>✦</text>
    <text x='330' y='180' font-size='14'>✦</text>
  </g>
  <!-- 月亮 -->
  <circle cx='320' cy='70' r='28' fill='#FFF3B0'/>
  <circle cx='332' cy='62' r='26' fill='#FFEFC6' opacity='1'/>
  ${baby(200, 280, 1.1, { mouth: 'sleep', eyes: 'closed' })}
  <!-- 帽子 -->
  <path d='M 140 230 Q 200 180, 260 230 Q 250 220, 200 215 Q 150 220, 140 230 Z' fill='#FF8A9A'/>
  <circle cx='200' cy='195' r='12' fill='#FFCAD4'/>`,
  ['#F7C7D0', '#FFE8DC']
);

// 2. 微笑：抱着玩具熊的宝宝
const sp2 = makeSvg(
  `<!-- 身体 -->
  <rect x='140' y='300' width='120' height='130' rx='30' fill='#B8D8F5'/>
  <!-- 熊玩具 -->
  <circle cx='180' cy='380' r='28' fill='#C58A5C'/>
  <circle cx='165' cy='365' r='10' fill='#C58A5C'/>
  <circle cx='195' cy='365' r='10' fill='#C58A5C'/>
  <circle cx='165' cy='365' r='4' fill='#7A4A2A'/>
  <circle cx='195' cy='365' r='4' fill='#7A4A2A'/>
  <ellipse cx='180' cy='380' rx='14' ry='12' fill='#F2D2AD'/>
  <circle cx='175' cy='378' r='2' fill='#2a1c14'/>
  <circle cx='185' cy='378' r='2' fill='#2a1c14'/>
  <circle cx='180' cy='388' r='2' fill='#2a1c14'/>
  ${baby(200, 220, 1.05, { mouth: 'laugh', eyes: 'open' })}`,
  ['#E8F4FF', '#FFF6EC']
);

// 3. 爬行：开心地爬向镜头
const sp3 = makeSvg(
  `<!-- 地板 -->
  <rect x='0' y='380' width='400' height='120' fill='#F3E4C7'/>
  <path d='M 0 380 L 400 380' stroke='#E0C9A0' stroke-width='3'/>
  <!-- 身体（爬行姿态） -->
  <ellipse cx='200' cy='340' rx='90' ry='45' fill='#FFE59A'/>
  <!-- 胳膊 -->
  <ellipse cx='130' cy='355' rx='22' ry='14' fill='#FFE0C9'/>
  <ellipse cx='270' cy='355' rx='22' ry='14' fill='#FFE0C9'/>
  <!-- 腿 -->
  <ellipse cx='155' cy='400' rx='22' ry='14' fill='#FFE0C9'/>
  <ellipse cx='245' cy='400' rx='22' ry='14' fill='#FFE0C9'/>
  ${baby(200, 260, 1.1, { mouth: 'laugh', eyes: 'open' })}
  <!-- 草地小花 -->
  <g>
    <circle cx='60' cy='420' r='8' fill='#FF8FA3'/>
    <circle cx='60' cy='420' r='3' fill='#FFD93D'/>
    <circle cx='340' cy='430' r='8' fill='#FF8FA3'/>
    <circle cx='340' cy='430' r='3' fill='#FFD93D'/>
  </g>`,
  ['#D5F5E3', '#FFF9E8']
);

// 4. 吃饭：拿勺子的小吃货
const sp4 = makeSvg(
  `<!-- 餐椅 -->
  <rect x='150' y='320' width='100' height='120' rx='18' fill='#F6C6A6'/>
  <rect x='140' y='310' width='120' height='20' rx='6' fill='#E8A57C'/>
  <!-- 围兜 -->
  <path d='M 160 280 L 240 280 L 250 330 L 150 330 Z' fill='#FFD86F'/>
  <circle cx='200' cy='285' r='6' fill='#FF8C6B'/>
  <!-- 勺子 -->
  <line x1='100' y1='280' x2='140' y2='250' stroke='#B08968' stroke-width='6' stroke-linecap='round'/>
  <ellipse cx='96' cy='284' rx='12' ry='8' fill='#E9E9E9' transform='rotate(-30 96 284)'/>
  ${baby(200, 220, 1.05, { mouth: 'oh', eyes: 'open' })}
  <!-- 食物点 -->
  <text x='96' y='268' font-size='12'>🍚</text>`,
  ['#FFF2C9', '#FFE6DA']
);

// 5. 玩具：抓着彩色积木
const sp5 = makeSvg(
  `<!-- 地毯 -->
  <ellipse cx='200' cy='430' rx='160' ry='30' fill='#F7D6E0'/>
  <!-- 身体 -->
  <rect x='150' y='300' width='100' height='110' rx='26' fill='#B7E0C3'/>
  <!-- 积木 -->
  <rect x='80' y='370' width='40' height='40' rx='4' fill='#FF6B6B'/>
  <text x='94' y='397' font-size='18' fill='#fff' font-weight='bold'>A</text>
  <rect x='280' y='380' width='34' height='34' rx='4' fill='#4DA6E8'/>
  <text x='290' y='403' font-size='16' fill='#fff' font-weight='bold'>B</text>
  <rect x='320' y='340' width='30' height='30' rx='4' fill='#FFD93D'/>
  <text x='329' y='360' font-size='14' fill='#8A6A00' font-weight='bold'>C</text>
  ${baby(200, 225, 1.1, { mouth: 'laugh', eyes: 'star' })}`,
  ['#FDE6F0', '#EAF6FF']
);

// 6. 洗澡：泡泡浴
const sp6 = makeSvg(
  `<!-- 浴盆 -->
  <path d='M 80 320 Q 200 440 320 320 L 330 380 Q 200 470 70 380 Z' fill='#FFE0A6'/>
  <ellipse cx='200' cy='320' rx='120' ry='18' fill='#BDE5FF'/>
  <!-- 水波 -->
  <path d='M 90 320 Q 110 305, 130 320 T 170 320 T 210 320 T 250 320 T 290 320 T 310 320' stroke='#8CCBEF' stroke-width='2.5' fill='none'/>
  <!-- 泡泡 -->
  <g fill='#FFFFFF' opacity='0.85'>
    <circle cx='140' cy='270' r='14'/>
    <circle cx='280' cy='250' r='10'/>
    <circle cx='330' cy='290' r='12'/>
    <circle cx='70' cy='280' r='9'/>
    <circle cx='250' cy='200' r='8'/>
  </g>
  ${baby(200, 230, 1, { mouth: 'laugh', eyes: 'open' })}`,
  ['#E1F5FB', '#FFF5E0']
);

// 7. 出行：戴渔夫帽的宝宝
const sp7 = makeSvg(
  `<!-- 背景太阳 -->
  <circle cx='320' cy='100' r='40' fill='#FFE066'/>
  <g stroke='#FFD43B' stroke-width='3' stroke-linecap='round'>
    <line x1='320' y1='40' x2='320' y2='55'/>
    <line x1='380' y1='100' x2='365' y2='100'/>
    <line x1='360' y1='60' x2='350' y2='70'/>
  </g>
  <!-- 云 -->
  <ellipse cx='80' cy='120' rx='40' ry='14' fill='#fff' opacity='0.9'/>
  <ellipse cx='110' cy='110' rx='28' ry='12' fill='#fff' opacity='0.9'/>
  <!-- 背包 -->
  <rect x='145' y='290' width='110' height='120' rx='16' fill='#88B8E8'/>
  <rect x='170' y='310' width='60' height='24' rx='6' fill='#fff' opacity='0.6'/>
  ${baby(200, 220, 1.05, { mouth: 'smile', eyes: 'open' })}
  <!-- 渔夫帽 -->
  <ellipse cx='200' cy='165' rx='85' ry='15' fill='#F4A261'/>
  <ellipse cx='200' cy='160' rx='60' ry='32' fill='#F4A261'/>
  <rect x='155' y='155' width='90' height='10' fill='#E76F51' rx='2'/>`,
  ['#BBE3F5', '#FFF0D6']
);

// 8. 抱抱：牵着父母的手
const sp8 = makeSvg(
  `<!-- 两只大手 -->
  <ellipse cx='70' cy='300' rx='50' ry='30' fill='#FBD7B8'/>
  <ellipse cx='90' cy='325' rx='14' ry='18' fill='#FBD7B8'/>
  <ellipse cx='330' cy='300' rx='50' ry='30' fill='#FBD7B8'/>
  <ellipse cx='310' cy='325' rx='14' ry='18' fill='#FBD7B8'/>
  <!-- 身体 -->
  <rect x='160' y='295' width='80' height='120' rx='26' fill='#FFB7C5'/>
  <!-- 宝宝手 -->
  <ellipse cx='130' cy='345' rx='20' ry='12' fill='#FFE0C9'/>
  <ellipse cx='270' cy='345' rx='20' ry='12' fill='#FFE0C9'/>
  ${baby(200, 230, 1.0, { mouth: 'smile', eyes: 'closed' })}
  <!-- 爱心 -->
  <path d='M 200 170 l -10 -12 a 8 8 0 1 1 10 -6 a 8 8 0 1 1 10 6 z' fill='#FF5C8A'/>`,
  ['#FFE5EC', '#FFF3DF']
);

// 9. 气球：抓着气球飞翔的宝宝
const sp9 = makeSvg(
  `<!-- 气球 -->
  <g>
    <ellipse cx='130' cy='90' rx='28' ry='34' fill='#FF6B9D'/>
    <ellipse cx='200' cy='70' rx='30' ry='36' fill='#4DA6E8'/>
    <ellipse cx='270' cy='95' rx='28' ry='34' fill='#FFD93D'/>
    <line x1='130' y1='124' x2='180' y2='260' stroke='#999' stroke-width='1.5'/>
    <line x1='200' y1='106' x2='200' y2='260' stroke='#999' stroke-width='1.5'/>
    <line x1='270' y1='129' x2='220' y2='260' stroke='#999' stroke-width='1.5'/>
  </g>
  <!-- 身体 -->
  <rect x='160' y='310' width='80' height='110' rx='26' fill='#FFDDA1'/>
  <!-- 手 -->
  <ellipse cx='170' cy='300' rx='16' ry='20' fill='#FFE0C9'/>
  ${baby(200, 240, 1.05, { mouth: 'laugh', eyes: 'star' })}`,
  ['#E8F4FF', '#FFE8EE']
);

// 10. 生日：头戴小尖帽吃蛋糕
const sp10 = makeSvg(
  `<!-- 蛋糕 -->
  <rect x='130' y='350' width='140' height='70' rx='6' fill='#FFB4B4'/>
  <path d='M 130 350 Q 160 330, 200 350 T 270 350' fill='#FFE4E4'/>
  <rect x='196' y='300' width='8' height='40' fill='#F4A261'/>
  <path d='M 200 280 Q 195 295, 200 305 Q 205 295, 200 280' fill='#FFD93D'/>
  <!-- 彩屑 -->
  <g>
    <rect x='70' y='80' width='4' height='14' fill='#FF6B6B' transform='rotate(30 72 87)'/>
    <rect x='320' y='100' width='4' height='14' fill='#4DA6E8' transform='rotate(-20 322 107)'/>
    <rect x='120' y='140' width='4' height='14' fill='#FFD93D' transform='rotate(60 122 147)'/>
    <rect x='300' y='200' width='4' height='14' fill='#2EB86C' transform='rotate(-40 302 207)'/>
  </g>
  ${baby(200, 230, 1.0, { mouth: 'laugh', eyes: 'star' })}
  <!-- 派对帽 -->
  <path d='M 170 155 L 230 155 L 200 90 Z' fill='#FF6B9D'/>
  <circle cx='200' cy='88' r='8' fill='#FFD93D'/>`,
  ['#FFEFF4', '#E8F7FF']
);

// 11. 读书：翻开小绘本
const sp11 = makeSvg(
  `<!-- 绘本 -->
  <path d='M 100 360 L 200 340 L 300 360 L 300 430 L 200 410 L 100 430 Z' fill='#F5F1E4'/>
  <line x1='200' y1='340' x2='200' y2='410' stroke='#C8B98E' stroke-width='2'/>
  <g fill='#4DA6E8' opacity='0.8'>
    <rect x='118' y='370' width='68' height='4' rx='2'/>
    <rect x='118' y='382' width='54' height='4' rx='2'/>
    <rect x='214' y='370' width='68' height='4' rx='2'/>
    <rect x='214' y='382' width='54' height='4' rx='2'/>
  </g>
  <circle cx='140' cy='402' r='8' fill='#FFD93D'/>
  <circle cx='260' cy='402' r='8' fill='#FF6B9D'/>
  <!-- 身体 -->
  <rect x='155' y='280' width='90' height='90' rx='22' fill='#C8E6D6'/>
  ${baby(200, 210, 1.0, { mouth: 'smile', eyes: 'open' })}`,
  ['#FDF3DE', '#E4F2EC']
);

// 12. 全家福：爸爸妈妈宝宝
const sp12 = makeSvg(
  `<!-- 爸爸 -->
  <ellipse cx='100' cy='280' rx='55' ry='55' fill='#FFE0C9'/>
  <path d='M 50 260 Q 100 220, 150 260 Q 150 240, 100 235 Q 50 240, 50 260' fill='#3A2618'/>
  <circle cx='85' cy='275' r='4' fill='#2a1c14'/>
  <circle cx='115' cy='275' r='4' fill='#2a1c14'/>
  <path d='M 88 295 Q 100 303, 112 295' stroke='#B8514A' stroke-width='2.5' fill='none' stroke-linecap='round'/>
  <rect x='55' y='330' width='90' height='130' rx='20' fill='#4DA6E8'/>
  <!-- 妈妈 -->
  <ellipse cx='300' cy='280' rx='55' ry='55' fill='#FFE0C9'/>
  <path d='M 240 260 Q 300 200, 360 260 L 360 310 Q 300 290, 240 310 Z' fill='#6B3A1A'/>
  <circle cx='285' cy='275' r='4' fill='#2a1c14'/>
  <circle cx='315' cy='275' r='4' fill='#2a1c14'/>
  <path d='M 288 295 Q 300 305, 312 295' stroke='#B8514A' stroke-width='2.5' fill='none' stroke-linecap='round'/>
  <circle cx='272' cy='285' r='8' fill='url(#cheek)'/>
  <circle cx='328' cy='285' r='8' fill='url(#cheek)'/>
  <rect x='255' y='330' width='90' height='130' rx='20' fill='#FF8FA3'/>
  <!-- 宝宝（中间前） -->
  <rect x='170' y='360' width='60' height='100' rx='16' fill='#FFD86F'/>
  ${baby(200, 340, 0.75, { mouth: 'laugh', eyes: 'open' })}
  <!-- 爱心 -->
  <text x='190' y='180' font-size='30'>💛</text>`,
  ['#FFEBD6', '#E6F1FF']
);

export const SAMPLE_PHOTOS: Photo[] = [
  { id: 'sp1',  src: sp1,  width: 400, height: 500, ratio: 0.8 },
  { id: 'sp2',  src: sp2,  width: 400, height: 500, ratio: 0.8 },
  { id: 'sp3',  src: sp3,  width: 400, height: 500, ratio: 0.8 },
  { id: 'sp4',  src: sp4,  width: 400, height: 500, ratio: 0.8 },
  { id: 'sp5',  src: sp5,  width: 400, height: 500, ratio: 0.8 },
  { id: 'sp6',  src: sp6,  width: 400, height: 500, ratio: 0.8 },
  { id: 'sp7',  src: sp7,  width: 400, height: 500, ratio: 0.8 },
  { id: 'sp8',  src: sp8,  width: 400, height: 500, ratio: 0.8 },
  { id: 'sp9',  src: sp9,  width: 400, height: 500, ratio: 0.8 },
  { id: 'sp10', src: sp10, width: 400, height: 500, ratio: 0.8 },
  { id: 'sp11', src: sp11, width: 400, height: 500, ratio: 0.8 },
  { id: 'sp12', src: sp12, width: 400, height: 500, ratio: 0.8 },
];

/* ============================================================
 *  10 个模板专属封面图
 *  每张都：
 *   1) 主题鲜明（与模板风格一致的场景 / 色彩 / 装饰）
 *   2) 一定包含 Q 版宝宝形象（让"封面带宝宝照片"成立）
 *   3) 构图竖版 400x500，适配 3:4 画册封面
 * ============================================================ */

/** 构图增强版 SVG 生成器（提供更多自定义：背景渐变 + 装饰层） */
function makeCoverSvg(
  inner: string,
  bg: { from: string; to: string },
  direction: 'v' | 'd' = 'v'
): string {
  const gradient =
    direction === 'v'
      ? `<linearGradient id='cbg' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='${bg.from}'/><stop offset='100%' stop-color='${bg.to}'/></linearGradient>`
      : `<linearGradient id='cbg' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${bg.from}'/><stop offset='100%' stop-color='${bg.to}'/></linearGradient>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500' width='400' height='500'>
    <defs>
      ${gradient}
      <radialGradient id='cheek' cx='0.5' cy='0.5' r='0.5'>
        <stop offset='0%' stop-color='#ff9aa8' stop-opacity='0.8'/>
        <stop offset='100%' stop-color='#ff9aa8' stop-opacity='0'/>
      </radialGradient>
    </defs>
    <rect width='400' height='500' fill='url(#cbg)'/>
    ${inner}
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 1. 水彩温馨 —— 粉橙晕染，宝宝抱花束，手写标签
const coverWatercolor = makeCoverSvg(
  `<!-- 水彩晕染色斑 -->
  <ellipse cx='80' cy='120' rx='120' ry='80' fill='#FFB895' opacity='0.55'/>
  <ellipse cx='340' cy='420' rx='130' ry='90' fill='#F6A99B' opacity='0.5'/>
  <ellipse cx='320' cy='80' rx='70' ry='45' fill='#FFD6C4' opacity='0.7'/>
  <!-- 装饰叶子/花 -->
  <g opacity='0.85'>
    <circle cx='70' cy='70' r='10' fill='#F3A683'/>
    <circle cx='100' cy='55' r='6' fill='#F8C291'/>
    <circle cx='55' cy='95' r='6' fill='#F8C291'/>
    <circle cx='355' cy='470' r='12' fill='#E55039'/>
    <circle cx='330' cy='485' r='7' fill='#F3A683'/>
  </g>
  <!-- 宝宝身体（抱着花束） -->
  <rect x='150' y='280' width='100' height='160' rx='30' fill='#FFD6C4'/>
  <!-- 花束 -->
  <g>
    <circle cx='200' cy='305' r='14' fill='#E55039'/>
    <circle cx='180' cy='315' r='10' fill='#F78FB3'/>
    <circle cx='220' cy='315' r='10' fill='#FFC57F'/>
    <path d='M 195 320 Q 195 360, 175 390' stroke='#6B9A5A' stroke-width='3' fill='none'/>
    <path d='M 205 320 Q 205 360, 225 390' stroke='#6B9A5A' stroke-width='3' fill='none'/>
    <ellipse cx='170' cy='370' rx='10' ry='5' fill='#8BB178' transform='rotate(-30 170 370)'/>
    <ellipse cx='232' cy='370' rx='10' ry='5' fill='#8BB178' transform='rotate(30 232 370)'/>
  </g>
  ${baby(200, 210, 1.0, { mouth: 'smile', eyes: 'closed' })}
  <!-- 手写斜贴小标签 -->
  <g transform='rotate(-4 75 220)'>
    <rect x='25' y='210' width='100' height='24' rx='2' fill='#FFF8F0' stroke='#E76F51' stroke-width='1.2'/>
    <text x='40' y='228' font-size='14' font-family='Caveat, cursive' fill='#E76F51'>with love</text>
  </g>`,
  { from: '#FFE5D0', to: '#FFF3E6' }
);

// 2. 手绘童趣 —— 薄荷绿嫩黄，宝宝坐在云朵上翻绘本
const coverHandSketch = makeCoverSvg(
  `<!-- 云朵 -->
  <ellipse cx='200' cy='400' rx='160' ry='50' fill='#FFFFFF' opacity='0.9'/>
  <ellipse cx='130' cy='390' rx='60' ry='25' fill='#FFFFFF' opacity='0.9'/>
  <ellipse cx='280' cy='390' rx='60' ry='25' fill='#FFFFFF' opacity='0.9'/>
  <!-- 太阳 -->
  <circle cx='340' cy='80' r='32' fill='#F2C94C'/>
  <g stroke='#E5B936' stroke-width='3' stroke-linecap='round'>
    <line x1='340' y1='30' x2='340' y2='45'/>
    <line x1='290' y1='80' x2='305' y2='80'/>
    <line x1='385' y1='50' x2='372' y2='60'/>
  </g>
  <!-- 叶子装饰 -->
  <g fill='#6BAF6E' opacity='0.7'>
    <ellipse cx='50' cy='140' rx='14' ry='7' transform='rotate(-30 50 140)'/>
    <ellipse cx='70' cy='160' rx='10' ry='5' transform='rotate(30 70 160)'/>
    <ellipse cx='350' cy='200' rx='14' ry='7' transform='rotate(40 350 200)'/>
  </g>
  <!-- 宝宝身体 -->
  <rect x='160' y='310' width='80' height='90' rx='22' fill='#C8E6D6'/>
  <!-- 小绘本 -->
  <path d='M 140 380 L 200 370 L 260 380 L 260 410 L 200 400 L 140 410 Z' fill='#FFFBE8' stroke='#E5B936' stroke-width='2'/>
  <line x1='200' y1='370' x2='200' y2='400' stroke='#C9B067' stroke-width='1.5'/>
  <text x='155' y='395' font-size='8' fill='#6BAF6E'>ABC</text>
  <text x='215' y='395' font-size='8' fill='#E76F51'>123</text>
  ${baby(200, 230, 1.05, { mouth: 'laugh', eyes: 'open' })}
  <!-- 铅笔 -->
  <g transform='rotate(-20 80 310)'>
    <rect x='60' y='305' width='50' height='10' fill='#F2C94C'/>
    <polygon points='110,305 120,310 110,315' fill='#E5B936'/>
    <rect x='55' y='305' width='8' height='10' fill='#E76F51'/>
  </g>`,
  { from: '#DCF0D4', to: '#FBFDEF' }
);

// 3. 糖果卡通 —— 桃粉天蓝撞色，宝宝头戴生日帽+气球
const coverCandy = makeCoverSvg(
  `<!-- 撞色圆斑 -->
  <circle cx='50' cy='80' r='70' fill='#FFB0CC' opacity='0.8'/>
  <circle cx='360' cy='120' r='55' fill='#A8DCFF' opacity='0.8'/>
  <circle cx='70' cy='430' r='50' fill='#A8DCFF' opacity='0.6'/>
  <circle cx='340' cy='440' r='60' fill='#FFB0CC' opacity='0.6'/>
  <!-- 条纹边 -->
  <rect x='0' y='0' width='400' height='14' fill='url(#cbg)'/>
  <g>
    <rect x='0' y='0' width='40' height='14' fill='#FF5C8A'/>
    <rect x='80' y='0' width='40' height='14' fill='#3BB4E8'/>
    <rect x='160' y='0' width='40' height='14' fill='#FFD93D'/>
    <rect x='240' y='0' width='40' height='14' fill='#FF5C8A'/>
    <rect x='320' y='0' width='40' height='14' fill='#3BB4E8'/>
  </g>
  <!-- 气球 -->
  <ellipse cx='110' cy='130' rx='26' ry='32' fill='#FF5C8A'/>
  <ellipse cx='290' cy='140' rx='26' ry='32' fill='#3BB4E8'/>
  <line x1='110' y1='162' x2='160' y2='300' stroke='#999' stroke-width='1.5'/>
  <line x1='290' y1='172' x2='240' y2='300' stroke='#999' stroke-width='1.5'/>
  <!-- 宝宝身体 -->
  <rect x='150' y='310' width='100' height='150' rx='32' fill='#FFD86F'/>
  <path d='M 150 360 Q 200 380, 250 360' stroke='#FF5C8A' stroke-width='4' fill='none'/>
  <!-- 派对帽 -->
  <path d='M 170 160 L 230 160 L 200 80 Z' fill='#FF5C8A'/>
  <circle cx='200' cy='78' r='10' fill='#FFD93D'/>
  <circle cx='200' cy='78' r='4' fill='#fff'/>
  ${baby(200, 225, 1.1, { mouth: 'laugh', eyes: 'star' })}
  <!-- 糖果/星星 -->
  <text x='40' y='280' font-size='22'>🍭</text>
  <text x='340' y='300' font-size='22'>⭐</text>`,
  { from: '#FFE3EE', to: '#E8F4FF' },
  'd'
);

// 4. 小动物朋友 —— 亮黄藏青撞色，宝宝与小熊兔子
const coverAnimals = makeCoverSvg(
  `<!-- 背景圆点 -->
  <circle cx='70' cy='70' r='40' fill='#FFD770'/>
  <circle cx='340' cy='90' r='30' fill='#FF7043' opacity='0.7'/>
  <circle cx='70' cy='430' r='40' fill='#FF7043' opacity='0.6'/>
  <circle cx='340' cy='450' r='35' fill='#FFD770'/>
  <!-- 草地 -->
  <path d='M 0 430 Q 100 410, 200 430 T 400 430 L 400 500 L 0 500 Z' fill='#6BAF6E'/>
  <!-- 小熊（左） -->
  <g>
    <circle cx='110' cy='330' r='32' fill='#C58A5C'/>
    <circle cx='90' cy='305' r='12' fill='#C58A5C'/>
    <circle cx='130' cy='305' r='12' fill='#C58A5C'/>
    <circle cx='90' cy='305' r='5' fill='#7A4A2A'/>
    <circle cx='130' cy='305' r='5' fill='#7A4A2A'/>
    <ellipse cx='110' cy='335' rx='18' ry='15' fill='#F2D2AD'/>
    <circle cx='102' cy='328' r='3' fill='#2a1c14'/>
    <circle cx='118' cy='328' r='3' fill='#2a1c14'/>
    <ellipse cx='110' cy='342' rx='3' ry='2' fill='#2a1c14'/>
    <path d='M 110 346 Q 105 354, 100 352' stroke='#2a1c14' stroke-width='1.5' fill='none'/>
    <path d='M 110 346 Q 115 354, 120 352' stroke='#2a1c14' stroke-width='1.5' fill='none'/>
  </g>
  <!-- 小兔（右） -->
  <g>
    <ellipse cx='310' cy='340' rx='28' ry='28' fill='#FFF'/>
    <ellipse cx='298' cy='298' rx='7' ry='20' fill='#FFF'/>
    <ellipse cx='322' cy='298' rx='7' ry='20' fill='#FFF'/>
    <ellipse cx='298' cy='300' rx='3' ry='12' fill='#FFB0CC'/>
    <ellipse cx='322' cy='300' rx='3' ry='12' fill='#FFB0CC'/>
    <circle cx='302' cy='335' r='3' fill='#2a1c14'/>
    <circle cx='318' cy='335' r='3' fill='#2a1c14'/>
    <circle cx='310' cy='345' r='3' fill='#FF7043'/>
    <path d='M 306 350 Q 310 354, 314 350' stroke='#2a1c14' stroke-width='1.5' fill='none'/>
  </g>
  <!-- 宝宝（中间） -->
  <rect x='170' y='310' width='60' height='110' rx='18' fill='#2E4E8A'/>
  ${baby(200, 240, 1.0, { mouth: 'laugh', eyes: 'open' })}
  <!-- 花 -->
  <g>
    <circle cx='40' cy='460' r='6' fill='#FF7043'/>
    <circle cx='40' cy='460' r='2' fill='#FFD93D'/>
    <circle cx='360' cy='470' r='7' fill='#FFD93D'/>
    <circle cx='360' cy='470' r='2' fill='#FF7043'/>
  </g>`,
  { from: '#FFF7D6', to: '#FFE2C9' }
);

// 5. 清新极简 —— 大片留白 + 一抹正红 + 宝宝单人黑白肖像
const coverMinimal = makeCoverSvg(
  `<!-- 右上红色小圆点 -->
  <circle cx='360' cy='50' r='8' fill='#C8342B'/>
  <!-- 底部红色细线 -->
  <line x1='40' y1='440' x2='140' y2='440' stroke='#C8342B' stroke-width='2'/>
  <!-- 极细灰边框 -->
  <rect x='30' y='30' width='340' height='440' fill='none' stroke='#1A1A1A' stroke-opacity='0.08' stroke-width='1'/>
  <!-- 宝宝灰调肖像（身体圆 + 头） -->
  <g>
    <rect x='160' y='290' width='80' height='150' rx='22' fill='#6F6F6F'/>
  </g>
  ${baby(200, 220, 1.1, { mouth: 'flat', eyes: 'open' })}
  <!-- 极细线装饰 -->
  <line x1='60' y1='100' x2='130' y2='100' stroke='#1A1A1A' stroke-opacity='0.3' stroke-width='0.8'/>`,
  { from: '#F4F1EB', to: '#FDFCF8' }
);

// 6. 晴空旅行 —— 地中海深青沙黄，宝宝站在帆船上
const coverTravel = makeCoverSvg(
  `<!-- 海 -->
  <rect x='0' y='300' width='400' height='200' fill='#0E5A6E'/>
  <path d='M 0 320 Q 100 300, 200 320 T 400 320' stroke='#5FA0B0' stroke-width='2' fill='none'/>
  <path d='M 0 360 Q 100 340, 200 360 T 400 360' stroke='#5FA0B0' stroke-width='2' fill='none'/>
  <!-- 太阳 -->
  <circle cx='320' cy='100' r='35' fill='#E4B363'/>
  <!-- 云 -->
  <ellipse cx='80' cy='90' rx='34' ry='10' fill='#FFF' opacity='0.85'/>
  <ellipse cx='120' cy='80' rx='22' ry='8' fill='#FFF' opacity='0.85'/>
  <!-- 海鸥 -->
  <path d='M 60 180 q 10 -8 20 0 q 10 -8 20 0' stroke='#0E2A33' stroke-width='2' fill='none'/>
  <path d='M 280 150 q 8 -6 16 0 q 8 -6 16 0' stroke='#0E2A33' stroke-width='2' fill='none'/>
  <!-- 帆船 -->
  <path d='M 130 340 L 270 340 L 250 380 L 150 380 Z' fill='#FBFAF3'/>
  <rect x='198' y='240' width='4' height='100' fill='#5A3A1E'/>
  <path d='M 200 240 L 260 320 L 200 320 Z' fill='#E4B363'/>
  <path d='M 200 240 L 145 320 L 200 320 Z' fill='#FBFAF3'/>
  <!-- 宝宝在船上 -->
  <rect x='170' y='280' width='60' height='70' rx='14' fill='#E4B363'/>
  ${baby(200, 225, 0.9, { mouth: 'smile', eyes: 'open' })}`,
  { from: '#BEDAE0', to: '#FBFAF3' }
);

// 7. 复古胶片 —— 深棕背景 + 白边 Polaroid 包裹宝宝
const coverVintage = makeCoverSvg(
  `<!-- 漏光 -->
  <circle cx='380' cy='60' r='80' fill='#D4A24C' opacity='0.25'/>
  <!-- 胶片孔 -->
  <g fill='#D4A24C' opacity='0.5'>
    <rect x='20' y='40' width='10' height='14' rx='1'/>
    <rect x='20' y='80' width='10' height='14' rx='1'/>
    <rect x='20' y='120' width='10' height='14' rx='1'/>
    <rect x='20' y='380' width='10' height='14' rx='1'/>
    <rect x='20' y='420' width='10' height='14' rx='1'/>
    <rect x='20' y='460' width='10' height='14' rx='1'/>
    <rect x='370' y='40' width='10' height='14' rx='1'/>
    <rect x='370' y='80' width='10' height='14' rx='1'/>
    <rect x='370' y='420' width='10' height='14' rx='1'/>
    <rect x='370' y='460' width='10' height='14' rx='1'/>
  </g>
  <!-- Polaroid 1 (左) -->
  <g transform='rotate(-8 120 240)'>
    <rect x='60' y='170' width='120' height='150' fill='#F2E7D0'/>
    <rect x='68' y='178' width='104' height='104' fill='#5A3A1E'/>
    <!-- 小宝宝图像 1 -->
    <circle cx='120' cy='230' r='26' fill='#E9D8B3'/>
    <path d='M 98 218 Q 120 200, 142 218 Q 138 210, 120 208 Q 102 210, 98 218' fill='#3A2618'/>
    <circle cx='112' cy='230' r='2.5' fill='#2a1c14'/>
    <circle cx='128' cy='230' r='2.5' fill='#2a1c14'/>
    <path d='M 112 244 Q 120 250, 128 244' stroke='#B8514A' stroke-width='2' fill='none'/>
    <text x='82' y='304' font-size='11' font-family='Courier New, monospace' fill='#5A3A1E'>1995 · 03</text>
  </g>
  <!-- Polaroid 2 (右前) -->
  <g transform='rotate(6 280 300)'>
    <rect x='220' y='230' width='130' height='160' fill='#FFFEF7'/>
    <rect x='228' y='238' width='114' height='114' fill='#3D2F22'/>
    <circle cx='285' cy='290' r='30' fill='#E9D8B3'/>
    <path d='M 260 278 Q 285 258, 310 278 Q 305 270, 285 268 Q 265 270, 260 278' fill='#6B3A1A'/>
    <circle cx='277' cy='292' r='3' fill='#2a1c14'/>
    <circle cx='293' cy='292' r='3' fill='#2a1c14'/>
    <path d='M 275 308 Q 285 316, 295 308' stroke='#B8514A' stroke-width='2.5' fill='none'/>
    <circle cx='268' cy='298' r='4' fill='#D4A24C' opacity='0.5'/>
    <circle cx='302' cy='298' r='4' fill='#D4A24C' opacity='0.5'/>
    <text x='240' y='376' font-size='12' font-family='Courier New, monospace' fill='#5A3A1E'>MEMORIES</text>
  </g>
  <!-- 底部胶片片号 -->
  <text x='90' y='472' font-size='10' font-family='Courier New, monospace' fill='#D4A24C' letter-spacing='3'>ROLL · 001 · 24EXP</text>`,
  { from: '#1F1A16', to: '#2B2320' }
);

// 8. 牛皮纸笔记 —— 米黄纸 + 墨笔画的宝宝+便签
const coverOldPaper = makeCoverSvg(
  `<!-- 纸纹 -->
  <rect x='0' y='0' width='400' height='500' fill='url(#cbg)'/>
  <g opacity='0.12'>
    <line x1='0' y1='40' x2='400' y2='40' stroke='#5A3A1E' stroke-width='1'/>
    <line x1='0' y1='80' x2='400' y2='80' stroke='#5A3A1E' stroke-width='1'/>
    <line x1='0' y1='120' x2='400' y2='120' stroke='#5A3A1E' stroke-width='1'/>
    <line x1='0' y1='160' x2='400' y2='160' stroke='#5A3A1E' stroke-width='1'/>
    <line x1='0' y1='200' x2='400' y2='200' stroke='#5A3A1E' stroke-width='1'/>
    <line x1='0' y1='240' x2='400' y2='240' stroke='#5A3A1E' stroke-width='1'/>
    <line x1='0' y1='280' x2='400' y2='280' stroke='#5A3A1E' stroke-width='1'/>
    <line x1='0' y1='320' x2='400' y2='320' stroke='#5A3A1E' stroke-width='1'/>
    <line x1='0' y1='360' x2='400' y2='360' stroke='#5A3A1E' stroke-width='1'/>
    <line x1='0' y1='400' x2='400' y2='400' stroke='#5A3A1E' stroke-width='1'/>
    <line x1='0' y1='440' x2='400' y2='440' stroke='#5A3A1E' stroke-width='1'/>
  </g>
  <!-- 胶带 -->
  <rect x='100' y='40' width='80' height='22' fill='#A0522D' opacity='0.5' transform='rotate(-6 140 51)'/>
  <rect x='250' y='50' width='70' height='20' fill='#A0522D' opacity='0.5' transform='rotate(5 285 60)'/>
  <!-- 墨线手绘宝宝（主体） -->
  <g stroke='#3E2A14' stroke-width='2' fill='none' stroke-linecap='round'>
    <!-- 身体轮廓 -->
    <path d='M 150 330 Q 150 280, 180 270 L 220 270 Q 250 280, 250 330 L 250 420 L 150 420 Z'/>
    <!-- 头 -->
    <circle cx='200' cy='230' r='50' fill='#ECD9B2'/>
    <!-- 刘海 -->
    <path d='M 160 210 Q 200 175, 240 210 Q 230 195, 200 193 Q 170 195, 160 210' fill='#3E2A14' stroke='none'/>
    <circle cx='185' cy='232' r='3' fill='#3E2A14'/>
    <circle cx='215' cy='232' r='3' fill='#3E2A14'/>
    <path d='M 188 250 Q 200 258, 212 250'/>
  </g>
  <!-- 标签贴纸 -->
  <g transform='rotate(-3 100 350)'>
    <rect x='30' y='330' width='140' height='48' fill='#FFF4DA' stroke='#5A3A1E' stroke-width='1'/>
    <text x='40' y='352' font-size='14' font-family='Courier New, monospace' fill='#5A3A1E' font-weight='bold'>GROWTH</text>
    <text x='40' y='370' font-size='10' font-family='Courier New, monospace' fill='#5A3A1E'>Day 001 · 3kg</text>
  </g>
  <!-- 签名 -->
  <text x='260' y='460' font-size='18' font-family='Caveat, cursive' fill='#5A3A1E' font-style='italic'>— dear baby</text>`,
  { from: '#ECD9B2', to: '#D8C29D' }
);

// 9. 新年中国红 —— 红金 + 灯笼 + 宝宝穿唐装抱福字
const coverNewYear = makeCoverSvg(
  `<!-- 金色云纹背景 -->
  <g fill='#D4A017' opacity='0.25'>
    <circle cx='60' cy='60' r='30'/>
    <circle cx='90' cy='50' r='22'/>
    <circle cx='340' cy='450' r='30'/>
    <circle cx='310' cy='460' r='22'/>
  </g>
  <!-- 灯笼 -->
  <g>
    <!-- 左灯笼 -->
    <ellipse cx='70' cy='150' rx='32' ry='40' fill='#B71C1C'/>
    <rect x='60' y='110' width='20' height='6' fill='#D4A017'/>
    <rect x='60' y='184' width='20' height='6' fill='#D4A017'/>
    <line x1='70' y1='110' x2='70' y2='70' stroke='#D4A017' stroke-width='1.5'/>
    <path d='M 70 190 L 66 210 L 74 210 Z' fill='#D4A017'/>
    <text x='61' y='156' font-size='22' fill='#D4A017' font-family='STKaiti, serif' font-weight='bold'>福</text>
    <!-- 右灯笼 -->
    <ellipse cx='330' cy='130' rx='28' ry='36' fill='#B71C1C'/>
    <rect x='322' y='94' width='16' height='5' fill='#D4A017'/>
    <rect x='322' y='162' width='16' height='5' fill='#D4A017'/>
    <line x1='330' y1='94' x2='330' y2='60' stroke='#D4A017' stroke-width='1.5'/>
    <path d='M 330 167 L 327 184 L 333 184 Z' fill='#D4A017'/>
  </g>
  <!-- 宝宝（唐装） -->
  <rect x='150' y='290' width='100' height='170' rx='18' fill='#B71C1C'/>
  <!-- 唐装盘扣 -->
  <circle cx='200' cy='320' r='5' fill='#D4A017'/>
  <circle cx='200' cy='345' r='5' fill='#D4A017'/>
  <circle cx='200' cy='370' r='5' fill='#D4A017'/>
  <!-- 衣领 -->
  <path d='M 170 290 Q 200 310, 230 290 L 230 310 Q 200 330, 170 310 Z' fill='#D4A017'/>
  <!-- 福字卡片 -->
  <g transform='rotate(6 200 400)'>
    <rect x='170' y='375' width='60' height='60' fill='#D4A017' stroke='#B71C1C' stroke-width='2'/>
    <text x='180' y='418' font-size='36' fill='#B71C1C' font-family='STKaiti, serif' font-weight='bold'>福</text>
  </g>
  ${baby(200, 225, 1.05, { mouth: 'laugh', eyes: 'open', hairColor: '#2a1c14' })}
  <!-- 头顶小虎帽 -->
  <path d='M 155 175 Q 200 150, 245 175 Q 240 160, 200 155 Q 160 160, 155 175' fill='#B71C1C'/>
  <circle cx='175' cy='168' r='5' fill='#D4A017'/>
  <circle cx='225' cy='168' r='5' fill='#D4A017'/>`,
  { from: '#FFD9C4', to: '#FFF6EF' }
);

// 10. 圣诞之夜 —— 深松绿 + 金雪花 + 宝宝戴圣诞帽
const coverChristmas = makeCoverSvg(
  `<!-- 金雪花 -->
  <g fill='#F2C94C'>
    <text x='40' y='60' font-size='18'>❄</text>
    <text x='340' y='80' font-size='14'>❄</text>
    <text x='60' y='180' font-size='12'>❄</text>
    <text x='330' y='220' font-size='16'>❄</text>
    <text x='40' y='400' font-size='14'>❄</text>
    <text x='350' y='440' font-size='18'>❄</text>
    <text x='180' y='70' font-size='10'>❄</text>
    <text x='300' y='140' font-size='10'>❄</text>
  </g>
  <!-- 圣诞树 -->
  <g transform='translate(320 200)'>
    <polygon points='0,80 -30,40 -20,40 -40,0 -20,0 -35,-40 35,-40 20,0 40,0 20,40 30,40' fill='#0E3B24' stroke='#F2C94C' stroke-width='1.5'/>
    <rect x='-8' y='80' width='16' height='14' fill='#5A3A1E'/>
    <circle cx='-15' cy='20' r='4' fill='#E63946'/>
    <circle cx='12' cy='0' r='4' fill='#F2C94C'/>
    <circle cx='0' cy='-20' r='3' fill='#E63946'/>
    <text x='-10' y='-38' font-size='14' fill='#F2C94C'>✦</text>
  </g>
  <g transform='translate(80 240)'>
    <polygon points='0,60 -20,30 -14,30 -28,0 -14,0 -25,-30 25,-30 14,0 28,0 14,30 20,30' fill='#0E3B24' stroke='#F2C94C' stroke-width='1'/>
    <rect x='-6' y='60' width='12' height='10' fill='#5A3A1E'/>
    <circle cx='-10' cy='10' r='3' fill='#E63946'/>
    <circle cx='10' cy='-10' r='3' fill='#F2C94C'/>
  </g>
  <!-- 礼物盒 -->
  <g transform='translate(140 410)'>
    <rect x='0' y='0' width='50' height='40' fill='#E63946'/>
    <rect x='22' y='0' width='6' height='40' fill='#F2C94C'/>
    <rect x='0' y='18' width='50' height='6' fill='#F2C94C'/>
    <path d='M 16 0 Q 20 -12, 25 0 Q 30 -12, 34 0' fill='#F2C94C'/>
  </g>
  <g transform='translate(220 425)'>
    <rect x='0' y='0' width='40' height='30' fill='#F2C94C'/>
    <rect x='17' y='0' width='6' height='30' fill='#E63946'/>
    <rect x='0' y='13' width='40' height='5' fill='#E63946'/>
  </g>
  <!-- 宝宝 -->
  <rect x='160' y='290' width='80' height='130' rx='22' fill='#E63946'/>
  <!-- 白毛边 -->
  <rect x='160' y='410' width='80' height='12' fill='#FFFFFF'/>
  <circle cx='170' cy='310' r='4' fill='#F2C94C'/>
  ${baby(200, 225, 1.05, { mouth: 'laugh', eyes: 'open' })}
  <!-- 圣诞帽 -->
  <path d='M 160 175 Q 200 180, 240 175 L 250 150 Q 215 140, 205 160 Q 195 100, 175 130 Q 160 155, 160 175' fill='#E63946'/>
  <ellipse cx='160' cy='175' rx='42' ry='9' fill='#FFFFFF'/>
  <circle cx='252' cy='152' r='9' fill='#FFFFFF'/>`,
  { from: '#0E3B24', to: '#133E29' }
);

/**
 * 模板 id → 专属封面图 src
 */
export const TEMPLATE_COVER_PHOTOS: Record<string, string> = {
  tpl_warm_watercolor: coverWatercolor,
  tpl_hand_sketch: coverHandSketch,
  tpl_candy_cartoon: coverCandy,
  tpl_animal_friends: coverAnimals,
  tpl_minimal_fresh: coverMinimal,
  tpl_sky_travel: coverTravel,
  tpl_vintage_film: coverVintage,
  tpl_old_paper: coverOldPaper,
  tpl_newyear_red: coverNewYear,
  tpl_christmas: coverChristmas,
};

/**
 * 根据模板 id 返回专属封面 Photo，若不存在则退回到 SAMPLE_PHOTOS[0]
 */
export function getCoverPhotoForTemplate(templateId: string): Photo {
  const src = TEMPLATE_COVER_PHOTOS[templateId];
  if (src) {
    return {
      id: `cover-${templateId}`,
      src,
      width: 400,
      height: 500,
      ratio: 0.8,
    };
  }
  return SAMPLE_PHOTOS[0];
}
