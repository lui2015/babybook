import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBooks, deleteBook } from '../storage';
import { useTemplateRegistry } from '../TemplateRegistry';
import { PageView } from '../components/PageView';
import { useAuth } from '../AuthContext';
import type { Book } from '../types';

export function MyBooksPage() {
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const [books, setBooks] = useState<Book[] | null>(null);

  async function refresh() {
    setBooks(null);
    try {
      const list = await listBooks();
      setBooks(list);
    } catch (err) {
      console.warn('[my] load books failed', err);
      setBooks([]);
    }
  }

  // 登录态恢复后再加载，避免在登录态判定前抢跑
  useEffect(() => {
    if (authLoading) return;
    refresh();
    // 登录/登出切换都重新拉一次（云端 vs 本地）
  }, [authLoading, isAuthenticated]);

  if (authLoading || books === null) {
    return (
      <div className="py-20 text-center" style={{ color: 'var(--bb-fg-muted)' }}>
        加载中…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h1
          className="font-display text-2xl sm:text-3xl font-bold"
          style={{ color: 'var(--bb-fg)' }}
        >
          我的画册
        </h1>
        <Link
          to="/create"
          className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-sm bb-btn-primary whitespace-nowrap"
        >
          + 新建画册
        </Link>
      </div>

      {/* 数据来源横幅：清晰告诉用户画册存在哪 */}
      <div
        className="mb-6 rounded-2xl px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap"
        style={{
          background: 'var(--bb-pill-bg)',
          color: 'var(--bb-fg-muted)',
          border: '1px solid var(--bb-border)',
        }}
      >
        <span>
          {isAuthenticated ? (
            user?.isAnonymous ? (
              <>
                ☁️ <b style={{ color: 'var(--bb-fg)' }}>{user?.displayName}</b>
                ，画册保存在云端，下次用同一浏览器打开仍可见。
                <span style={{ color: 'var(--bb-primary)' }}>
                  {' '}升级为正式账号后即可在其他设备访问。
                </span>
              </>
            ) : (
              <>
                ☁️ <b style={{ color: 'var(--bb-fg)' }}>{user?.displayName}</b>
                ，画册已绑定到你的账号，可在任意设备登录访问。
              </>
            )
          ) : (
            <>💾 云端账户初始化中，画册暂存本机…</>
          )}
        </span>
      </div>

      {books.length === 0 ? (
        <div className="rounded-3xl p-16 text-center bb-card">
          <div className="text-5xl mb-3">📖</div>
          <div
            className="font-display text-xl mb-2"
            style={{ color: 'var(--bb-fg)' }}
          >
            还没有画册呢
          </div>
          <p
            className="text-sm mb-5"
            style={{ color: 'var(--bb-fg-muted)' }}
          >
            上传一些宝宝的照片，几秒钟就能生成你的第一本画册
          </p>
          <Link
            to="/create"
            className="inline-block px-6 py-2.5 rounded-full bb-btn-primary"
          >
            开始创建
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {books.map((b) => (
            <BookCard key={b.id} book={b} onDelete={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function BookCard({ book, onDelete }: { book: Book; onDelete: () => void }) {
  const { getTemplate } = useTemplateRegistry();
  const template = getTemplate(book.templateId);
  const cover = book.pages[0];

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`删除画册"${book.title}"？`)) return;
    await deleteBook(book.id);
    onDelete();
  }

  return (
    <Link
      to={`/book/${book.id}`}
      className="group rounded-2xl overflow-hidden bb-card hover:shadow-lg transition relative"
    >
      <div className="aspect-[3/4]">
        {template && cover ? (
          <PageView
            page={cover}
            photos={book.photos}
            template={template}
            babyName={book.babyName}
            dateRange={book.dateRange}
            photoFrameColor={book.theme?.photoFrameColor ?? null}
          />
        ) : (
          <div className="h-full bg-neutral-100 flex items-center justify-center text-neutral-400">
            无封面
          </div>
        )}
      </div>
      <div className="p-3">
        <div
          className="font-bold text-sm truncate"
          style={{ color: 'var(--bb-fg)' }}
        >
          {book.title}
        </div>
        <div
          className="text-[10px] mt-0.5"
          style={{ color: 'var(--bb-fg-muted)' }}
        >
          {template?.name ?? '未知模板'} · {book.pages.length} 页
        </div>
      </div>
      <button
        onClick={handleDelete}
        aria-label="删除画册"
        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white text-base flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition"
        title="删除"
      >
        ×
      </button>
    </Link>
  );
}
