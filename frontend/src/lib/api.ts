const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface VideoStatus {
  id: string;
  filename: string;
  status: "pending_roi" | "pending" | "processing" | "done" | "failed";
  created_at: string;
  error: string | null;
  result: string | null;
}

export interface VideoResult {
  fps: number;
  total_frames: number;
  duration_s: number;
  resolution: string;
  court_roi: [number, number][] | null;
  ball_detection_pct: number;
  player_1_detection_pct: number;
  player_2_detection_pct: number;
  usable_frames_pct: number;
  avg_ball_conf: number;
  avg_player_conf: number;
  processing_time_s: number;
  ball_positions: {
    frame: number; cx: number; cy: number; conf: number;
    nx?: number; ny?: number;
    proxy?: boolean; proxy_player_id?: string; proxy_dist_px?: number;
  }[];
  player_positions: Record<string, { frame: number; cx: number; cy: number; nx?: number; ny?: number }[]>;
}

export async function uploadVideo(file: File): Promise<VideoStatus> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/videos/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getVideo(id: string): Promise<VideoStatus> {
  const res = await fetch(`${API}/videos/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getThumbnailUrl(id: string): string {
  return `${API}/videos/${id}/thumbnail`;
}

export function getStreamUrl(id: string): string {
  return `${API}/videos/${id}/stream`;
}

export async function processVideo(id: string, courtRoi: [number, number][]): Promise<void> {
  const res = await fetch(`${API}/videos/${id}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ court_roi: courtRoi }),
  });
  if (!res.ok) throw new Error(await res.text());
}
