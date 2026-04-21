import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDraft } from '../DraftContext';
import { filesToPhotos } from '../imageUtils';
import { TEMPLATES, TEMPLATE_CATEGORIES, getTemplateById } from '../templates';
import { generatePages } from '../layoutEngine';
import { saveBook } from '../storage';
import { BookFlip } from '../components/BookFlip';
import type { Book } from '../types';

type Step = 'upload' | 'info' | 'template' | 'generate';

export function CreatePage() {
  const draft = useDraft();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('upload');
  const [searchParams, setSearchParams] = useSearchParams();

  // 从 URL 读取 templateId，预选模板（来自首页"热门模板"点击）
  const urlTemplateId = searchParams.get('templateId');
  const [presetHint, setPresetHint] = useState<string | null>(null);
  useEffect(() => {
    if (!urlTemplateId) return;
    const tpl = getTemplateById(urlTemplateId);
    if (tpl) {
      draft.setTemplateId(tpl.id);
      setPresetHint(tpl.name);
    }
    // 只在首次挂载时读取，读完后清掉 URL 参数，避免刷新时反复预选
    searchParams.delete('templateId');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Stepper step={step} setStep={setStep} draft={draft} />

      {presetHint && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose/30 bg-rose/10 px-4 py-2.5 text-sm text-neutral-700">
          <span>
            已为你预选模板 <b className="text-rose">「{presetHint}」</b>，先上传照片，最后一步可以随时更换。
          </span>
          <button
            onClick={() => setPresetHint(null)}
            className="text-neutral-400 hover:text-neutral-700"
            aria-label="关闭提示"
          >
            ×
          </button>
        </div>
      )}

      <div className="mt-6">
        {step === 'upload' && <StepUpload onNext={() => setStep('info')} />}
        {step === 'info' && (
          <StepInfo onBack={() => setStep('upload')} onNext={() => setStep('template')} />
        )}
        {step === 'template' && (
          <StepTemplate
            onBack={() => setStep('info')}
            onNext={() => setStep('generate')}
          />
        )}
        {step === 'generate' && (
          <StepGenerate
            onDone={async (book) => {
              await saveBook(book);
              navigate(`/book/${book.id}`);
            }}
            onBack={() => setStep('template')}
          />
        )}
      </div>
    </div>
  );
}

// ————— 步骤条 —————
function Stepper({
  step,
  setStep,
  draft,
}: {
  step: Step;
  setStep: (s: Step) => void;
  draft: ReturnType<typeof useDraft>;
}) {
  const steps: Array<{ key: Step; label: string; ok: boolean }> = [
    { key: 'upload', label: '1. 上传照片', ok: draft.photos.length >= 6 },
    { key: 'info', label: '2. 画册信息', ok: !!draft.babyName },
    { key: 'template', label: '3. 选择模板', ok: !!draft.templateId },
    { key: 'generate', label: '4. 生成预览', ok: false },
  ];
  return (
    <ol className="flex items-center gap-2 text-sm flex-wrap">
      {steps.map((s, i) => {
        const active = s.key === step;
        const canJump = i === 0 || steps[i - 1].ok;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <button
              disabled={!canJump}
              onClick={() => canJump && setStep(s.key)}
              className={`px-3 py-1.5 rounded-full border transition ${
                active
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : s.ok
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-white text-neutral-500 border-neutral-200'
              } ${!canJump && 'opacity-50 cursor-not-allowed'}`}
            >
              {s.label}
              {s.ok && !active && ' ✓'}
            </button>
            {i < steps.length - 1 && <span className="text-neutral-300">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ————— Step 1: 上传 —————
function StepUpload({ onNext }: { onNext: () => void }) {
  const { photos, addPhotos, removePhoto, setPhotos } = useDraft();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const accept = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    const valid = Array.from(files).filter(
      (f) => accept.includes(f.type) || f.name.match(/\.(jpg|jpeg|png|webp|heic)$/i),
    );
    if (valid.length === 0) {
      alert('请选择 JPG / PNG / WebP 格式的图片');
      return;
    }
    setLoading(true);
    setProgress({ done: 0, total: valid.length });
    try {
      const ps = await filesToPhotos(valid, (done, total) => setProgress({ done, total }));
      addPhotos(ps);
    } finally {
      setLoading(false);
    }
  }

  const canNext = photos.length >= 6;

  return (
    <div className="space-y-5">
      <label
        className="block cursor-pointer rounded-2xl border-2 border-dashed border-neutral-300 bg-white/70 p-10 text-center hover:border-rose hover:bg-white transition"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        <div className="text-4xl mb-2">📷</div>
        <div className="font-medium">点击或拖拽照片到这里上传</div>
        <div className="text-xs text-neutral-500 mt-1">
          至少 6 张，最多 60 张 · 支持 JPG / PNG / WebP
        </div>
        {loading && (
          <div className="mt-4 text-sm text-rose">
            正在处理 {progress.done} / {progress.total}...
          </div>
        )}
      </label>

      {photos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-neutral-600">
              已选 <span className="font-bold text-neutral-900">{photos.length}</span> 张
              {photos.length > 60 && <span className="text-rose">（已超上限，会保留前 60 张）</span>}
            </div>
            <button
              className="text-xs text-neutral-500 hover:text-rose"
              onClick={() => setPhotos([])}
            >
              全部清空
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative aspect-square group overflow-hidden rounded">
                <img src={p.src} className="h-full w-full object-cover" alt="" />
                <button
                  onClick={() => removePhoto(p.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          disabled={!canNext}
          onClick={onNext}
          className="px-6 py-2.5 rounded-full bg-neutral-900 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          下一步
        </button>
      </div>
    </div>
  );
}

// ————— Step 2: 信息 —————
function StepInfo({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { babyName, setBabyName, dateRange, setDateRange } = useDraft();
  return (
    <div className="max-w-md space-y-5 bg-white/70 backdrop-blur rounded-2xl p-6">
      <h2 className="font-display text-xl font-bold">填写画册信息</h2>
      <div>
        <label className="block text-sm text-neutral-600 mb-1">宝宝姓名 / 昵称 *</label>
        <input
          value={babyName}
          onChange={(e) => setBabyName(e.target.value)}
          placeholder="例如：小豆包"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 focus:border-rose focus:ring-0 outline-none bg-white"
        />
      </div>
      <div>
        <label className="block text-sm text-neutral-600 mb-1">画册时间范围</label>
        <input
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          placeholder="例如：2025.01 - 2026.04"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 focus:border-rose focus:ring-0 outline-none bg-white"
        />
      </div>
      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="px-5 py-2 rounded-full border border-neutral-200">
          上一步
        </button>
        <button
          disabled={!babyName}
          onClick={onNext}
          className="px-6 py-2.5 rounded-full bg-neutral-900 text-white disabled:opacity-40"
        >
          下一步
        </button>
      </div>
    </div>
  );
}

// ————— Step 3: 模板 —————
function StepTemplate({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { templateId, setTemplateId } = useDraft();
  const [category, setCategory] = useState<string>('全部');
  const list = TEMPLATES.filter((t) => category === '全部' || t.category === category);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {['全部', ...TEMPLATE_CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              category === c
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {list.map((t) => {
          const active = templateId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTemplateId(t.id)}
              className={`text-left rounded-2xl overflow-hidden bg-white border-2 transition ${
                active
                  ? 'border-rose shadow-lg scale-[1.02]'
                  : 'border-transparent hover:border-neutral-200'
              }`}
            >
              <div
                className="aspect-[3/4] flex flex-col items-center justify-center p-4 text-center"
                style={{
                  background: t.backgroundPattern
                    ? `${t.backgroundPattern}, ${t.colors.paper}`
                    : t.colors.paper,
                  color: t.colors.text,
                }}
              >
                <div className="text-3xl mb-2" style={{ color: t.colors.primary }}>
                  {t.decorations[0]}
                </div>
                <div
                  className="font-bold text-sm"
                  style={{ color: t.colors.primary, fontFamily: t.fontFamily.title }}
                >
                  {t.defaultTitle}
                </div>
                <div className="text-[10px] mt-1 opacity-70">{t.defaultSubtitle}</div>
              </div>
              <div className="px-3 py-2 text-xs flex items-center justify-between">
                <div>
                  <div className="font-bold">{t.name}</div>
                  <div className="text-[10px] text-neutral-500">{t.category}</div>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    t.isFree ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {t.isFree ? '免费' : 'VIP'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="px-5 py-2 rounded-full border border-neutral-200">
          上一步
        </button>
        <button
          disabled={!templateId}
          onClick={onNext}
          className="px-6 py-2.5 rounded-full bg-neutral-900 text-white disabled:opacity-40"
        >
          生成画册
        </button>
      </div>
    </div>
  );
}

// ————— Step 4: 生成 —————
function StepGenerate({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: (book: Book) => void;
}) {
  const { photos, babyName, dateRange, templateId } = useDraft();
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<Book | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  // 模拟进度 + 生成画册
  useEffect(() => {
    if (!templateId) return;
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(100, p + 20);
      setProgress(p);
      if (p >= 100) {
        clearInterval(timer);
        const tpl = getTemplateById(templateId)!;
        const pages = generatePages(photos, {
          insertTextPages: true,
          template: tpl,
          babyName,
          dateRange,
        });
        const book: Book = {
          id: `book_${Date.now().toString(36)}`,
          title: babyName ? `${babyName}的画册` : '我的画册',
          babyName,
          dateRange,
          templateId: tpl.id,
          pages,
          photos,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setTimeout(() => setPreview(book), 100);
      }
    }, 150);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!preview) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-5">
        <div className="text-5xl animate-bounce">🎨</div>
        <div className="font-display text-xl">正在为宝贝精心排版…</div>
        <div className="w-64 h-2 bg-white/80 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-peach to-rose transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-xs text-neutral-500">{progress}%</div>
      </div>
    );
  }

  const tpl = getTemplateById(preview.templateId)!;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-display text-2xl font-bold">画册已生成 🎉</div>
          <div className="text-sm text-neutral-600">
            共 {preview.pages.length} 页 · 模板 {tpl.name} · 左右箭头 / 键盘 ← → 翻页
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="px-4 py-2 rounded-full border border-neutral-200 text-sm">
            换个模板
          </button>
          <button
            onClick={() => onDone(preview)}
            className="px-5 py-2.5 rounded-full bg-neutral-900 text-white text-sm"
          >
            保存并查看
          </button>
        </div>
      </div>

      <BookFlip
        book={preview}
        template={tpl}
        index={pageIndex}
        onIndexChange={setPageIndex}
        minStageHeight="56vh"
      />

      <div className="text-center text-xs text-neutral-500">
        预览模式 · 保存后可在「我的画册」里继续翻阅，并支持下载 PDF / 打印
      </div>
    </div>
  );
}
