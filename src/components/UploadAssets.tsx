import React, { useState } from 'react';

export function UploadAssets() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(e.target.files);
    }
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) {
      setMessage('Пожалуйста, выберите файлы для загрузки.');
      return;
    }

    setUploading(true);
    setMessage('');

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('/api/upload-zips', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (response.ok) {
        setMessage('✅ Файлы успешно загружены! Теперь вы можете запустить распаковку.');
      } else {
        setMessage('❌ Ошибка загрузки: ' + result.error);
      }
    } catch (error) {
      setMessage('❌ Ошибка сети при загрузке.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-center">
      <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">Загрузка ZIP Архивов</h2>
      <p className="text-sm text-slate-500 mb-6">
        Так как загрузить ZIP напрямую в редактор нельзя, выберите ваши скачанные ZIP-файлы GandalfHardcore здесь, и они загрузятся прямо на сервер!
      </p>
      
      <div className="mb-4">
        <input 
          type="file" 
          multiple 
          accept=".zip" 
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={uploading || !files}
        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
      >
        {uploading ? 'Загрузка...' : 'Загрузить на сервер'}
      </button>

      {message && (
        <div className="mt-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm">
          {message}
        </div>
      )}
    </div>
  );
}
