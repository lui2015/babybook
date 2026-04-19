import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Photo } from './types';

interface DraftState {
  photos: Photo[];
  babyName: string;
  dateRange: string;
  templateId: string | null;
  setPhotos: (p: Photo[]) => void;
  addPhotos: (p: Photo[]) => void;
  removePhoto: (id: string) => void;
  setBabyName: (s: string) => void;
  setDateRange: (s: string) => void;
  setTemplateId: (id: string | null) => void;
  reset: () => void;
}

const DraftContext = createContext<DraftState | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [babyName, setBabyName] = useState('');
  const [dateRange, setDateRange] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);

  const addPhotos = (ps: Photo[]) =>
    setPhotos((prev) => {
      const merged = [...prev, ...ps];
      return merged.slice(0, 60); // 上限 60 张
    });

  const removePhoto = (id: string) =>
    setPhotos((prev) => prev.filter((p) => p.id !== id));

  const reset = () => {
    setPhotos([]);
    setBabyName('');
    setDateRange('');
    setTemplateId(null);
  };

  return (
    <DraftContext.Provider
      value={{
        photos,
        babyName,
        dateRange,
        templateId,
        setPhotos,
        addPhotos,
        removePhoto,
        setBabyName,
        setDateRange,
        setTemplateId,
        reset,
      }}
    >
      {children}
    </DraftContext.Provider>
  );
}

export function useDraft() {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useDraft 必须在 DraftProvider 中使用');
  return ctx;
}
