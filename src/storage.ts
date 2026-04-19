import { get, set, del, keys } from 'idb-keyval';
import type { Book } from './types';

const BOOK_PREFIX = 'babybook:';

export async function saveBook(book: Book): Promise<void> {
  await set(BOOK_PREFIX + book.id, book);
}

export async function getBook(id: string): Promise<Book | undefined> {
  return (await get(BOOK_PREFIX + id)) as Book | undefined;
}

export async function deleteBook(id: string): Promise<void> {
  await del(BOOK_PREFIX + id);
}

export async function listBooks(): Promise<Book[]> {
  const allKeys = await keys();
  const bookKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(BOOK_PREFIX),
  ) as string[];
  const books = await Promise.all(bookKeys.map((k) => get(k) as Promise<Book>));
  return books
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
