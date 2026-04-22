const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface VideoStatus {
  id: string;
  filename: string;
  status: "pending" | "processing" | "done" | "failed";
  created_at: string;
  error: string | null;
  result: string | null;
}

export interface VideoResult {
  fps: number;
  total_frames: number;
  duration_s: number;
  resolution: string;
  ball_detection_pct: number;
  player_1_detection_pct: number;
  player_2_detection_pct: number;
  usable_frames_pct: number;
  avg_ball_conf: number;
  avg_player_conf: number;
  processing_time_s: number;
  ball_positions: { frame: number; cx: number; cy: number; conf: number }[];
  player_positions: Record<string, { frame: number; cx: number; cy: number }[]>;
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
