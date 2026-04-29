"""
Post-processing for ball trajectory data.

clean_ball_positions: filters outliers and interpolates short gaps.
extract_shots: detects individual shot events (origin → destination pairs).
enrich_result: applies both to a result dict.
"""

from __future__ import annotations

import math

# Beach tennis ball max realistic speed: ~120 km/h = 33 m/s
# Court longest axis: 16 m, normalized to [0, 1]
# Max normalized distance per frame at 30fps: 33/16/30 ≈ 0.069
# Use 2.5x safety margin to keep edge cases, reject clear teleports
_MAX_NORM_SPEED_PER_FRAME = 0.17  # at 30fps; scales with fps

# Interpolate gaps up to this many frames (≈0.17s at 30fps)
_MAX_INTERP_GAP = 5

# Shot detection: minimum frames between two shots (≈0.25s at 30fps)
_MIN_SHOT_DURATION_S = 0.25

# Direction reversal: sliding window to smooth velocity
_VEL_WINDOW = 5

# Minimum movement magnitude in each leg to count as reversal (not noise)
_MIN_MOVEMENT = 0.04


def _dist(a: dict, b: dict) -> float:
    return math.sqrt((a["nx"] - b["nx"]) ** 2 + (a["ny"] - b["ny"]) ** 2)


def clean_ball_positions(positions: list[dict], fps: float) -> list[dict]:
    """
    1. Remove entries with nx/ny outside [0, 1]
    2. Remove velocity outliers (teleports)
    3. Linearly interpolate short gaps
    """
    valid = [
        p for p in positions
        if 0.0 <= p.get("nx", -1) <= 1.0 and 0.0 <= p.get("ny", -1) <= 1.0
    ]
    if not valid:
        return []

    valid.sort(key=lambda p: p["frame"])

    # Velocity filter — threshold scales with frame gap
    speed_threshold = _MAX_NORM_SPEED_PER_FRAME * (30.0 / max(fps, 1.0))
    filtered: list[dict] = [valid[0]]
    for p in valid[1:]:
        prev = filtered[-1]
        gap = max(1, p["frame"] - prev["frame"])
        if _dist(p, prev) <= speed_threshold * gap:
            filtered.append(p)

    # Interpolate short gaps
    result: list[dict] = []
    for i, p in enumerate(filtered):
        result.append(p)
        if i < len(filtered) - 1:
            nxt = filtered[i + 1]
            gap = nxt["frame"] - p["frame"]
            if 1 < gap <= _MAX_INTERP_GAP:
                for f in range(p["frame"] + 1, nxt["frame"]):
                    t = (f - p["frame"]) / gap
                    result.append({
                        "frame": f,
                        "cx": 0, "cy": 0,
                        "nx": round(p["nx"] + t * (nxt["nx"] - p["nx"]), 4),
                        "ny": round(p["ny"] + t * (nxt["ny"] - p["ny"]), 4),
                        "conf": 0.0,
                        "_interpolated": True,
                    })

    return result


def _nearest_player(frame: int, player_positions: dict, nx: float, ny: float) -> str | None:
    """Return player_id of the player closest to (nx, ny) at the given frame."""
    best_id: str | None = None
    best_d = float("inf")
    for pid, entries in player_positions.items():
        # find nearest frame for this player
        closest = min(entries, key=lambda e: abs(e["frame"] - frame), default=None)
        if closest is None:
            continue
        pnx = closest.get("nx")
        pny = closest.get("ny")
        if pnx is None or pny is None:
            continue
        d = math.sqrt((nx - pnx) ** 2 + (ny - pny) ** 2)
        if d < best_d:
            best_d = d
            best_id = pid
    return best_id


def extract_shots(
    ball_positions: list[dict],
    player_positions: dict,
    fps: float,
    orientation: str = "lateral",
) -> list[dict]:
    """
    Detect shot events as direction reversals on the primary court axis.

    Lateral camera: primary axis is nx (16 m axis runs left-right).
    Fundo camera:   primary axis is ny.

    Each shot: {frame_start, nx_start, ny_start, frame_end, nx_end, ny_end,
                duration_s, player_id?}
    """
    positions = sorted(ball_positions, key=lambda p: p["frame"])
    n = len(positions)
    if n < _VEL_WINDOW * 2 + 1:
        return []

    axis = "nx" if orientation != "fundo" else "ny"
    min_shot_frames = fps * _MIN_SHOT_DURATION_S

    contact_indices: list[int] = []
    for i in range(_VEL_WINDOW, n - _VEL_WINDOW):
        v_before = positions[i][axis] - positions[i - _VEL_WINDOW][axis]
        v_after = positions[i + _VEL_WINDOW][axis] - positions[i][axis]
        # Direction reversal with sufficient movement in both legs
        if (
            v_before * v_after < 0
            and abs(v_before) > _MIN_MOVEMENT
            and abs(v_after) > _MIN_MOVEMENT
        ):
            contact_indices.append(i)

    # Deduplicate nearby contacts — keep the one with the sharpest reversal
    deduped: list[int] = []
    for idx in contact_indices:
        if not deduped:
            deduped.append(idx)
            continue
        prev_idx = deduped[-1]
        if positions[idx]["frame"] - positions[prev_idx]["frame"] < min_shot_frames:
            # Keep the one with larger combined movement magnitude
            v_prev = abs(positions[prev_idx][axis] - positions[prev_idx - _VEL_WINDOW][axis])
            v_curr = abs(positions[idx][axis] - positions[idx - _VEL_WINDOW][axis])
            if v_curr > v_prev:
                deduped[-1] = idx
        else:
            deduped.append(idx)

    boundaries = [0] + deduped + [n - 1]
    shots: list[dict] = []

    for i in range(len(boundaries) - 1):
        s_idx = boundaries[i]
        e_idx = boundaries[i + 1]
        sp = positions[s_idx]
        ep = positions[e_idx]

        duration_s = (ep["frame"] - sp["frame"]) / fps
        if duration_s < _MIN_SHOT_DURATION_S or duration_s > 12.0:
            continue

        shot: dict = {
            "frame_start": sp["frame"],
            "frame_end": ep["frame"],
            "nx_start": sp["nx"],
            "ny_start": sp["ny"],
            "nx_end": ep["nx"],
            "ny_end": ep["ny"],
            "duration_s": round(duration_s, 2),
        }
        pid = _nearest_player(sp["frame"], player_positions, sp["nx"], sp["ny"])
        if pid:
            shot["player_id"] = pid
        shots.append(shot)

    return shots


def enrich_result(result: dict) -> dict:
    """
    Apply clean_ball_positions and extract_shots to a result dict.
    Returns a new dict (does not mutate the input).
    """
    fps = result.get("fps") or 30.0
    orientation = result.get("camera_orientation") or "lateral"
    ball_positions = result.get("ball_positions") or []
    player_positions = result.get("player_positions") or {}

    cleaned = clean_ball_positions(ball_positions, fps)
    shots = extract_shots(cleaned, player_positions, fps, orientation)

    return {
        **result,
        "ball_positions": cleaned,
        "shots": shots,
    }
