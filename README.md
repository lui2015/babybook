# 🐣 BabyBook · 宝宝画册

基于 PRD [宝宝画册产品需求文档.md](./宝宝画册产品需求文档.md) 的 MVP 实现。

一款"一键把宝宝照片生成精美画册"的 Web 应用，所有图片都在浏览器本地处理，不上传服务器。

## ✨ 功能

- **F1 照片上传**：拖拽 / 点击上传，自动压缩、限制 6–60 张
- **F2 模板选择（10 款 × 5 大分类）**：温馨手绘、萌趣卡通、清新文艺、复古胶片、节日主题
- **F3 智能自动排版**：根据照片横竖比、数量自动匹配 7 种版式（封面、单图、双图、三图、九宫格、文字页、尾页）
- **F4 画册预览**：翻页浏览、缩略图导航
- **F5 我的画册**：IndexedDB 本地存储、重命名、删除
- **F6 分享导出**：单页 PNG 导出、全册长图导出、分享链接

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

默认启动在 <http://localhost:5173>。

## 🗂 目录结构

```
src/
├── App.tsx                 # 路由入口
├── main.tsx                # React 挂载
├── index.css               # 全局样式 + Tailwind
├── types.ts                # 数据类型定义（Photo / Template / Book 等）
├── templates.ts            # 10 款模板配置
├── layoutEngine.ts         # 智能排版引擎
├── imageUtils.ts           # 图片读取/压缩
├── storage.ts              # IndexedDB 存储封装
├── DraftContext.tsx        # 创建流程的状态 Context
├── components/
│   ├── AppHeader.tsx       # 顶部导航
│   └── PageView.tsx        # 单页画册渲染（支持 7 种版式）
└── pages/
    ├── HomePage.tsx        # 首页
    ├── CreatePage.tsx      # 创建向导（上传→信息→模板→生成）
    ├── BookDetailPage.tsx  # 画册翻阅/导出
    └── MyBooksPage.tsx     # 我的画册列表
```

## 🎨 新增模板

在 `src/templates.ts` 的 `TEMPLATES` 数组中追加一项即可：

```ts
{
  id: 'tpl_xxx',
  name: '模板名称',
  category: '温馨手绘',
  description: '...',
  isFree: true,
  colors: { bg, paper, primary, accent, text },
  fontFamily: { title, body },
  decorations: ['🌸'],
  defaultTitle: '标题',
  defaultSubtitle: 'Subtitle',
}
```

## 🔒 隐私说明

- 所有照片仅在浏览器内处理（压缩至 JPEG dataURL）
- 画册数据通过 IndexedDB 保存在本地
- 完全无后端，不上传任何图片到服务器

## 📝 后续可扩展（PRD 中的非 MVP 范围）

- AI 智能挑图 / AI 文案
- 自定义编辑（更换照片、修改文字）
- 实体画册打印邮寄
- 多人协作共建
- 成长时间轴
