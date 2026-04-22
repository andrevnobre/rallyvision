"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getVideo, type VideoStatus, type VideoResult } from "@/lib/api";
import { BallHeatmap, PlayerHeatmap } from "@/components/Heatmap";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: VideoStatus["status"] }) {
  const styles = {
    pending:    "bg-gray-800 text-gray-400",
    processing: "bg-yellow-900 text-yellow-300 animate-pulse",
    done:       "bg-green-900 text-green-300",
    failed:     "bg-red-900 text-red-300",
  };
  const labels = { pending: "Na fila", processing: "A processar…", done: "Concluído", failed: "Falhou" };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const [video, setVideo] = useState<VideoStatus | null>(null);
  const [result, setResult] = useState<VideoResult | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const v = await getVideo(id);
      setVideo(v);
      if (v.status === "done" && v.result) {
        setResult(JSON.parse(v.result));
      } else if (v.status === "pending" || v.status === "processing") {
        timer = setTimeout(poll, 4000);
      }
    }

    poll();
    return () => clearTimeout(timer);
  }, [id]);

  if (!video) {
    return <div className="text-gray-500 text-center py-20">A carregar…</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold truncate max-w-sm">{video.filename}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(video.created_at).toLocaleString("pt-PT")}
          </p>
        </div>
        <StatusBadge status={video.status} />
      </div>

      {(video.status === "pending" || video.status === "processing") && (
        <div className="flex flex-col items-center gap-4 py-16 text-gray-500">
          <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          <p>A analisar o vídeo, por favor aguarde…</p>
        </div>
      )}

      {video.status === "failed" && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-5 text-red-300 text-sm">
          <strong>Erro:</strong> {video.error}
        </div>
      )}

      {video.status === "done" && result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Bola detetada"
              value={`${result.ball_detection_pct}%`}
              sub={`conf. média ${result.avg_ball_conf}`}
            />
            <StatCard
              label="2 jogadores"
              value={`${result.player_2_detection_pct}%`}
              sub={`conf. média ${result.avg_player_conf}`}
            />
            <StatCard
              label="Frames utilizáveis"
              value={`${result.usable_frames_pct}%`}
              sub="bola + 2 jogadores"
            />
            <StatCard
              label="Duração"
              value={`${result.duration_s}s`}
              sub={`${result.total_frames} frames · ${Math.round(result.fps)}fps`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <BallHeatmap positions={result.ball_positions} />
            <PlayerHeatmap positions={result.player_positions} />
          </div>

          <p className="text-xs text-gray-600 text-right">
            Processado em {result.processing_time_s}s · {result.resolution}
          </p>
        </>
      )}
    </div>
  );
}
