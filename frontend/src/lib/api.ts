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
  name: string | null;
  plan: string;
  is_admin: boolean;
}

export interface ProfileData {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  is_admin: boolean;
  created_at: string;
}

export interface VideoHistoryItem {
  id: string;
  filename: string;
  created_at: string;
  rally_count: number | null;
  avg_rally_duration_s: number | null;
  ball_detection_pct: number | null;
  duration_s: number | null;
  is_participant: boolean;
}

export interface CoachPlayerItem {
  player_id: string;
  player_email: string;
  player_name: string | null;
  linked_at: string;
  video_count: number;
}

export interface PlayerStats {
  player_id: string;
  player_email: string;
  player_name: string | null;
  linked_at: string;
  total_videos: number;
  avg_rally_count: number | null;
  avg_ball_detection_pct: number | null;
}

export interface ParticipantItem {
  user_id: string;
  email: string;
  name: string | null;
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
  share_token: string | null;
  is_participant: boolean;
}

export interface Rally {
  rally_id: number;
  start_frame: number;
  end_frame: number;
  duration_s: number;
  ball_detections: number;
}

export interface Shot {
  frame_start: number;
  frame_end: number;
  nx_start: number;
  ny_start: number;
  nx_end: number;
  ny_end: number;
  duration_s: number;
  player_id?: string;
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
  rally_count?: number;
  avg_rally_duration_s?: number;
  rallies?: Rally[];
  ball_positions: {
    frame: number; cx: number; cy: number; conf: number;
    nx?: number; ny?: number;
    proxy?: boolean; proxy_player_id?: string; proxy_dist_px?: number;
    _interpolated?: boolean;
  }[];
  player_positions: Record<string, { frame: number; cx: number; cy: number; nx?: number; ny?: number }[]>;
  shots?: Shot[];
}

export async function listVideos(): Promise<VideoStatus[]> {
  const res = await apiFetch(`${API}/videos/`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function uploadVideo(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<VideoStatus> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 201) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error("Resposta inválida do servidor")); }
      } else if (xhr.status === 401) {
        removeToken();
        window.location.href = "/auth/login";
        reject(new Error("Não autenticado"));
      } else {
        reject(new Error(xhr.responseText || `Erro ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Erro de rede durante o upload"));

    xhr.open("POST", `${API}/videos/upload`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  });
}

export async function getVideoProgress(id: string): Promise<{ progress: number; status: string }> {
  const res = await apiFetch(`${API}/videos/${id}/progress`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getVideo(id: string): Promise<VideoStatus> {
  const res = await apiFetch(`${API}/videos/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getVideoResult(id: string): Promise<VideoResult> {
  const res = await apiFetch(`${API}/videos/${id}/result`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getThumbnailUrl(id: string): string {
  return `${API}/videos/${id}/thumbnail`;
}


export function getStreamUrl(id: string): string {
  return `${API}/videos/${id}/stream`;
}

export async function createShareLink(id: string): Promise<VideoStatus> {
  const res = await apiFetch(`${API}/videos/${id}/share`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function revokeShareLink(id: string): Promise<VideoStatus> {
  const res = await apiFetch(`${API}/videos/${id}/share`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSharedVideo(token: string): Promise<VideoStatus> {
  const res = await fetch(`${API}/videos/shared/${token}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function processVideo(
  id: string,
  courtRoi: [number, number][],
  cameraOrientation?: "lateral" | "fundo",
  netPoints?: [number, number][] | null,
): Promise<void> {
  const body: Record<string, unknown> = {
    court_roi: courtRoi,
    camera_orientation: cameraOrientation ?? null,
  };
  if (netPoints && netPoints.length === 2) body.net_points = netPoints;
  const res = await apiFetch(`${API}/videos/${id}/process`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

// --- profile ---

export async function getProfile(): Promise<ProfileData> {
  const res = await apiFetch(`${API}/profile`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateProfile(body: {
  name?: string | null;
  current_password?: string;
  new_password?: string;
}): Promise<ProfileData> {
  const res = await apiFetch(`${API}/profile`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getProfileHistory(): Promise<VideoHistoryItem[]> {
  const res = await apiFetch(`${API}/profile/history`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- coach ---

export async function listCoachPlayers(): Promise<CoachPlayerItem[]> {
  const res = await apiFetch(`${API}/coach/players`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addCoachPlayer(email: string): Promise<CoachPlayerItem> {
  const res = await apiFetch(`${API}/coach/players`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function removeCoachPlayer(playerId: string): Promise<void> {
  const res = await apiFetch(`${API}/coach/players/${playerId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) throw new Error(await res.text());
}

export async function getCoachPlayer(playerId: string): Promise<PlayerStats> {
  const res = await apiFetch(`${API}/coach/players/${playerId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getCoachPlayerVideos(playerId: string): Promise<VideoHistoryItem[]> {
  const res = await apiFetch(`${API}/coach/players/${playerId}/videos`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- participantes em vídeos ---

export async function addVideoParticipants(videoId: string, emails: string[]): Promise<ParticipantItem[]> {
  const res = await apiFetch(`${API}/videos/${videoId}/participants`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ emails }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function removeVideoParticipant(videoId: string, userId: string): Promise<void> {
  const res = await apiFetch(`${API}/videos/${videoId}/participants/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) throw new Error(await res.text());
}

export async function listVideoParticipants(videoId: string): Promise<ParticipantItem[]> {
  const res = await apiFetch(`${API}/videos/${videoId}/participants`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- admin ---

export interface AdminUser {
  id: string;
  email: string;
  plan: string;
  is_admin: boolean;
  is_suspended: boolean;
  created_at: string;
  video_count: number;
}

export interface AdminVideoSummary {
  id: string;
  filename: string;
  status: string;
  error: string | null;
  created_at: string;
}

export interface AdminUserDetail extends AdminUser {
  videos: AdminVideoSummary[];
}

export interface AdminVideo {
  id: string;
  user_id: string | null;
  user_email: string | null;
  filename: string;
  status: string;
  error: string | null;
  created_at: string;
  has_share_token: boolean;
}

export interface AdminMetrics {
  users_total: number;
  by_plan: { free: number; pro: number; club: number };
  videos_total: number;
  by_status: { pending_roi: number; pending: number; queued: number; processing: number; done: number; failed: number };
  videos_today: number;
  errors_active: number;
}

export async function adminGetMetrics(): Promise<AdminMetrics> {
  const res = await apiFetch(`${API}/admin/metrics`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminListUsers(plan?: string, page = 1): Promise<AdminUser[]> {
  const params = new URLSearchParams({ page: String(page), limit: "50" });
  if (plan) params.set("plan", plan);
  const res = await apiFetch(`${API}/admin/users?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminGetUser(id: string): Promise<AdminUserDetail> {
  const res = await apiFetch(`${API}/admin/users/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminPatchUser(id: string, body: { plan?: string; is_suspended?: boolean }): Promise<AdminUser> {
  const res = await apiFetch(`${API}/admin/users/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminListVideos(status?: string, page = 1): Promise<AdminVideo[]> {
  const params = new URLSearchParams({ page: String(page), limit: "50" });
  if (status) params.set("status", status);
  const res = await apiFetch(`${API}/admin/videos?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function adminRetryVideo(id: string): Promise<void> {
  const res = await apiFetch(`${API}/admin/videos/${id}/retry`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function adminDeleteVideo(id: string): Promise<void> {
  const res = await apiFetch(`${API}/admin/videos/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) throw new Error(await res.text());
}

// --- anotações ---

export type AnnotationTag = "tecnica" | "posicionamento" | "tatico" | "mental";

export interface Annotation {
  id: string;
  video_id: string;
  author_id: string;
  author_email: string;
  author_name: string | null;
  parent_id: string | null;
  content: string;
  timestamp_s: number | null;
  court_x: number | null;
  court_y: number | null;
  frame_x: number | null;
  frame_y: number | null;
  tag: AnnotationTag | null;
  is_private: boolean;
  created_at: string;
  updated_at: string;
  replies: Annotation[];
}

export interface CreateAnnotationBody {
  content: string;
  timestamp_s?: number | null;
  court_x?: number | null;
  court_y?: number | null;
  frame_x?: number | null;
  frame_y?: number | null;
  tag?: AnnotationTag | null;
  is_private?: boolean;
  parent_id?: string | null;
}

export interface UpdateAnnotationBody {
  content?: string;
  tag?: AnnotationTag | null;
  is_private?: boolean;
}

export async function getAnnotations(videoId: string): Promise<Annotation[]> {
  const res = await apiFetch(`${API}/videos/${videoId}/annotations`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createAnnotation(videoId: string, body: CreateAnnotationBody): Promise<Annotation> {
  const res = await apiFetch(`${API}/videos/${videoId}/annotations`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateAnnotation(videoId: string, annId: string, body: UpdateAnnotationBody): Promise<Annotation> {
  const res = await apiFetch(`${API}/videos/${videoId}/annotations/${annId}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteAnnotation(videoId: string, annId: string): Promise<void> {
  const res = await apiFetch(`${API}/videos/${videoId}/annotations/${annId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) throw new Error(await res.text());
}
