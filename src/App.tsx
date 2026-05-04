import { Routes, Route } from 'react-router-dom';
import { AppHeader } from './components/AppHeader';
import { HomePage } from './pages/HomePage';
import { CreatePage } from './pages/CreatePage';
import { MyBooksPage } from './pages/MyBooksPage';
import { BookDetailPage } from './pages/BookDetailPage';
import { BookEditorPage } from './pages/BookEditorPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { DraftProvider } from './DraftContext';
import { TemplateRegistryProvider } from './TemplateRegistry';

export default function App() {
  return (
    <TemplateRegistryProvider>
      <DraftProvider>
        <div className="min-h-screen">
          <AppHeader />
          <main>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/templates/new" element={<TemplateEditorPage />} />
              <Route path="/templates/edit/:id" element={<TemplateEditorPage />} />
              <Route path="/create" element={<CreatePage />} />
              <Route path="/my" element={<MyBooksPage />} />
              <Route path="/book/:id" element={<BookDetailPage />} />
              <Route path="/book/:id/edit" element={<BookEditorPage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </main>
        </div>
      </DraftProvider>
    </TemplateRegistryProvider>
  );
}
