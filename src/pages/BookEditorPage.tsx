import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getBook, saveBook } from '../storage';
import { useTemplateRegistry } from '../TemplateRegistry';
import { PageView } from '../components/PageView';
import { applyBookTheme } from '../bookTheme';
import { VARIANTS, defaultVariantId } from '../layoutVariants';
import { fileToPhoto } from '../imageUtils';
import type { Book, BookPage, PageLayoutType, Photo, PhotoShape, Template } from '../types';

/**
 * 画册全功能编辑器
 *
 * 三栏布局：
 *  - 左：页面缩略图列表（点击切换当前页）
 *  - 中：实时预览（按当前页渲染，已套上用户主题覆盖）
 *  - 右：属性面板（三个 Tab：文字 / 排版 / 主题）
 *
 * 所有修改：
 *  - 即时 setBook，预览立即刷新
 *  - 600ms 防抖落 IndexedDB
 *  - 组件卸载时立即 flush 一次，防止尾帧丢失
 */
export function BookEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getTemplate } = useTemplateRegistry();

  const [book, setBook] = useState<Book | null>(null);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<'text' | 'layout' | 'theme'>('text');
  const [saving, setSaving] = useState<'idle' | 'pending' | 'saved'>('idle');

  // 当前选中的照片（来自预览页内某张 <img>）。
  // - 为 null 时：处于"浏览态"，点击图库照片没有替换目标，只是 hover
  // - 非 null 时：处于"选中态"，点击图库里任意照片即可替换当前页对应 slot 为新图
  // 切页 / 点击空白会清空它
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  // 防抖落库
  const saveTimerRef = useRef<number | null>(null);
  const latestBookRef = useRef<Book | null>(null);

  // —— 点击预览图替换照片 ——
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 记录"本次待替换的 slot 索引"（点击时定位，file 选完后使用）
  const pendingSlotRef = useRef<number | null>(null);
  const [uploading, setUploading] = useState(false);

  // —— 图库批量添加 —— 单独的 input，避免和"替换"的单张上传互相打架
  const addPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [adding, setAdding] = useState(false);

  // 左下「新增页面」弹出版式选择
  const [addPagePickerOpen, setAddPagePickerOpen] = useState(false);

  // —— 左侧页面列表拖拽排序状态 ——
  // dragFromIdx：正在被拖的那一页；null 表示没有拖拽中
  // dragOverIdx：当前鼠标悬停的"插入位"。语义：把被拖页插到这个位置之前；
  //             等于 pages.length 时代表插到末尾
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const scheduleSave = useCallback((next: Book) => {
    latestBookRef.current = next;
    setSaving('pending');
    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const b = latestBookRef.current;
      saveTimerRef.current = null;
      if (!b) return;
      saveBook(b)
        .then(() => setSaving('saved'))
        .catch((e) => {
          console.error('save book failed', e);
          setSaving('idle');
        });
    }, 600);
  }, []);

  const updateBook = useCallback(
    (patch: Partial<Book> | ((prev: Book) => Book)) => {
      setBook((prev) => {
        if (!prev) return prev;
        const next =
          typeof patch === 'function'
            ? (patch as (p: Book) => Book)(prev)
            : ({ ...prev, ...patch, updatedAt: Date.now() } as Book);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  // 加载画册
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getBook(id).then((b) => {
      if (cancelled) return;
      if (!b) {
        navigate('/my', { replace: true });
        return;
      }
      setBook(b);
    });
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // 卸载时立即 flush
  useEffect(() => {
    return () => {
      if (saveTimerRef.current != null && latestBookRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveBook(latestBookRef.current).catch(() => {});
        saveTimerRef.current = null;
      }
    };
  }, []);

  // "已保存" 提示 2s 自动消失
  useEffect(() => {
    if (saving !== 'saved') return;
    const t = window.setTimeout(() => setSaving('idle'), 1500);
    return () => window.clearTimeout(t);
  }, [saving]);

  // 切页时清除选中（选中只对当前页有意义）
  useEffect(() => {
    setSelectedPhotoId(null);
  }, [index]);

  if (!book) {
    return <div className="py-20 text-center text-neutral-500">加载中…</div>;
  }
  const rawTemplate = getTemplate(book.templateId);
  if (!rawTemplate) {
    return <div className="py-20 text-center text-rose-600">模板不存在</div>;
  }
  // 套用用户在 book.theme 上的覆盖
  const template = applyBookTheme(book, rawTemplate);
  const currentPage = book.pages[index];
  const total = book.pages.length;

  /** 仅修改当前页 */
  function patchCurrentPage(patch: Partial<BookPage>) {
    updateBook((prev) => {
      const nextPages = prev.pages.map((p, i) => (i === index ? { ...p, ...patch } : p));
      return { ...prev, pages: nextPages, updatedAt: Date.now() };
    });
  }

  /** 切换当前页版式（会自动调整 photoIds） */
  function changeLayout(layout: PageLayoutType) {
    const required = layoutPhotoCount(layout);
    const { photoIds } = adjustPhotoIds(currentPage.photoIds, required, book!);
    patchCurrentPage({ layout, photoIds, variant: undefined });
  }

  /** 切换当前页变体 */
  function changeVariant(variant: string | undefined) {
    patchCurrentPage({ variant });
  }

  /** 把第 slot 张照片替换为 photoId */
  function replacePhotoAt(slot: number, photoId: string) {
    const next = currentPage.photoIds.slice();
    next[slot] = photoId;
    patchCurrentPage({ photoIds: next });
  }

  /**
   * 设置当前页第 slot 张照片的"相框形状"。
   * shape = undefined 表示恢复版式默认（即 rect），编辑时会从数组中清除。
   */
  function setPhotoShape(slot: number, shape: PhotoShape | undefined) {
    const prevShapes = currentPage.photoShapes ?? [];
    // 补齐到和 photoIds 等长（用 undefined 填充空位）
    const next: (PhotoShape | undefined)[] = Array.from(
      { length: currentPage.photoIds.length },
      (_, i) => prevShapes[i],
    );
    next[slot] = shape;
    // 若整个数组全部为 undefined，则删掉字段保持数据干净
    const clean = next.some((s) => !!s) ? next : undefined;
    patchCurrentPage({ photoShapes: clean });
  }

  /**
   * 取被选中照片在当前页的 slot 下标。
   * 同一张图出现在多个 slot 时取第一个（极少见）。
   * selectedPhotoId 为空或不在当前页时返回 -1。
   */
  function selectedSlot(): number {
    if (!selectedPhotoId) return -1;
    return currentPage.photoIds.indexOf(selectedPhotoId);
  }

  /**
   * 触发"上传替换"：从选中工具条或图库里的「上传新图」按钮调用。
   * 用 pendingSlotRef 记下目标 slot，让隐藏的 fileInput 完成选图后知道替到哪个位置。
   */
  function triggerUploadReplace() {
    const slot = selectedSlot();
    if (slot < 0) return;
    pendingSlotRef.current = slot;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  /** 图库中点选一张已有照片 → 替换当前页选中 slot（若有） */
  function handlePickFromLibrary(photoId: string) {
    const slot = selectedSlot();
    if (slot < 0) return;
    if (photoId === selectedPhotoId) return; // 点了自己，无操作
    replacePhotoAt(slot, photoId);
    // 选中标识同步更新为替换后的照片，保持选中态延续
    setSelectedPhotoId(photoId);
  }

  /** 打开批量上传选图 */
  function openAddPhotos() {
    if (addPhotoInputRef.current) {
      addPhotoInputRef.current.value = '';
      addPhotoInputRef.current.click();
    }
  }

  /** 批量把文件添加到 book.photos 末尾 */
  async function handleAddPhotosChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setAdding(true);
    try {
      const added: Photo[] = [];
      for (const f of files) {
        try {
          added.push(await fileToPhoto(f));
        } catch (err) {
          console.warn('添加图片失败', f.name, err);
        }
      }
      if (added.length === 0) return;
      updateBook((prev) => ({
        ...prev,
        photos: [...prev.photos, ...added],
        updatedAt: Date.now(),
      }));
    } finally {
      setAdding(false);
    }
  }

  /**
   * 从图库删除一张照片：
   * - 若被当前 book 的某些页引用，先 confirm（告知被引用的页数）
   * - 确认后：从 book.photos 移除；同时把该 id 从所有页的 photoIds 中剔除
   *   （数组变短，页面会自动降级到更少图的版式，相当于 slot 留空）
   * - 若正好删的是当前选中那张，清除选中态
   */
  function handleDeletePhoto(photoId: string) {
    const usedBy = book!.pages.reduce(
      (acc, p) => acc + (p.photoIds.includes(photoId) ? 1 : 0),
      0,
    );
    if (usedBy > 0) {
      if (
        !confirm(
          `这张照片正在被 ${usedBy} 个页面使用，删除后这些页面对应的图位会变空。\n确认删除？`,
        )
      ) {
        return;
      }
    } else if (!confirm('确认从图库删除这张照片吗？')) {
      return;
    }
    updateBook((prev) => {
      const nextPhotos = prev.photos.filter((p) => p.id !== photoId);
      const nextPages = prev.pages.map((p) => {
        if (!p.photoIds.includes(photoId)) return p;
        const filtered = p.photoIds.filter((id) => id !== photoId);
        return { ...p, photoIds: filtered };
      });
      return { ...prev, photos: nextPhotos, pages: nextPages, updatedAt: Date.now() };
    });
    if (selectedPhotoId === photoId) setSelectedPhotoId(null);
  }

  /** 文件选择后：压缩 → push 到 book.photos → 替换当前页 slot */
  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const slot = pendingSlotRef.current;
    pendingSlotRef.current = null;
    if (slot == null) return;

    setUploading(true);
    try {
      const newPhoto: Photo = await fileToPhoto(file);
      updateBook((prev) => {
        const nextPages = prev.pages.map((p, i) => {
          if (i !== index) return p;
          const nextIds = p.photoIds.slice();
          nextIds[slot] = newPhoto.id;
          return { ...p, photoIds: nextIds };
        });
        return {
          ...prev,
          photos: [...prev.photos, newPhoto],
          pages: nextPages,
          updatedAt: Date.now(),
        };
      });
      // 替换后让选中态继续指向新照片
      setSelectedPhotoId(newPhoto.id);
    } catch (err) {
      console.error('替换照片失败', err);
      alert('替换失败，请重试或换一张图片');
    } finally {
      setUploading(false);
    }
  }

  /** 整页重洗：从头取前 N 张 */
  function reshufflePagePhotos(pickIds: string[]) {
    patchCurrentPage({ photoIds: pickIds });
  }

  /**
   * 在指定位置后插入一页。
   * - layout：新页版式（默认 'single'）
   * - 自动用未使用 / 可复用的照片补齐 photoIds（无照片时留空）
   * 插入后自动跳到新页
   */
  function addPageAfter(afterIndex: number, layout: PageLayoutType = 'single') {
    const required = layoutPhotoCount(layout);
    const { photoIds } = adjustPhotoIds([], required, book!);
    const newPage: BookPage = {
      id: newPageId(),
      layout,
      photoIds,
      ...(layout === 'text' ? { title: '新的一页', caption: '' } : {}),
      ...(layout === 'cover' ? { title: book!.title, subtitle: book!.dateRange } : {}),
      ...(layout === 'ending' ? { title: '致最爱的你', caption: '' } : {}),
    };
    updateBook((prev) => {
      const next = prev.pages.slice();
      next.splice(afterIndex + 1, 0, newPage);
      return { ...prev, pages: next, updatedAt: Date.now() };
    });
    // 跳到新页
    setIndex(afterIndex + 1);
  }

  /** 删除某一页；保留至少 1 页 */
  function deletePageAt(target: number) {
    if (total <= 1) {
      alert('至少要保留 1 页哦');
      return;
    }
    const p = book!.pages[target];
    if (!p) return;
    const label = layoutLabel(p.layout);
    if (!confirm(`确定要删除第 ${target + 1} 页（${label}）吗？此操作不可撤销`)) return;
    updateBook((prev) => {
      const next = prev.pages.filter((_, i) => i !== target);
      return { ...prev, pages: next, updatedAt: Date.now() };
    });
    // 收缩当前页索引
    setIndex((cur) => {
      if (target < cur) return cur - 1;
      if (target === cur) return Math.max(0, cur - 1);
      return cur;
    });
  }

  function backToDetail() {
    // 手动 flush 再回退
    if (saveTimerRef.current != null && latestBookRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      saveBook(latestBookRef.current).finally(() => navigate(`/book/${book!.id}`));
    } else {
      navigate(`/book/${book!.id}`);
    }
  }

  /**
   * 把第 from 页移动到 targetInsertIdx 位置（targetInsertIdx 语义：移除 from 之前的下标，
   * 表示"插到数组原第 targetInsertIdx 个元素之前"；等于数组长度时插到末尾）。
   *
   * 会同步更新 index，使当前选中页始终跟随用户拖动的那一页 —— 拖的就是当前页时，
   * 选中页跟着走；拖的是其它页时，当前页的新下标也会被正确修正。
   */
  function movePage(from: number, targetInsertIdx: number) {
    if (from < 0 || from >= total) return;
    // 归一化：去掉 from 后要插入的真实下标
    const insertAt = targetInsertIdx > from ? targetInsertIdx - 1 : targetInsertIdx;
    if (insertAt === from) return; // 没动
    updateBook((prev) => {
      const next = prev.pages.slice();
      const [moved] = next.splice(from, 1);
      next.splice(insertAt, 0, moved);
      return { ...prev, pages: next, updatedAt: Date.now() };
    });
    // 同步当前选中页
    setIndex((cur) => {
      if (cur === from) return insertAt;
      // 其它页：算一下自己在新数组里的位置
      // 先移除 from：cur 大于 from 时 -1；再插入 insertAt：cur >= insertAt 时 +1
      let n = cur;
      if (from < n) n -= 1;
      if (insertAt <= n) n += 1;
      return n;
    });
  }

  return (
    <div className="editor-root h-[calc(100vh-56px)] flex flex-col bg-neutral-50">
      {/* 顶栏 */}
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-2 flex items-center gap-3">
        <button
          onClick={backToDetail}
          className="text-sm text-neutral-600 hover:text-neutral-900 flex items-center gap-1"
        >
          ‹ 返回
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-base truncate">
            编辑画册 · {book.title}
          </div>
          <div className="text-[11px] text-neutral-500">
            {template.name} · 共 {total} 页 · 第 {index + 1} 页：
            {layoutLabel(currentPage.layout)}
          </div>
        </div>
        <div className="text-xs text-neutral-500 tabular-nums w-20 text-right">
          {saving === 'pending' && '保存中…'}
          {saving === 'saved' && '已保存 ✓'}
        </div>
        <button
          onClick={backToDetail}
          className="px-4 py-1.5 rounded-full bg-rose text-white text-sm hover:brightness-105"
        >
          完成
        </button>
      </div>

      {/* 三栏主体 */}
      <div className="flex-1 min-h-0 flex">
        {/* 左：页面缩略图（图库已合并到右侧排版 Tab） */}
        <aside className="w-[120px] shrink-0 border-r border-neutral-200 bg-white flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto py-3 px-2">
            <div className="text-[10px] tracking-widest text-neutral-400 text-center mb-2">
              PAGES
            </div>
            <div
              className="flex flex-col gap-2"
              // 整块都允许 drop（含页底空白），用于拖到末尾
              onDragOver={(e) => {
                if (dragFromIdx == null) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                if (dragFromIdx == null) return;
                e.preventDefault();
                const to = dragOverIdx ?? total;
                movePage(dragFromIdx, to);
                setDragFromIdx(null);
                setDragOverIdx(null);
              }}
              onDragLeave={(e) => {
                // 只有真的离开容器时才清除指示线
                if (e.currentTarget === e.target) setDragOverIdx(null);
              }}
            >
              {book.pages.map((p, i) => {
                const isDragging = dragFromIdx === i;
                const showLineAbove = dragFromIdx != null && dragOverIdx === i && dragOverIdx !== dragFromIdx;
                return (
                  <div key={p.id} className="group relative">
                    {/* 顶部插入指示线 */}
                    {showLineAbove && (
                      <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-rose rounded-full pointer-events-none z-10" />
                    )}
                    <div
                      draggable
                      onDragStart={(e) => {
                        setDragFromIdx(i);
                        setDragOverIdx(i);
                        e.dataTransfer.effectAllowed = 'move';
                        // Firefox 要求 setData 才会触发 drag
                        try {
                          e.dataTransfer.setData('text/plain', String(i));
                        } catch { /* noop */ }
                      }}
                      onDragOver={(e) => {
                        if (dragFromIdx == null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        // 以鼠标在卡片内的纵向位置决定"插到此项之前还是之后"
                        const rect = e.currentTarget.getBoundingClientRect();
                        const mid = rect.top + rect.height / 2;
                        const target = e.clientY < mid ? i : i + 1;
                        setDragOverIdx(target);
                      }}
                      onDragEnd={() => {
                        setDragFromIdx(null);
                        setDragOverIdx(null);
                      }}
                      className={`transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
                    >
                      <button
                        onClick={() => setIndex(i)}
                        className={`block w-full relative rounded-md overflow-hidden border-2 transition ${
                          i === index
                            ? 'border-rose ring-2 ring-rose/20'
                            : 'border-transparent hover:border-neutral-300'
                        }`}
                        style={{ aspectRatio: '3 / 4' }}
                      >
                        <PageView
                          page={p}
                          photos={book.photos}
                          template={template}
                          babyName={book.babyName}
                          dateRange={book.dateRange}
                          photoFrameColor={book.theme?.photoFrameColor ?? null}
                        />
                        <span className="absolute top-0.5 left-1 text-[10px] bg-black/50 text-white rounded px-1">
                          {i + 1}
                        </span>
                        {/* 拖拽手柄视觉提示（右上角六点） */}
                        <span
                          className="absolute top-0.5 right-1 text-[10px] text-white/70 bg-black/40 rounded px-1 leading-none select-none pointer-events-none opacity-0 group-hover:opacity-100 transition"
                          aria-hidden
                        >
                          ⋮⋮
                        </span>
                      </button>
                    </div>
                    {/* 悬浮删除按钮：只在总页数 > 1 时显示 */}
                    {total > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePageAt(i);
                        }}
                        title="删除此页"
                        aria-label="删除此页"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white shadow border border-neutral-200 text-neutral-500 hover:text-white hover:bg-rose hover:border-rose flex items-center justify-center text-[11px] leading-none opacity-0 group-hover:opacity-100 transition z-20"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
              {/* 末尾插入指示线：拖到最后一项下半区时出现 */}
              {dragFromIdx != null &&
                dragOverIdx === total &&
                dragFromIdx !== total - 1 && (
                  <div className="relative h-0.5 -mt-1">
                    <div className="absolute inset-0 bg-rose rounded-full" />
                  </div>
                )}
            </div>
          </div>

          {/* 底栏：新增页面 */}
          <div className="shrink-0 border-t border-neutral-200 p-2 relative">
            <button
              onClick={() => setAddPagePickerOpen((v) => !v)}
              className="w-full py-2 rounded-md bg-rose/5 text-rose text-xs font-medium border border-dashed border-rose/40 hover:bg-rose/10 transition"
            >
              + 新增页面
            </button>
            {addPagePickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setAddPagePickerOpen(false)}
                />
                <div className="absolute z-50 bottom-[52px] left-2 right-2 bg-white border border-neutral-200 rounded-lg shadow-xl p-2">
                  <div className="text-[11px] text-neutral-500 mb-1.5 px-1">
                    选择版式（插入到第 {index + 1} 页后）
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {LAYOUT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          addPageAfter(index, opt.value);
                          setAddPagePickerOpen(false);
                        }}
                        className="flex flex-col items-center gap-0.5 py-1.5 rounded-md border border-neutral-200 hover:border-rose hover:bg-rose/5 transition text-[10px] text-neutral-700"
                        title={opt.label}
                      >
                        <LayoutIcon layout={opt.value} active={false} />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

        {/* 中：预览 */}
        <section
          className="flex-1 min-w-0 flex flex-col items-center justify-center p-6 overflow-auto relative"
          style={{ background: template.colors.bg }}
          // 点击预览背景（非照片）时取消选中
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedPhotoId(null);
          }}
        >
          <div
            className="w-full max-w-[440px]"
            style={{ aspectRatio: '3 / 4' }}
          >
            <PageView
              page={currentPage}
              photos={book.photos}
              template={template}
              babyName={book.babyName}
              dateRange={book.dateRange}
              onSelectPhoto={setSelectedPhotoId}
              selectedPhotoId={selectedPhotoId}
              photoFrameColor={book.theme?.photoFrameColor ?? null}
            />
          </div>

          {/* 选中工具条：仅当有照片被选中时显示 */}
          {selectedPhotoId && selectedSlot() >= 0 && (
            <div className="mt-3 flex items-center gap-2 bg-white rounded-full shadow border border-neutral-200 pl-3 pr-1 py-1">
              <span className="text-[11px] text-neutral-500">
                已选中第 <b className="text-rose">{selectedSlot() + 1}</b> 张 ·
              </span>
              {tab !== 'layout' && (
                <button
                  onClick={() => setTab('layout')}
                  className="text-[11px] px-2 py-1 rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                >
                  去图库选图
                </button>
              )}
              {tab === 'layout' && (
                <span className="text-[11px] text-neutral-500">
                  在右侧图库点一张替换，或
                </span>
              )}
              <button
                onClick={triggerUploadReplace}
                className="text-[11px] px-2 py-1 rounded-full bg-rose text-white hover:brightness-105"
              >
                ↑ 上传替换
              </button>
              <button
                onClick={() => setSelectedPhotoId(null)}
                className="text-[11px] px-2 py-1 rounded-full text-neutral-500 hover:bg-neutral-100"
              >
                取消
              </button>
            </div>
          )}
          {!selectedPhotoId && (
            <div className="mt-3 text-[11px] text-neutral-500 bg-white/80 backdrop-blur rounded-full px-3 py-1 border border-neutral-200">
              提示：点击预览里的照片进入选中态，再从右侧「排版」里的图库选图替换
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center text-sm text-neutral-700">
              <div className="px-4 py-2 rounded-full bg-white shadow border border-neutral-200">
                正在处理图片…
              </div>
            </div>
          )}
        </section>

        {/* 右：属性面板 */}
        <aside className="w-[340px] shrink-0 border-l border-neutral-200 bg-white flex flex-col">
          {/* Tab 头 */}
          <div className="shrink-0 flex border-b border-neutral-200">
            {(['text', 'layout', 'theme'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm transition ${
                  tab === t
                    ? 'text-rose border-b-2 border-rose font-medium'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {t === 'text' ? '文字' : t === 'layout' ? '排版' : '主题'}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {tab === 'text' && (
              <TextTab
                page={currentPage}
                template={template}
                book={book}
                pageNumber={index + 1}
                totalPages={total}
                onPagePatch={patchCurrentPage}
                onBookPatch={(p) => updateBook(p)}
              />
            )}
            {tab === 'layout' && (
              <LayoutTab
                book={book}
                page={currentPage}
                onChangeLayout={changeLayout}
                onChangeVariant={changeVariant}
                onReplacePhotoAt={replacePhotoAt}
                onReshuffle={reshufflePagePhotos}
                onChangeShape={setPhotoShape}
                selectedPhotoId={selectedPhotoId}
                canReplace={selectedSlot() >= 0}
                adding={adding}
                onPickFromLibrary={handlePickFromLibrary}
                onDeletePhoto={handleDeletePhoto}
                onAddPhotos={openAddPhotos}
              />
            )}
            {tab === 'theme' && (
              <ThemeTab
                book={book}
                rawTemplate={rawTemplate}
                onBookPatch={(p) => updateBook(p)}
              />
            )}
          </div>
        </aside>
      </div>

      {/* 隐藏的文件选择器：点击预览图时触发上传 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        hidden
        onChange={handleFileChosen}
      />
      {/* 隐藏的文件选择器：图库「+ 添加」批量上传 */}
      <input
        ref={addPhotoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        multiple
        hidden
        onChange={handleAddPhotosChosen}
      />
    </div>
  );
}

/* ============================================================
 *  图库面板（嵌入右侧排版 Tab）
 *  - 数据源：book.photos，展示所有上传过的照片
 *  - 顶部「+ 添加」按钮批量上传到 book.photos
 *  - 每张缩略图 hover 出现「×」删除按钮（删除时带被引用确认）
 *  - 若预览里有选中的照片（canReplace），点图库一张 → 替换选中 slot
 *    无选中态时点击无动作（按钮 disabled）
 * ============================================================ */
function LibraryPanel({
  book,
  selectedPhotoId,
  adding,
  canReplace,
  onPick,
  onDelete,
  onAdd,
}: {
  book: Book;
  selectedPhotoId: string | null;
  adding: boolean;
  canReplace: boolean;
  onPick: (photoId: string) => void;
  onDelete: (photoId: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] text-neutral-500">
          {canReplace
            ? '点一张图片替换当前选中的照片'
            : '先在预览中点一张照片进入选中态'}
        </div>
        <span className="text-[10px] text-neutral-400">
          {book.photos.length} 张
        </span>
      </div>
      <button
        onClick={onAdd}
        disabled={adding}
        className="w-full mb-2 py-1.5 rounded-md bg-rose/5 text-rose text-[11px] font-medium border border-dashed border-rose/40 hover:bg-rose/10 transition disabled:opacity-60"
      >
        {adding ? '上传中…' : '+ 添加照片'}
      </button>
      {book.photos.length === 0 ? (
        <div className="text-[11px] text-neutral-400 text-center py-6 rounded-lg border border-neutral-200 bg-neutral-50">
          图库为空，点上方按钮添加照片
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 max-h-[260px] overflow-y-auto rounded-lg border border-neutral-200 p-1.5 bg-neutral-50">
          {book.photos.map((p) => {
            const isSelected = selectedPhotoId === p.id;
            return (
              <div
                key={p.id}
                className={`group relative rounded overflow-hidden border aspect-square ${
                  isSelected
                    ? 'border-rose ring-2 ring-rose/30'
                    : 'border-neutral-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPick(p.id)}
                  disabled={!canReplace}
                  title={
                    canReplace
                      ? '点击：替换当前选中的照片'
                      : '先在预览中点一张照片进入选中态'
                  }
                  className={`block w-full h-full ${
                    canReplace ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <img
                    src={p.src}
                    draggable={false}
                    className="w-full h-full object-cover"
                  />
                </button>
                {/* 删除按钮：hover 显形 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id);
                  }}
                  title="从图库删除"
                  aria-label="从图库删除"
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white/90 shadow border border-neutral-200 text-neutral-500 hover:text-white hover:bg-rose hover:border-rose flex items-center justify-center text-[11px] leading-none opacity-0 group-hover:opacity-100 transition"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 *  Tab 1：文字
 * ============================================================ */

function TextTab({
  page,
  template,
  book,
  pageNumber,
  totalPages,
  onPagePatch,
  onBookPatch,
}: {
  page: BookPage;
  template: Template;
  book: Book;
  pageNumber: number;
  totalPages: number;
  onPagePatch: (patch: Partial<BookPage>) => void;
  onBookPatch: (patch: Partial<Book>) => void;
}) {
  const showTitle =
    page.layout === 'cover' || page.layout === 'text' || page.layout === 'ending';
  const showSubtitle = page.layout === 'cover';
  const showCaption = page.layout !== 'cover';
  const captionLabel =
    page.layout === 'text' ? '正文' : page.layout === 'ending' ? '寄语' : '照片配文';

  return (
    <div className="space-y-6">
      <Section title="当前页文字" hint={`第 ${pageNumber} / ${totalPages} 页 · ${layoutLabel(page.layout)}`}>
        {showTitle && (
          <Field label={page.layout === 'cover' ? '封面标题' : '页面标题'}>
            <input
              className={inputCls}
              value={page.title ?? ''}
              onChange={(e) => onPagePatch({ title: e.target.value })}
              placeholder={template.defaultTitle}
              maxLength={40}
            />
          </Field>
        )}
        {showSubtitle && (
          <Field label="副标题">
            <input
              className={inputCls}
              value={page.subtitle ?? ''}
              onChange={(e) => onPagePatch({ subtitle: e.target.value })}
              placeholder={template.defaultSubtitle}
              maxLength={60}
            />
          </Field>
        )}
        {showCaption && (
          <Field label={captionLabel}>
            <textarea
              className={`${inputCls} min-h-[90px] resize-y leading-relaxed`}
              value={page.caption ?? ''}
              onChange={(e) => onPagePatch({ caption: e.target.value })}
              placeholder={
                page.layout === 'text' || page.layout === 'ending'
                  ? '写下这一刻的故事…'
                  : '为这张/这组照片写一句话'
              }
              maxLength={page.layout === 'text' || page.layout === 'ending' ? 240 : 120}
            />
          </Field>
        )}
        {!showTitle && !showCaption && (
          <div className="text-xs text-neutral-400 py-6 text-center border border-dashed border-neutral-200 rounded-lg">
            此页暂无可编辑的文字
          </div>
        )}
      </Section>

      <Section title="画册信息" hint="对所有页生效">
        <Field label="画册标题">
          <input
            className={inputCls}
            value={book.title}
            onChange={(e) => onBookPatch({ title: e.target.value })}
            maxLength={40}
          />
        </Field>
        <Field label="宝宝名">
          <input
            className={inputCls}
            value={book.babyName}
            onChange={(e) => onBookPatch({ babyName: e.target.value })}
            maxLength={20}
          />
        </Field>
        <Field label="日期区间">
          <input
            className={inputCls}
            value={book.dateRange}
            onChange={(e) => onBookPatch({ dateRange: e.target.value })}
            placeholder="如：2024·春"
            maxLength={40}
          />
        </Field>
      </Section>
    </div>
  );
}

/* ============================================================
 *  Tab 2：排版（版式、变体、单图替换）
 * ============================================================ */

const LAYOUT_OPTIONS: Array<{ value: PageLayoutType; label: string; photos: number }> = [
  { value: 'cover', label: '封面', photos: 1 },
  { value: 'single', label: '单图', photos: 1 },
  { value: 'single-portrait', label: '竖图图文', photos: 1 },
  { value: 'double', label: '双图', photos: 2 },
  { value: 'triple', label: '三图', photos: 3 },
  { value: 'grid4', label: '四格', photos: 4 },
  { value: 'grid5', label: '五图', photos: 5 },
  { value: 'grid6', label: '六图', photos: 6 },
  { value: 'text', label: '文字页', photos: 0 },
  { value: 'ending', label: '尾页', photos: 0 },
];

function LayoutTab({
  book,
  page,
  onChangeLayout,
  onChangeVariant,
  onReplacePhotoAt,
  onReshuffle,
  onChangeShape,
  selectedPhotoId,
  canReplace,
  adding,
  onPickFromLibrary,
  onDeletePhoto,
  onAddPhotos,
}: {
  book: Book;
  page: BookPage;
  onChangeLayout: (l: PageLayoutType) => void;
  onChangeVariant: (v: string | undefined) => void;
  onReplacePhotoAt: (slot: number, photoId: string) => void;
  onReshuffle: (ids: string[]) => void;
  onChangeShape: (slot: number, shape: PhotoShape | undefined) => void;
  selectedPhotoId: string | null;
  canReplace: boolean;
  adding: boolean;
  onPickFromLibrary: (photoId: string) => void;
  onDeletePhoto: (photoId: string) => void;
  onAddPhotos: () => void;
}) {
  // 当前 layout 对应的 variant 清单（仅多图版式有）
  const variantKey = variantKeyOf(page.layout);
  const variantList = variantKey ? VARIANTS[variantKey] : null;

  // 当前页所需照片数
  const need = layoutPhotoCount(page.layout);
  const photoMap = new Map(book.photos.map((p) => [p.id, p]));
  const pagePhotos = page.photoIds.map((id) => photoMap.get(id)).filter(Boolean) as typeof book.photos;

  // 快捷：按顺序取前 N 张未用照片
  function autoFill() {
    const used = new Set(page.photoIds);
    const others = book.photos.filter((p) => !used.has(p.id));
    const merged = [...pagePhotos.map((p) => p.id), ...others.map((p) => p.id)].slice(0, need);
    // 若仍不足，用已有照片重复补齐（极少见）
    while (merged.length < need && book.photos.length > 0) {
      merged.push(book.photos[merged.length % book.photos.length].id);
    }
    onReshuffle(merged);
  }

  return (
    <div className="space-y-6">
      <Section title="页面版式">
        <div className="grid grid-cols-3 gap-2">
          {LAYOUT_OPTIONS.map((opt) => {
            const active = opt.value === page.layout;
            return (
              <button
                key={opt.value}
                onClick={() => onChangeLayout(opt.value)}
                className={`relative aspect-[3/4] rounded-lg border-2 flex flex-col items-center justify-center gap-1 transition text-[11px] ${
                  active
                    ? 'border-rose bg-rose/5 text-rose font-medium'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-400 bg-white'
                }`}
                title={opt.label}
              >
                <LayoutIcon layout={opt.value} active={active} />
                <span>{opt.label}</span>
                {opt.photos > 0 && (
                  <span className="text-[9px] text-neutral-400">{opt.photos} 图</span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      {variantList && (
        <Section title="版式变体" hint="同一版式的不同摆法">
          <div className="grid grid-cols-3 gap-2">
            {variantList.map((v) => {
              const currentVariant =
                page.variant ?? defaultVariantId(variantKey!);
              const active = v.id === currentVariant;
              return (
                <button
                  key={v.id}
                  onClick={() => onChangeVariant(v.id)}
                  className={`px-2 py-3 rounded-lg border-2 text-left transition ${
                    active
                      ? 'border-rose bg-rose/5'
                      : 'border-neutral-200 hover:border-neutral-400 bg-white'
                  }`}
                  title={v.hint}
                >
                  <div className={`text-xs ${active ? 'text-rose font-medium' : 'text-neutral-800'}`}>
                    {v.label}
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-0.5 line-clamp-2 leading-tight">
                    {v.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {page.layout === 'text' && (
        <Section title="文字页样式" hint="不选则跟随当前模板的风格">
          <div className="grid grid-cols-3 gap-2">
            {TEXT_VARIANT_OPTIONS.map((opt) => {
              // opt.value === undefined 代表"跟随模板"
              const active = (page.variant ?? undefined) === opt.value;
              return (
                <button
                  key={opt.value ?? '__default'}
                  onClick={() => onChangeVariant(opt.value)}
                  className={`rounded-lg border-2 overflow-hidden text-left transition ${
                    active
                      ? 'border-rose'
                      : 'border-neutral-200 hover:border-neutral-400 bg-white'
                  }`}
                  title={opt.hint}
                >
                  <div className="aspect-[3/4] bg-neutral-50 relative">
                    <TextVariantThumb variant={opt.value} />
                  </div>
                  <div
                    className={`px-1.5 py-1 text-[11px] ${
                      active ? 'bg-rose/5 text-rose font-medium' : 'text-neutral-700'
                    }`}
                  >
                    {opt.label}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {(page.layout === 'cover' ||
        page.layout === 'single' ||
        page.layout === 'single-portrait') && (
        <Section
          title={
            page.layout === 'cover'
              ? '封面样式'
              : page.layout === 'single'
                ? '单图样式'
                : '竖图图文样式'
          }
          hint="不选则跟随当前模板的风格"
        >
          <div className="grid grid-cols-3 gap-2">
            {(page.layout === 'cover'
              ? COVER_VARIANT_OPTIONS
              : page.layout === 'single'
                ? SINGLE_VARIANT_OPTIONS
                : SINGLE_PORTRAIT_VARIANT_OPTIONS
            ).map((opt) => {
              const active = (page.variant ?? undefined) === opt.value;
              return (
                <button
                  key={opt.value ?? '__default'}
                  onClick={() => onChangeVariant(opt.value)}
                  className={`rounded-lg border-2 overflow-hidden text-left transition ${
                    active
                      ? 'border-rose'
                      : 'border-neutral-200 hover:border-neutral-400 bg-white'
                  }`}
                  title={opt.hint}
                >
                  <div className="aspect-[3/4] bg-neutral-50 relative">
                    <PhotoVariantThumb
                      layout={page.layout as 'cover' | 'single' | 'single-portrait'}
                      variant={opt.value}
                    />
                  </div>
                  <div
                    className={`px-1.5 py-1 text-[11px] ${
                      active ? 'bg-rose/5 text-rose font-medium' : 'text-neutral-700'
                    }`}
                  >
                    {opt.label}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {need > 0 && (
        <Section title="本页照片" hint={`${pagePhotos.length} / ${need}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] text-neutral-500">
              点击照片位可从图库挑选替换
            </div>
            <button
              className="text-[11px] text-rose hover:underline"
              onClick={autoFill}
            >
              自动填充
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: need }).map((_, slot) => {
              const ph = photoMap.get(page.photoIds[slot] ?? '');
              const shape = page.photoShapes?.[slot];
              return (
                <PhotoSlot
                  key={slot}
                  slot={slot}
                  photo={ph}
                  book={book}
                  shape={shape}
                  onPick={(pid) => onReplacePhotoAt(slot, pid)}
                  onChangeShape={(s) => onChangeShape(slot, s)}
                />
              );
            })}
          </div>
        </Section>
      )}

      {/* 图库（独立 Section，所有版式都显示；承担：添加 / 删除 / 点选替换选中 slot） */}
      <Section title="图库" hint={`${book.photos.length} 张`}>
        <LibraryPanel
          book={book}
          selectedPhotoId={selectedPhotoId}
          adding={adding}
          canReplace={canReplace}
          onPick={onPickFromLibrary}
          onDelete={onDeletePhoto}
          onAdd={onAddPhotos}
        />
      </Section>
    </div>
  );
}

/** 单个照片槽：点击弹出选择器 + 下方形状选择器 */
function PhotoSlot({
  slot,
  photo,
  book,
  shape,
  onPick,
  onChangeShape,
}: {
  slot: number;
  photo?: { id: string; src: string };
  book: Book;
  shape?: PhotoShape;
  onPick: (photoId: string) => void;
  onChangeShape: (shape: PhotoShape | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const curShape: PhotoShape = shape ?? 'rect';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-lg overflow-hidden border-2 transition ${
          open
            ? 'border-rose'
            : photo
              ? 'border-neutral-200 hover:border-neutral-400'
              : 'border-dashed border-neutral-300 bg-neutral-50 hover:border-neutral-500'
        }`}
        style={{ aspectRatio: '1 / 1' }}
      >
        {photo ? (
          <img src={photo.src} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xl">
            +
          </div>
        )}
      </button>
      <div className="absolute top-0.5 left-1 text-[10px] bg-black/50 text-white rounded px-1">
        {slot + 1}
      </div>

      {/* 形状选择：6 个小按钮 */}
      {photo && (
        <div className="mt-1 grid grid-cols-6 gap-[2px]">
          {SHAPE_OPTIONS.map((opt) => {
            const active = curShape === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onChangeShape(opt.value === 'rect' ? undefined : opt.value)}
                className={`aspect-square flex items-center justify-center rounded transition text-neutral-500 ${
                  active
                    ? 'bg-rose/10 text-rose ring-1 ring-rose'
                    : 'bg-neutral-100 hover:bg-neutral-200'
                }`}
                title={opt.label}
                aria-label={opt.label}
              >
                <ShapeIcon shape={opt.value} active={active} />
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 w-[260px] bg-white border border-neutral-200 rounded-lg shadow-xl p-2">
            <div className="text-[11px] text-neutral-500 mb-1.5 px-1">选择一张照片</div>
            <div className="grid grid-cols-4 gap-1 max-h-[200px] overflow-y-auto">
              {book.photos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onPick(p.id);
                    setOpen(false);
                  }}
                  className={`rounded overflow-hidden border hover:border-rose transition ${
                    photo?.id === p.id ? 'border-rose ring-1 ring-rose' : 'border-neutral-200'
                  }`}
                  style={{ aspectRatio: '1 / 1' }}
                >
                  <img src={p.src} className="w-full h-full object-cover" draggable={false} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* 可选形状清单 */
const SHAPE_OPTIONS: Array<{ value: PhotoShape; label: string }> = [
  { value: 'rect', label: '方形（默认）' },
  { value: 'rounded', label: '圆角方' },
  { value: 'circle', label: '圆形' },
  { value: 'heart', label: '心形' },
  { value: 'star', label: '星形' },
  { value: 'hexagon', label: '六边形' },
];

/** 形状小图标 —— 和 ShapeMask 的裁切保持一致 */
function ShapeIcon({ shape, active }: { shape: PhotoShape; active: boolean }) {
  const color = active ? '#E11D48' : '#6B7280';
  const size = 14;
  if (shape === 'rect') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20">
        <rect x="3" y="3" width="14" height="14" fill={color} rx="1" />
      </svg>
    );
  }
  if (shape === 'rounded') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20">
        <rect x="3" y="3" width="14" height="14" fill={color} rx="4" />
      </svg>
    );
  }
  if (shape === 'circle') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="7" fill={color} />
      </svg>
    );
  }
  if (shape === 'heart') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20">
        <path
          d="M10 17 C 4 13 2 10 2 7 C 2 4.5 4 3 6 3 C 7.5 3 9 4 10 5.5 C 11 4 12.5 3 14 3 C 16 3 18 4.5 18 7 C 18 10 16 13 10 17 Z"
          fill={color}
        />
      </svg>
    );
  }
  if (shape === 'star') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20">
        <polygon
          points="10,2 12.2,7.5 18,7.9 13.5,11.6 15,17 10,13.9 5,17 6.5,11.6 2,7.9 7.8,7.5"
          fill={color}
        />
      </svg>
    );
  }
  // hexagon
  return (
    <svg width={size} height={size} viewBox="0 0 20 20">
      <polygon points="6,3 14,3 18,10 14,17 6,17 2,10" fill={color} />
    </svg>
  );
}

/* ============================================================
 *  Tab 3：主题（颜色 / 字体 / 背景图案）
 * ============================================================ */

const FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '默认标题（Caveat 手写）', value: 'Caveat, Playfair Display, serif' },
  { label: '衬线优雅（Playfair）', value: 'Playfair Display, serif' },
  { label: '中文圆润（PingFang）', value: 'PingFang SC, sans-serif' },
  { label: '现代无衬线', value: 'Inter, system-ui, sans-serif' },
  { label: '打字机（Mono）', value: 'Courier New, monospace' },
  { label: '中文手写', value: 'ZCOOL KuaiLe, Caveat, cursive' },
];

const COLOR_PRESETS: Array<{ name: string; colors: Template['colors'] }> = [
  {
    name: '暖粉橙',
    colors: { bg: '#FFF1E6', paper: '#FFF8F0', primary: '#E76F51', accent: '#F4A261', text: '#4A2C1E' },
  },
  {
    name: '薄荷黄',
    colors: { bg: '#EEF7E8', paper: '#F9FDF4', primary: '#6BAF6E', accent: '#F2C94C', text: '#2F4A2A' },
  },
  {
    name: '糖果',
    colors: { bg: '#FFE3EE', paper: '#FFFFFF', primary: '#FF5C8A', accent: '#3BB4E8', text: '#2B1930' },
  },
  {
    name: '复古胶片',
    colors: { bg: '#2B211A', paper: '#3A2D22', primary: '#E9C58E', accent: '#D98A50', text: '#F2E7D0' },
  },
  {
    name: '中国红',
    colors: { bg: '#FFF3E6', paper: '#FFFBF3', primary: '#C0392B', accent: '#D4A017', text: '#4A2C22' },
  },
  {
    name: '清新极简',
    colors: { bg: '#F7F7F5', paper: '#FFFFFF', primary: '#1F2937', accent: '#B91C1C', text: '#1F2937' },
  },
  {
    name: '圣诞',
    colors: { bg: '#F4EDE1', paper: '#FFFFFF', primary: '#C0392B', accent: '#2E7D32', text: '#1F2937' },
  },
  {
    name: '夜空紫',
    colors: { bg: '#1E1B2E', paper: '#2A2341', primary: '#F4A261', accent: '#A78BFA', text: '#F3F0FF' },
  },
];

const BG_PATTERN_PRESETS: Array<{ name: string; css: string | '' | null }> = [
  { name: '跟随模板', css: null },
  { name: '无图案', css: '' },
  {
    name: '柔光晕染',
    css: 'radial-gradient(ellipse at 10% 0%, rgba(255,100,150,0.18) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(255,200,100,0.18) 0%, transparent 55%)',
  },
  {
    name: '斜纹格',
    css: 'repeating-linear-gradient(45deg, transparent 0 18px, rgba(0,0,0,0.04) 18px 20px)',
  },
  {
    name: '圆点',
    css: 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1.5px) 0 0/16px 16px',
  },
  {
    name: '暖光斑',
    css: 'radial-gradient(circle at 20% 20%, rgba(244,162,97,0.22) 0 120px, transparent 120px), radial-gradient(circle at 85% 80%, rgba(231,111,81,0.22) 0 140px, transparent 140px)',
  },
];

/**
 * 图片边框颜色预设 —— 覆盖 book.theme.photoFrameColor 时可直接点击这些色块；
 * 精心挑选的 13 色，覆盖白/米白（vintage 默认）、墨黑、主流亮色到深色，兼顾各模板。
 */
const PHOTO_FRAME_COLOR_PRESETS: string[] = [
  '#FFFFFF', // 纯白
  '#FFFEF7', // polaroid 米白
  '#F4E8D4', // 奶油黄
  '#111111', // 墨黑
  '#E63946', // 中国红
  '#F4A261', // 暖橙
  '#E9C46A', // 芥末黄
  '#2A9D8F', // 松绿
  '#264653', // 深青
  '#457B9D', // 蓝灰
  '#8E4585', // 紫莓
  '#C77D9A', // 粉玫
  '#A3A3A3', // 中灰
];

function ThemeTab({
  book,
  rawTemplate,
  onBookPatch,
}: {
  book: Book;
  rawTemplate: Template;
  onBookPatch: (patch: Partial<Book>) => void;
}) {
  const theme = book.theme ?? {};
  const effColors = { ...rawTemplate.colors, ...(theme.colors ?? {}) };
  const effFont = { ...rawTemplate.fontFamily, ...(theme.fontFamily ?? {}) };

  function setColors(patch: Partial<Template['colors']>) {
    onBookPatch({
      theme: {
        ...theme,
        colors: { ...(theme.colors ?? {}), ...patch },
      },
    });
  }

  function setFont(patch: Partial<Template['fontFamily']>) {
    onBookPatch({
      theme: {
        ...theme,
        fontFamily: { ...(theme.fontFamily ?? {}), ...patch },
      },
    });
  }

  function setBackground(css: string | '' | null) {
    onBookPatch({
      theme: {
        ...theme,
        backgroundPattern: css,
      },
    });
  }

  function setPhotoFrameColor(color: string | null) {
    onBookPatch({
      theme: {
        ...theme,
        photoFrameColor: color,
      },
    });
  }

  function applyPreset(colors: Template['colors']) {
    onBookPatch({
      theme: { ...theme, colors },
    });
  }

  function resetAll() {
    onBookPatch({ theme: undefined });
  }

  return (
    <div className="space-y-6">
      <Section title="配色预设">
        <div className="grid grid-cols-4 gap-2">
          {COLOR_PRESETS.map((p) => {
            const matched =
              effColors.primary === p.colors.primary &&
              effColors.bg === p.colors.bg &&
              effColors.paper === p.colors.paper;
            return (
              <button
                key={p.name}
                onClick={() => applyPreset(p.colors)}
                className={`group rounded-lg border-2 p-2 transition ${
                  matched
                    ? 'border-rose'
                    : 'border-neutral-200 hover:border-neutral-400'
                }`}
                title={p.name}
              >
                <div className="flex h-8 rounded overflow-hidden">
                  {(['bg', 'paper', 'primary', 'accent', 'text'] as const).map((k) => (
                    <div
                      key={k}
                      className="flex-1"
                      style={{ background: p.colors[k] }}
                    />
                  ))}
                </div>
                <div className="text-[10px] text-neutral-600 mt-1 text-center truncate">
                  {p.name}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="单色微调" hint="每个颜色可单独覆盖，留空则跟随模板">
        <div className="grid grid-cols-2 gap-2">
          <ColorPicker label="背景色 bg" value={effColors.bg} onChange={(v) => setColors({ bg: v })} />
          <ColorPicker label="纸面 paper" value={effColors.paper} onChange={(v) => setColors({ paper: v })} />
          <ColorPicker label="主色 primary" value={effColors.primary} onChange={(v) => setColors({ primary: v })} />
          <ColorPicker label="强调 accent" value={effColors.accent} onChange={(v) => setColors({ accent: v })} />
          <ColorPicker label="文字 text" value={effColors.text} onChange={(v) => setColors({ text: v })} />
        </div>
      </Section>

      <Section
        title="图片边框颜色"
        hint="覆盖本册所有图片相框的边框色（跟随模板时使用风格默认值）"
      >
        <div className="grid grid-cols-7 gap-2">
          {/* 跟随模板：null */}
          <button
            type="button"
            onClick={() => setPhotoFrameColor(null)}
            title="跟随模板默认"
            className={`h-8 rounded-md border-2 text-[10px] flex items-center justify-center transition ${
              theme.photoFrameColor == null
                ? 'border-rose text-rose'
                : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
            }`}
            style={{
              background:
                'repeating-linear-gradient(45deg, #fff 0 4px, #f3f4f6 4px 8px)',
            }}
          >
            默认
          </button>
          {PHOTO_FRAME_COLOR_PRESETS.map((c) => {
            const active =
              theme.photoFrameColor != null &&
              theme.photoFrameColor.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => setPhotoFrameColor(c)}
                title={c}
                className={`h-8 rounded-md border-2 transition ${
                  active ? 'border-rose ring-2 ring-rose/30' : 'border-neutral-200 hover:border-neutral-400'
                }`}
                style={{ background: c }}
              />
            );
          })}
        </div>
        <div className="mt-2">
          <ColorPicker
            label="自定义颜色"
            value={theme.photoFrameColor ?? effColors.primary}
            onChange={(v) => setPhotoFrameColor(v)}
          />
        </div>
      </Section>

      <Section title="字体">
        <Field label="标题字体">
          <select
            className={inputCls}
            value={effFont.title}
            onChange={(e) => setFont({ title: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
            {!FONT_OPTIONS.find((f) => f.value === effFont.title) && (
              <option value={effFont.title}>（自定义） {effFont.title}</option>
            )}
          </select>
        </Field>
        <Field label="正文字体">
          <select
            className={inputCls}
            value={effFont.body}
            onChange={(e) => setFont({ body: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
            {!FONT_OPTIONS.find((f) => f.value === effFont.body) && (
              <option value={effFont.body}>（自定义） {effFont.body}</option>
            )}
          </select>
        </Field>
      </Section>

      <Section title="背景图案">
        <div className="grid grid-cols-3 gap-2">
          {BG_PATTERN_PRESETS.map((p) => {
            const active = theme.backgroundPattern === p.css;
            return (
              <button
                key={p.name}
                onClick={() => setBackground(p.css)}
                className={`h-16 rounded-lg border-2 text-[11px] transition relative overflow-hidden ${
                  active ? 'border-rose' : 'border-neutral-200 hover:border-neutral-400'
                }`}
                style={{
                  background: p.css
                    ? `${p.css}, ${effColors.paper}`
                    : p.css === ''
                      ? effColors.paper
                      : rawTemplate.backgroundPattern
                        ? `${rawTemplate.backgroundPattern}, ${effColors.paper}`
                        : effColors.paper,
                }}
              >
                <span
                  className="absolute bottom-1 left-1 right-1 text-center rounded bg-white/80 px-1"
                  style={{ color: '#333' }}
                >
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="pt-2 border-t border-neutral-100">
        <button
          onClick={resetAll}
          className="w-full text-center text-xs text-neutral-500 hover:text-rose py-2"
        >
          重置为模板默认主题
        </button>
      </div>
    </div>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-neutral-200 p-1.5 bg-white hover:border-neutral-400 transition">
      <input
        type="color"
        value={normalizeHex(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-neutral-500">{label}</div>
        <input
          type="text"
          className="w-full bg-transparent text-xs text-neutral-800 outline-none font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>
    </label>
  );
}

/** 把任意颜色字符串归一化为 #rrggbb 供 <input type=color> 使用 */
function normalizeHex(v: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1],
      g = v[2],
      b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return '#000000';
}

/* ============================================================
 *  通用 UI
 * ============================================================ */

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <div className="text-xs font-semibold text-neutral-800 tracking-wide">{title}</div>
        {hint && <div className="text-[11px] text-neutral-400 mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div className="text-[11px] text-neutral-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-800 ' +
  'focus:outline-none focus:border-rose focus:ring-2 focus:ring-rose/20 transition placeholder:text-neutral-300';

/* ============================================================
 *  工具函数
 * ============================================================ */

function layoutLabel(layout: PageLayoutType): string {
  return LAYOUT_OPTIONS.find((o) => o.value === layout)?.label ?? layout;
}

function layoutPhotoCount(layout: PageLayoutType): number {
  return LAYOUT_OPTIONS.find((o) => o.value === layout)?.photos ?? 0;
}

/** 生成一个新的页面 id，优先用原生 randomUUID，环境缺失时回退时间戳+随机 */
function newPageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function variantKeyOf(layout: PageLayoutType): keyof typeof VARIANTS | null {
  if (layout === 'double') return 'double';
  if (layout === 'triple') return 'triple';
  if (layout === 'grid4') return 'grid4';
  if (layout === 'grid5') return 'grid5';
  if (layout === 'grid6') return 'grid6';
  return null;
}

/** 把当前页的 photoIds 调整到 required 张 */
function adjustPhotoIds(
  current: string[],
  required: number,
  book: Book,
): { photoIds: string[] } {
  if (required === 0) return { photoIds: [] };
  if (current.length === required) return { photoIds: current };
  if (current.length > required) return { photoIds: current.slice(0, required) };

  // 不足：先用未使用的照片补，再允许重复
  const used = new Set(current);
  const others = book.photos.filter((p) => !used.has(p.id)).map((p) => p.id);
  const merged = [...current];
  while (merged.length < required) {
    if (others.length > 0) {
      merged.push(others.shift()!);
    } else if (book.photos.length > 0) {
      merged.push(book.photos[merged.length % book.photos.length].id);
    } else {
      break;
    }
  }
  return { photoIds: merged };
}

/* ============================================================
 *  文字页样式选项 & 缩略图
 * ============================================================ */

/**
 * 文字页可选样式。
 * value === undefined 表示"跟随模板 style"（不写入 page.variant）。
 * 其它值与 PageView.TextLayout 内的 variant id 一一对应。
 */
const TEXT_VARIANT_OPTIONS: Array<{
  value: string | undefined;
  label: string;
  hint: string;
}> = [
  { value: undefined, label: '跟随模板', hint: '使用当前模板的默认文字页风格' },
  { value: 'minimal', label: '极简杂志', hint: '大留白 + 细分割线 + 衬线标题' },
  { value: 'watercolor', label: '手写水彩', hint: '斜贴手写小标签 + 大标题' },
  { value: 'cartoon', label: '卡通气泡', hint: '糖果边大气泡 + 宝宝感' },
  { value: 'vintage', label: '复古打字', hint: '打字机体 + 上下虚线 + 章节感' },
  { value: 'festival-cn', label: '中国红', hint: '竖排标题 + 红色喜庆' },
  { value: 'festival-xmas', label: '圣诞雪花', hint: '雪花装饰 + 渐变分割线' },
  { value: 'poster', label: '海报大字', hint: '占满整页的超大标题 + 底部脚注' },
  { value: 'quote', label: '手写引言', hint: '大引号 + 居中引文 + 签名线' },
  { value: 'card', label: '卡片便签', hint: '居中便签卡片 + 细边框 + 角标' },
  { value: 'timeline', label: '时间轴', hint: '左侧圆点竖线 + 右侧章节正文' },
];

/**
 * 文字页样式迷你缩略图：按 variant 画一个示意小图。
 * 为了避免重复 PageView 的渲染开销，这里用静态 SVG/div 勾勒轮廓。
 */
function TextVariantThumb({ variant }: { variant: string | undefined }) {
  const primary = '#E11D48';
  const neutral = '#9CA3AF';
  const bg = '#FFFFFF';

  // 跟随模板 —— 画个通用「文字页」示意
  if (variant === undefined) {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <rect x="10" y="18" width="40" height="4" fill={primary} />
        <rect x="10" y="28" width="30" height="2" fill={neutral} />
        <rect x="10" y="34" width="36" height="2" fill={neutral} />
        <rect x="10" y="40" width="26" height="2" fill={neutral} />
        <rect x="10" y="52" width="18" height="1.5" fill={primary} opacity="0.5" />
      </svg>
    );
  }

  if (variant === 'minimal') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <text x="8" y="18" fontSize="4" fill={neutral} letterSpacing="1.5">C H A P T E R</text>
        <rect x="8" y="26" width="38" height="5" fill={primary} />
        <rect x="8" y="36" width="10" height="1" fill={primary} />
        <rect x="8" y="46" width="30" height="1.5" fill={neutral} />
        <rect x="8" y="52" width="34" height="1.5" fill={neutral} />
        <rect x="8" y="58" width="26" height="1.5" fill={neutral} />
      </svg>
    );
  }

  if (variant === 'watercolor') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <rect x="8" y="14" width="22" height="5" fill={primary} opacity="0.25" transform="rotate(-4 19 16.5)" />
        <rect x="8" y="26" width="44" height="5" fill={primary} />
        <rect x="8" y="38" width="8" height="1" fill={primary} />
        <circle cx="20" cy="39" r="1.5" fill="#F59E0B" />
        <rect x="24" y="38" width="28" height="1" fill={neutral} opacity="0.4" />
        <rect x="8" y="50" width="40" height="1.5" fill={neutral} />
        <rect x="8" y="56" width="34" height="1.5" fill={neutral} />
      </svg>
    );
  }

  if (variant === 'cartoon') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <rect
          x="8"
          y="18"
          width="44"
          height="40"
          rx="10"
          fill="#FFF8F0"
          stroke={primary}
          strokeWidth="2"
        />
        <circle cx="30" cy="26" r="2" fill="#F59E0B" />
        <rect x="16" y="32" width="28" height="4" fill={primary} />
        <rect x="14" y="42" width="32" height="1.5" fill={neutral} />
        <rect x="14" y="48" width="24" height="1.5" fill={neutral} />
        <polygon points="20,58 26,58 23,64" fill={primary} />
      </svg>
    );
  }

  if (variant === 'vintage') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <line x1="8" y1="14" x2="52" y2="14" stroke="#D4A017" strokeWidth="1" strokeDasharray="2 2" />
        <text x="8" y="24" fontSize="3" fill={neutral} letterSpacing="1.5">CHAPTER · 00</text>
        <rect x="8" y="30" width="36" height="4" fill={primary} />
        <line x1="10" y1="44" x2="10" y2="60" stroke="#D4A017" strokeWidth="1" />
        <rect x="14" y="44" width="30" height="1.5" fill={neutral} />
        <rect x="14" y="50" width="26" height="1.5" fill={neutral} />
        <rect x="14" y="56" width="32" height="1.5" fill={neutral} />
        <line x1="8" y1="66" x2="52" y2="66" stroke="#D4A017" strokeWidth="1" strokeDasharray="2 2" />
      </svg>
    );
  }

  if (variant === 'festival-cn') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FFF5F2' }}>
        <rect x="26" y="16" width="6" height="24" fill="#C0392B" />
        <rect x="26.5" y="17" width="5" height="3" fill="#FFFBF3" />
        <rect x="26.5" y="22" width="5" height="3" fill="#FFFBF3" />
        <rect x="26.5" y="27" width="5" height="3" fill="#FFFBF3" />
        <rect x="26.5" y="32" width="5" height="3" fill="#FFFBF3" />
        <rect x="14" y="50" width="32" height="1.5" fill={neutral} />
        <rect x="14" y="56" width="28" height="1.5" fill={neutral} />
        <rect x="24" y="64" width="12" height="8" fill="#C0392B" />
      </svg>
    );
  }

  if (variant === 'festival-xmas') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <text x="26" y="22" fontSize="10" fill="#2E7D32">❄</text>
        <rect x="12" y="32" width="36" height="4" fill="#C0392B" />
        <line x1="20" y1="42" x2="40" y2="42" stroke="url(#xg)" strokeWidth="1.5" />
        <defs>
          <linearGradient id="xg">
            <stop offset="0" stopColor="#C0392B" />
            <stop offset="1" stopColor="#2E7D32" />
          </linearGradient>
        </defs>
        <rect x="14" y="50" width="32" height="1.5" fill={neutral} />
        <rect x="14" y="56" width="28" height="1.5" fill={neutral} />
      </svg>
    );
  }

  if (variant === 'poster') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <circle cx="12" cy="10" r="14" fill={primary} opacity="0.08" />
        <circle cx="50" cy="70" r="14" fill="#F59E0B" opacity="0.08" />
        <text x="6" y="18" fontSize="3" fill={neutral} letterSpacing="1.5">CHAPTER</text>
        <text x="6" y="46" fontSize="22" fontWeight="900" fill={primary}>A</text>
        <text x="20" y="46" fontSize="22" fontWeight="900" fill={primary}>A</text>
        <rect x="6" y="58" width="28" height="1.5" fill={neutral} />
        <rect x="6" y="64" width="22" height="1.5" fill={neutral} />
        <text x="44" y="74" fontSize="3" fill={neutral} letterSpacing="1">BB</text>
      </svg>
    );
  }

  if (variant === 'quote') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <text x="20" y="30" fontSize="24" fill={primary} opacity="0.3" fontStyle="italic">"</text>
        <rect x="14" y="34" width="32" height="4" fill={primary} />
        <rect x="16" y="46" width="28" height="1.5" fill={neutral} />
        <rect x="18" y="52" width="24" height="1.5" fill={neutral} />
        <rect x="22" y="58" width="16" height="1.5" fill={neutral} />
        <line x1="25" y1="66" x2="35" y2="66" stroke="#F59E0B" strokeWidth="1" />
        <text x="22" y="72" fontSize="2.5" fill="#F59E0B" letterSpacing="1">— MEMO —</text>
      </svg>
    );
  }

  if (variant === 'card') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <rect
          x="8"
          y="16"
          width="44"
          height="48"
          rx="3"
          fill="#FFFBF3"
          stroke={primary}
          strokeOpacity="0.3"
          strokeWidth="1"
        />
        <rect x="12" y="14" width="12" height="4" fill={primary} rx="1" />
        <circle cx="14" cy="26" r="1.5" fill="#F59E0B" />
        <rect x="12" y="32" width="30" height="4" fill={primary} />
        <rect x="12" y="44" width="36" height="1.5" fill={neutral} />
        <rect x="12" y="50" width="32" height="1.5" fill={neutral} />
        <rect x="12" y="56" width="26" height="1.5" fill={neutral} />
      </svg>
    );
  }

  if (variant === 'timeline') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <circle cx="14" cy="22" r="2.5" fill={primary} />
        <circle cx="14" cy="22" r="5" fill={primary} opacity="0.2" />
        <line x1="14" y1="27" x2="14" y2="62" stroke={primary} strokeOpacity="0.4" strokeWidth="1" />
        <text x="22" y="20" fontSize="2.5" fill="#F59E0B" letterSpacing="1.5">CHAPTER · A</text>
        <rect x="22" y="26" width="30" height="4" fill={primary} />
        <rect x="22" y="38" width="28" height="1.5" fill={neutral} />
        <rect x="22" y="44" width="30" height="1.5" fill={neutral} />
        <rect x="22" y="50" width="24" height="1.5" fill={neutral} />
      </svg>
    );
  }

  // 兜底：同"跟随模板"
  return (
    <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
      <rect x="10" y="18" width="40" height="4" fill={primary} />
      <rect x="10" y="28" width="30" height="2" fill={neutral} />
      <rect x="10" y="34" width="36" height="2" fill={neutral} />
    </svg>
  );
}

/* ============================================================
 *  封面 / 单图 / 单竖图 可选样式
 *  - value === undefined 表示"跟随当前模板 style"
 *  - 与 PageView 内的 CoverLayout / SingleLayout / SinglePortraitLayout
 *    接收的 variantOverride 保持一致：内置 6 个 style + 各自 2 个专属变体
 * ============================================================ */
type PhotoVariantOption = { value: string | undefined; label: string; hint: string };

const STYLE_VARIANT_OPTIONS: PhotoVariantOption[] = [
  { value: undefined, label: '跟随模板', hint: '使用当前模板的默认风格' },
  { value: 'minimal', label: '极简杂志', hint: '大留白 + 黑红撞色 + 衬线字' },
  { value: 'watercolor', label: '手写水彩', hint: '斜贴小标签 + 柔和手绘' },
  { value: 'cartoon', label: '萌趣卡通', hint: '厚描边 + 糖果圆角 + 气泡' },
  { value: 'vintage', label: '复古胶片', hint: '胶片条 + 米色贴纸 + 漏光' },
  { value: 'festival-cn', label: '中国红', hint: '红框 + 竖排标题 + 印章' },
  { value: 'festival-xmas', label: '圣诞雪花', hint: '雪花边 + 红绿撞色 + 绶带' },
];

const COVER_VARIANT_OPTIONS: PhotoVariantOption[] = [
  ...STYLE_VARIANT_OPTIONS,
  { value: 'poster', label: '海报大字', hint: '超大标题铺满 + 圆形小照片徽章' },
  { value: 'filmstrip', label: '胶片定格', hint: '齿孔胶片 + 出血大图 + 白字叠压' },
];

const SINGLE_VARIANT_OPTIONS: PhotoVariantOption[] = [
  ...STYLE_VARIANT_OPTIONS,
  { value: 'fullbleed', label: '满版出血', hint: '整页铺满大图 + 底部半透明字幕' },
  { value: 'card', label: '相片卡片', hint: '居中卡片 + 阴影 + 右上角徽章' },
];

const SINGLE_PORTRAIT_VARIANT_OPTIONS: PhotoVariantOption[] = [
  ...STYLE_VARIANT_OPTIONS,
  { value: 'overlay', label: '文字叠图', hint: '整版大图 + 右下半透明文字卡' },
  { value: 'split', label: '上下分屏', hint: '上图下文 · 清爽杂志节奏' },
];

/**
 * 照片版式（cover / single / single-portrait）的样式缩略图。
 * 根据 layout + variant 画简化示意，不渲染真实 PageView，减少开销。
 */
function PhotoVariantThumb({
  layout,
  variant,
}: {
  layout: 'cover' | 'single' | 'single-portrait';
  variant: string | undefined;
}) {
  const primary = '#E11D48';
  const accent = '#F59E0B';
  const neutral = '#9CA3AF';
  const photoFill = '#E5E7EB';
  const bg = '#FFFFFF';

  // 一个照片矩形 + 标题 + 若干正文的通用积木
  const TitleLines = ({ color = primary }: { color?: string }) => (
    <>
      <rect x="10" y="58" width="34" height="3" fill={color} />
      <rect x="10" y="65" width="22" height="1.5" fill={neutral} />
    </>
  );

  // 封面 --------------------------------------------------
  if (layout === 'cover') {
    if (variant === 'poster') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
          <rect x="0" y="0" width="60" height="80" fill="#FFF7F7" />
          <text x="8" y="22" fontSize="3" fill={accent} letterSpacing="1.2">
            POSTER · 01
          </text>
          <rect x="8" y="28" width="40" height="7" fill={primary} />
          <rect x="8" y="40" width="30" height="3" fill={primary} />
          <rect x="8" y="48" width="30" height="1.5" fill={neutral} />
          <rect x="8" y="54" width="26" height="1.5" fill={neutral} />
          <circle cx="46" cy="58" r="7" fill={photoFill} stroke={primary} strokeWidth="1" />
          <line x1="8" y1="70" x2="52" y2="70" stroke={primary} strokeOpacity="0.25" />
          <text x="8" y="76" fontSize="2.5" fill={neutral}>
            BABY · 2024
          </text>
        </svg>
      );
    }
    if (variant === 'filmstrip') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#1A1A1A' }}>
          <rect x="0" y="0" width="60" height="4" fill="#fff" />
          <rect x="0" y="76" width="60" height="4" fill="#fff" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={`t-${i}`} x={2 + i * 7.5} y="0.5" width="5" height="3" fill="#1A1A1A" />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={`b-${i}`} x={2 + i * 7.5} y="76.5" width="5" height="3" fill="#1A1A1A" />
          ))}
          <rect x="0" y="6" width="60" height="68" fill={photoFill} />
          <rect x="0" y="54" width="60" height="20" fill="#000" opacity="0.55" />
          <rect x="6" y="58" width="30" height="4" fill="#fff" />
          <rect x="6" y="66" width="20" height="1.5" fill="#fff" opacity="0.7" />
        </svg>
      );
    }
    if (variant === 'minimal') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
          <text x="6" y="12" fontSize="2.5" fill={primary} letterSpacing="1.5">BABY · BOOK</text>
          <text x="8" y="32" fontSize="12" fill={accent} fontStyle="italic">01</text>
          <rect x="28" y="20" width="26" height="6" fill={primary} />
          <rect x="28" y="30" width="22" height="3" fill={primary} />
          <rect x="6" y="44" width="48" height="30" fill={photoFill} />
        </svg>
      );
    }
    if (variant === 'watercolor') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FFF8F4' }}>
          <rect x="6" y="10" width="48" height="30" fill={photoFill} rx="2" />
          <rect x="8" y="14" width="16" height="3" fill={primary} opacity="0.25" transform="rotate(-4 16 15.5)" />
          <rect x="10" y="48" width="40" height="5" fill={primary} />
          <rect x="10" y="58" width="28" height="2" fill={neutral} />
          <rect x="10" y="64" width="20" height="2" fill={neutral} />
          <circle cx="48" cy="66" r="2.5" fill={accent} />
        </svg>
      );
    }
    if (variant === 'cartoon') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FFF5E6' }}>
          <rect x="6" y="8" width="48" height="36" rx="10" fill={photoFill} stroke={primary} strokeWidth="2" />
          <rect x="14" y="50" width="32" height="10" rx="5" fill={bg} stroke={primary} strokeWidth="2" />
          <rect x="20" y="54" width="20" height="3" fill={primary} />
          <text x="16" y="72" fontSize="3" fill={neutral}>— BABY · 2024 —</text>
        </svg>
      );
    }
    if (variant === 'vintage') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#2A2118' }}>
          <line x1="6" y1="6" x2="54" y2="6" stroke={accent} strokeDasharray="2 2" />
          <rect x="6" y="12" width="48" height="34" fill={photoFill} stroke="#F2E7D0" strokeWidth="2" />
          <rect x="14" y="54" width="32" height="12" fill="#F2E7D0" transform="rotate(-2 30 60)" />
          <rect x="18" y="58" width="24" height="3" fill="#3D2F22" />
        </svg>
      );
    }
    if (variant === 'festival-cn') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FFF2F2' }}>
          <rect x="4" y="6" width="38" height="68" fill="none" stroke={primary} strokeWidth="2" />
          <rect x="6" y="8" width="34" height="64" fill={photoFill} />
          <rect x="46" y="12" width="4" height="30" fill={primary} />
          <rect x="46" y="46" width="8" height="8" fill={primary} transform="rotate(-6 50 50)" />
        </svg>
      );
    }
    if (variant === 'festival-xmas') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#F0F7F0' }}>
          <rect x="5" y="6" width="50" height="40" fill={photoFill} stroke={primary} strokeWidth="1.5" strokeDasharray="1 2" />
          <text x="16" y="56" fontSize="3" fill={accent}>❄ MERRY XMAS ❄</text>
          <rect x="16" y="60" width="28" height="4" fill={primary} />
          <rect x="22" y="68" width="16" height="2" fill={neutral} />
        </svg>
      );
    }
    // 跟随模板 / 未知
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <rect x="6" y="6" width="48" height="44" fill={photoFill} />
        <TitleLines />
      </svg>
    );
  }

  // 单图 --------------------------------------------------
  if (layout === 'single') {
    if (variant === 'fullbleed') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
          <rect x="0" y="0" width="60" height="80" fill={photoFill} />
          <rect x="0" y="62" width="60" height="18" fill="#000" opacity="0.55" />
          <rect x="6" y="68" width="36" height="2.5" fill="#fff" />
          <rect x="6" y="73" width="24" height="1.5" fill="#fff" opacity="0.75" />
        </svg>
      );
    }
    if (variant === 'card') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FBF6F1' }}>
          <rect x="8" y="8" width="44" height="58" fill={bg} stroke={neutral} strokeOpacity="0.2" />
          <rect x="11" y="11" width="38" height="40" fill={photoFill} />
          <rect x="14" y="55" width="26" height="2" fill={primary} />
          <rect x="14" y="60" width="20" height="1.5" fill={neutral} />
          <rect x="44" y="6" width="10" height="3" fill={primary} />
        </svg>
      );
    }
    if (variant === 'minimal') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
          <text x="4" y="40" fontSize="2.5" fill={accent} transform="rotate(-90 4 40)" letterSpacing="1.5">
            MOMENT · 01
          </text>
          <rect x="10" y="14" width="44" height="50" fill={photoFill} />
          <rect x="10" y="68" width="30" height="1.5" fill={neutral} />
        </svg>
      );
    }
    if (variant === 'watercolor') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FFF8F4' }}>
          <rect x="8" y="10" width="44" height="52" fill={photoFill} rx="2" />
          <rect x="32" y="56" width="22" height="8" fill={bg} stroke={primary} strokeDasharray="2 2" transform="rotate(-2 43 60)" />
          <rect x="34" y="58" width="14" height="1.5" fill={neutral} />
        </svg>
      );
    }
    if (variant === 'cartoon') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FFF5E6' }}>
          <rect x="8" y="16" width="44" height="52" rx="4" fill={photoFill} stroke={primary} strokeWidth="2" />
          <rect x="28" y="8" width="22" height="10" rx="5" fill={bg} stroke={primary} strokeWidth="1.5" />
          <rect x="32" y="12" width="14" height="2" fill={primary} />
        </svg>
      );
    }
    if (variant === 'vintage') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FBF4E6' }}>
          <rect x="12" y="10" width="38" height="46" fill={bg} stroke={neutral} strokeOpacity="0.4" transform="rotate(-2 31 33)" />
          <rect x="14" y="12" width="34" height="34" fill={photoFill} transform="rotate(-2 31 29)" />
          <rect x="16" y="64" width="28" height="2.5" fill={primary} />
        </svg>
      );
    }
    if (variant === 'festival-cn') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FFF2F2' }}>
          <rect x="6" y="8" width="48" height="64" fill={photoFill} stroke={primary} strokeWidth="1.5" />
          <rect x="42" y="16" width="8" height="30" fill={primary} />
          <rect x="44" y="20" width="4" height="20" fill="#fff" opacity="0.4" />
        </svg>
      );
    }
    if (variant === 'festival-xmas') {
      return (
        <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#F0F7F0' }}>
          <rect x="6" y="8" width="48" height="48" fill={photoFill} />
          <rect x="14" y="52" width="32" height="10" fill={bg} stroke={accent} strokeWidth="1.5" transform="rotate(-1 30 57)" />
          <text x="20" y="59" fontSize="3" fill={primary}>❄ XMAS ❄</text>
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <rect x="6" y="6" width="48" height="60" fill={photoFill} />
        <rect x="10" y="70" width="30" height="2" fill={primary} />
      </svg>
    );
  }

  // 单竖图 --------------------------------------------------
  if (variant === 'overlay') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <rect x="0" y="0" width="60" height="80" fill={photoFill} />
        <rect x="14" y="52" width="40" height="22" fill={bg} opacity="0.85" />
        <rect x="14" y="52" width="2" height="22" fill={primary} />
        <text x="18" y="58" fontSize="2.5" fill={accent} letterSpacing="1.5">STORY</text>
        <rect x="18" y="62" width="30" height="1.8" fill={neutral} />
        <rect x="18" y="66" width="26" height="1.8" fill={neutral} />
        <rect x="18" y="70" width="20" height="1.8" fill={neutral} />
      </svg>
    );
  }
  if (variant === 'split') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <rect x="0" y="0" width="60" height="48" fill={photoFill} />
        <rect x="0" y="48" width="60" height="32" fill="#FBF6F1" />
        <text x="8" y="58" fontSize="2.5" fill={accent} letterSpacing="1.5">CHAPTER · 01</text>
        <rect x="8" y="61" width="10" height="1" fill={primary} />
        <rect x="8" y="66" width="40" height="1.5" fill={neutral} />
        <rect x="8" y="71" width="34" height="1.5" fill={neutral} />
        <rect x="8" y="76" width="28" height="1.5" fill={neutral} />
      </svg>
    );
  }
  if (variant === 'minimal') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
        <rect x="4" y="12" width="30" height="56" fill={photoFill} />
        <text x="38" y="26" fontSize="2.5" fill={accent} letterSpacing="1.5">STORY</text>
        <rect x="38" y="30" width="6" height="1" fill={primary} />
        <rect x="38" y="38" width="18" height="1.5" fill={neutral} />
        <rect x="38" y="44" width="16" height="1.5" fill={neutral} />
        <rect x="38" y="50" width="14" height="1.5" fill={neutral} />
      </svg>
    );
  }
  if (variant === 'vintage') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FBF4E6' }}>
        <rect x="4" y="12" width="30" height="56" fill={photoFill} transform="rotate(-2 19 40)" />
        <text x="38" y="22" fontSize="2.5" fill={neutral} letterSpacing="1.5">NOTE · 01</text>
        <rect x="38" y="30" width="18" height="1.5" fill={neutral} />
        <rect x="38" y="36" width="14" height="1.5" fill={neutral} />
        <rect x="38" y="42" width="16" height="1.5" fill={neutral} />
      </svg>
    );
  }
  if (variant === 'watercolor') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FFF8F4' }}>
        <rect x="4" y="12" width="30" height="56" fill={photoFill} rx="2" />
        <text x="38" y="30" fontSize="12" fill={accent} fontFamily="serif">
          "
        </text>
        <rect x="38" y="38" width="18" height="1.5" fill={neutral} />
        <rect x="38" y="44" width="16" height="1.5" fill={neutral} />
        <rect x="38" y="56" width="8" height="1.5" fill={primary} opacity="0.5" rx="0.5" />
      </svg>
    );
  }
  if (variant === 'cartoon') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FFF5E6' }}>
        <rect x="4" y="12" width="30" height="56" fill={photoFill} rx="4" stroke={primary} strokeWidth="1.5" />
        <rect x="38" y="26" width="18" height="26" rx="6" fill={bg} stroke={primary} strokeWidth="1.5" />
        <polygon points="34,36 38,34 38,40" fill={primary} />
        <rect x="40" y="32" width="12" height="1.5" fill={neutral} />
        <rect x="40" y="38" width="10" height="1.5" fill={neutral} />
      </svg>
    );
  }
  if (variant === 'festival-cn') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#FFF2F2' }}>
        <rect x="4" y="12" width="30" height="56" fill={photoFill} stroke={primary} strokeWidth="1.5" />
        <rect x="42" y="18" width="2" height="30" fill={accent} />
        <rect x="52" y="18" width="2" height="30" fill={accent} />
        <rect x="45" y="20" width="6" height="26" fill={primary} />
      </svg>
    );
  }
  if (variant === 'festival-xmas') {
    return (
      <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: '#F0F7F0' }}>
        <rect x="4" y="12" width="30" height="56" fill={photoFill} />
        <text x="40" y="24" fontSize="5" fill={accent}>❄</text>
        <rect x="38" y="30" width="18" height="1.5" fill={primary} />
        <rect x="38" y="36" width="14" height="1.5" fill={neutral} />
        <text x="40" y="52" fontSize="5" fill={primary}>🎄</text>
      </svg>
    );
  }
  // single-portrait 跟随模板
  return (
    <svg viewBox="0 0 60 80" className="w-full h-full" style={{ background: bg }}>
      <rect x="4" y="12" width="30" height="56" fill={photoFill} />
      <rect x="38" y="22" width="16" height="2" fill={primary} />
      <rect x="38" y="30" width="14" height="1.5" fill={neutral} />
      <rect x="38" y="36" width="16" height="1.5" fill={neutral} />
      <rect x="38" y="42" width="12" height="1.5" fill={neutral} />
    </svg>
  );
}

/* ============================================================
 *  小型版式图标（按版式画几何示意图）
 * ============================================================ */
function LayoutIcon({ layout, active }: { layout: PageLayoutType; active: boolean }) {
  const stroke = active ? '#E11D48' : '#9CA3AF';
  const fill = active ? '#FDA4AF' : '#E5E7EB';
  return (
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none">
      <rect x="0.5" y="0.5" width="27" height="35" rx="2" stroke={stroke} fill="white" />
      {layout === 'cover' && (
        <>
          <rect x="4" y="4" width="20" height="18" fill={fill} />
          <rect x="6" y="25" width="16" height="2" fill={stroke} />
        </>
      )}
      {layout === 'single' && <rect x="4" y="4" width="20" height="28" fill={fill} />}
      {layout === 'single-portrait' && (
        <>
          <rect x="3" y="5" width="12" height="26" fill={fill} />
          <rect x="17" y="10" width="8" height="1.5" fill={stroke} />
          <rect x="17" y="14" width="7" height="1.5" fill={stroke} />
          <rect x="17" y="18" width="8" height="1.5" fill={stroke} />
        </>
      )}
      {layout === 'double' && (
        <>
          <rect x="3" y="6" width="10" height="24" fill={fill} />
          <rect x="15" y="6" width="10" height="24" fill={fill} />
        </>
      )}
      {layout === 'triple' && (
        <>
          <rect x="3" y="4" width="13" height="28" fill={fill} />
          <rect x="17" y="4" width="8" height="13" fill={fill} />
          <rect x="17" y="19" width="8" height="13" fill={fill} />
        </>
      )}
      {layout === 'grid4' && (
        <>
          <rect x="3" y="5" width="10" height="12" fill={fill} />
          <rect x="15" y="5" width="10" height="12" fill={fill} />
          <rect x="3" y="19" width="10" height="12" fill={fill} />
          <rect x="15" y="19" width="10" height="12" fill={fill} />
        </>
      )}
      {layout === 'grid5' && (
        <>
          <rect x="3" y="5" width="13" height="26" fill={fill} />
          <rect x="18" y="5" width="7" height="12" fill={fill} />
          <rect x="18" y="19" width="7" height="12" fill={fill} />
        </>
      )}
      {layout === 'grid6' && (
        <>
          {[0, 1, 2].map((r) =>
            [0, 1].map((c) => (
              <rect
                key={`${r}-${c}`}
                x={3 + c * 11}
                y={5 + r * 9}
                width="9"
                height="7.5"
                fill={fill}
              />
            )),
          )}
        </>
      )}
      {layout === 'text' && (
        <>
          <rect x="5" y="8" width="18" height="2" fill={stroke} />
          <rect x="5" y="13" width="14" height="1.5" fill={fill} />
          <rect x="5" y="17" width="16" height="1.5" fill={fill} />
          <rect x="5" y="21" width="12" height="1.5" fill={fill} />
          <rect x="5" y="25" width="15" height="1.5" fill={fill} />
        </>
      )}
      {layout === 'ending' && (
        <>
          <rect x="8" y="8" width="12" height="2" fill={stroke} />
          <rect x="6" y="14" width="16" height="1.5" fill={fill} />
          <rect x="6" y="18" width="16" height="1.5" fill={fill} />
          <rect x="6" y="22" width="13" height="1.5" fill={fill} />
          <rect x="10" y="28" width="8" height="1.5" fill={stroke} />
        </>
      )}
    </svg>
  );
}
