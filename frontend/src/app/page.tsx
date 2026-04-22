"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadVideo } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ALLOWED = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"];

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && ALLOWED.includes(f.type)) setFile(f);
  }

  async function onSubmit() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const video = await uploadVideo(file);
      router.push(`/videos/${video.id}`);
    } catch (e) {
      setError(String(e));
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 pt-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Analisar vídeo</h1>
        <p className="text-gray-400">Carregue um vídeo de beach tennis para análise automática</p>
      </div>

      <div
        className="w-full max-w-lg border-2 border-dashed border-gray-700 rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-gray-500 transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        {file ? (
          <span className="text-green-400 font-medium">{file.name}</span>
        ) : (
          <span className="text-gray-500 text-sm">Arraste o vídeo ou clique para selecionar<br />MP4, MOV, AVI, MKV · máx 2 GB</span>
        )}
        <input ref={inputRef} type="file" accept="video/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={!file || uploading}
        className="px-8 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-semibold transition-colors"
      >
        {uploading ? "A enviar…" : "Analisar"}
      </button>
    </div>
  );
}
