const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// --- token ---

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bt_token");
}

export function setToken(token: string): void {
  localStorage.setItem("bt_token", token);
}

export function removeToken(): void {
  localStorage.removeItem("bt_token");
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    removeToken();
    window.location.href = "/auth/login";
    throw new Error("Não autenticado");
  }
  return res;
}

// --- auth ---

export interface AuthUser {
  id: string;
  email: string;
  plan: string;
}

export async function register(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).access_token;
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).access_token;
}

export async function getMe(): Promise<AuthUser> {
  const res = await apiFetch(`${API}/auth/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- vídeos ---

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
  camera_orientation: "lateral" | "fundo";
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

export async function listVideos(): Promise<VideoStatus[]> {
  const res = await apiFetch(`${API}/videos/`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function uploadVideo(file: File): Promise<VideoStatus> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(`${API}/videos/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getVideo(id: string): Promise<VideoStatus> {
  const res = await apiFetch(`${API}/videos/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getThumbnailUrl(id: string): string {
  return `${API}/videos/${id}/thumbnail`;
}


export function getStreamUrl(id: string): string {
  return `${API}/videos/${id}/stream`;
}

export async function processVideo(
  id: string,
  courtRoi: [number, number][],
  cameraOrientation?: "lateral" | "fundo",
): Promise<void> {
  const res = await apiFetch(`${API}/videos/${id}/process`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ court_roi: courtRoi, camera_orientation: cameraOrientation ?? null }),
  });
  if (!res.ok) throw new Error(await res.text());
}
