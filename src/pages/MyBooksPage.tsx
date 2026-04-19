import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBooks, deleteBook } from '../storage';
import { getTemplateById } from '../templates';
import { PageView } from '../components/PageView';
import type { Book } from '../types';

export function MyBooksPage() {
  const [books, setBooks] = useState<Book[] | null>(null);

  async function refresh() {
    const list = await listBooks();
    setBooks(list);
  }

  useEffect(() => {
    refresh();
  }, []);

  if (books === null) {
    return <div className="py-20 text-center text-neutral-500">加载中…</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-bold">我的画册</h1>
        <Link
          to="/create"
          className="px-5 py-2.5 rounded-full bg-neutral-900 text-white text-sm"
        >
          + 新建画册
        </Link>
      </div>

      {books.length === 0 ? (
        <div className="rounded-3xl bg-white/60 border border-white p-16 text-center">
          <div className="text-5xl mb-3">📖</div>
          <div className="font-display text-xl mb-2">还没有画册呢</div>
          <p className="text-neutral-600 text-sm mb-5">
            上传一些宝宝的照片，几秒钟就能生成你的第一本画册
          </p>
          <Link
            to="/create"
            className="inline-block px-6 py-2.5 rounded-full bg-neutral-900 text-white"
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
  const template = getTemplateById(book.templateId);
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
      className="group rounded-2xl overflow-hidden bg-white border border-black/5 shadow-sm hover:shadow-lg transition relative"
    >
      <div className="aspect-[3/4]">
        {template && cover ? (
          <PageView
            page={cover}
            photos={book.photos}
            template={template}
            babyName={book.babyName}
            dateRange={book.dateRange}
          />
        ) : (
          <div className="h-full bg-neutral-100 flex items-center justify-center text-neutral-400">
            无封面
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="font-bold text-sm truncate">{book.title}</div>
        <div className="text-[10px] text-neutral-500 mt-0.5">
          {template?.name ?? '未知模板'} · {book.pages.length} 页
        </div>
      </div>
      <button
        onClick={handleDelete}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-sm opacity-0 group-hover:opacity-100 transition"
        title="删除"
      >
        ×
      </button>
    </Link>
  );
}
