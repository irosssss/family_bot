import React, { useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

interface UploadAssetsProps {
  actorId: number;
}

export function UploadAssets({ actorId }: UploadAssetsProps) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(event.target.files);
  };

  const handleUpload = async () => {
    if (!files?.length) {
      setMessage('Пожалуйста, выберите ZIP-файлы для загрузки.');
      return;
    }

    setUploading(true);
    setMessage('');
    const formData = new FormData();
    formData.append('actorId', String(actorId));
    Array.from(files).forEach((file) => formData.append('files', file));

    try {
      const response = await apiFetch('/api/upload-zips', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      setMessage(
        response.ok
          ? 'Файлы загружены, распаковка запущена.'
          : `Ошибка загрузки: ${result.error || 'неизвестная ошибка'}`,
      );
    } catch {
      setMessage('Ошибка сети при загрузке.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl bg-white p-6 text-center shadow-sm dark:bg-slate-800">
      <h2 className="mb-4 text-xl font-bold text-slate-800 dark:text-white">
        Загрузка игровых ZIP-архивов
      </h2>
      <p className="mb-6 text-sm text-slate-500">
        Выберите архивы ассетов Family Chores RPG. Сервер примет только файлы ZIP.
      </p>
      <div className="mb-4">
        <input
          type="file"
          multiple
          accept=".zip"
          onChange={handleFileChange}
          className="block min-h-11 w-full text-sm text-slate-500 file:mr-4 file:min-h-11 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>
      <button
        type="button"
        onClick={handleUpload}
        disabled={uploading || !files?.length}
        className="min-h-11 rounded-lg bg-blue-600 px-6 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {uploading ? 'Загрузка...' : 'Загрузить на сервер'}
      </button>
      {message && (
        <div className="mt-4 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-700">
          {message}
        </div>
      )}
    </div>
  );
}
