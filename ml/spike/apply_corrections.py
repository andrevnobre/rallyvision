#!/usr/bin/env python3
"""
Aplica um ficheiro de correções ao JSON de resultado do pipeline e opcionalmente
faz upload directo para a API de produção.

Uso:
  # Só gerar result corrigido em ficheiro
  python apply_corrections.py result.json corrections.json

  # Gerar + fazer upload para produção
  python apply_corrections.py result.json corrections.json \\
      --upload https://api.bt-vision.com --video-id <UUID> --token <JWT>

  # Descarregar result de produção, corrigir e re-upload
  python apply_corrections.py \\
      --download https://api.bt-vision.com --video-id <UUID> --token <JWT> \\
      corrections.json \\
      --upload https://api.bt-vision.com
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path


# ---------------------------------------------------------------------------
# Core: aplicar correções ao result JSON
# ---------------------------------------------------------------------------

def apply(result: dict, corrections: dict) -> dict:
    """Devolve uma cópia do result com as correções de nx/ny aplicadas."""
    import copy
    patched = copy.deepcopy(result)

    corr_map: dict[int, tuple[float, float]] = {}
    for c in corrections.get("corrections", []):
        corr_map[c["frame"]] = (c["corrected"]["nx"], c["corrected"]["ny"])

    if not corr_map:
        print("Aviso: nenhuma correção no ficheiro.")
        return patched

    corrected = 0
    for bp in patched.get("ball_positions", []):
        frame = bp["frame"]
        if frame in corr_map:
            old_nx, old_ny = bp.get("nx"), bp.get("ny")
            bp["nx"], bp["ny"] = corr_map[frame]
            bp["_correction"] = {
                "original_nx": old_nx, "original_ny": old_ny,
            }
            corrected += 1

    print(f"Aplicadas {corrected}/{len(corr_map)} correções de bola"
          f" ({len(patched.get('ball_positions',[]))} posições total).")
    return patched


# ---------------------------------------------------------------------------
# Download result de produção
# ---------------------------------------------------------------------------

def download_result(api_url: str, video_id: str, token: str) -> dict:
    url = f"{api_url.rstrip('/')}/videos/{video_id}/export"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        print(f"Resultado descarregado de {url}")
        return data
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Erro {e.code} ao descarregar resultado: {body}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Upload result corrigido para produção
# ---------------------------------------------------------------------------

def upload_result(api_url: str, video_id: str, token: str, result: dict) -> None:
    url = f"{api_url.rstrip('/')}/admin/videos/{video_id}/result"
    body = json.dumps(result).encode()
    req = urllib.request.Request(
        url, data=body, method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_data = json.loads(resp.read())
        print(f"Resultado actualizado em produção: {resp_data}")
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()
        print(f"Erro {e.code} ao fazer upload: {body_err}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Aplica correções de posições de bola ao JSON de resultado do pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "result_json", nargs="?",
        help="JSON de resultado local (omitir se usar --download)"
    )
    parser.add_argument(
        "corrections_json",
        help="JSON de correções gerado pelo ball_correction_tool.py"
    )
    parser.add_argument(
        "--output", "-o",
        help="Ficheiro de saída (por defeito: <result>_patched.json)"
    )
    parser.add_argument("--download", metavar="API_URL",
                        help="URL base da API para descarregar o resultado")
    parser.add_argument("--upload", metavar="API_URL",
                        help="URL base da API para fazer upload do resultado corrigido")
    parser.add_argument("--video-id", metavar="UUID",
                        help="ID do vídeo (necessário para --download e --upload)")
    parser.add_argument("--token", metavar="JWT",
                        help="Bearer token de autenticação (admin)")
    args = parser.parse_args()

    # Carregar resultado
    if args.download:
        if not args.video_id or not args.token:
            parser.error("--download requer --video-id e --token")
        result = download_result(args.download, args.video_id, args.token)
        if not args.result_json:
            # guardar cópia local antes de corrigir
            local_copy = f"result_{args.video_id[:8]}.json"
            with open(local_copy, "w") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            print(f"Cópia original guardada em {local_copy}")
    else:
        if not args.result_json:
            parser.error("Fornece result_json ou usa --download")
        with open(args.result_json) as f:
            result = json.load(f)

    # Carregar correções
    with open(args.corrections_json) as f:
        corrections = json.load(f)

    # Aplicar
    patched = apply(result, corrections)

    # Guardar localmente
    if args.output:
        out_path = Path(args.output)
    elif args.result_json:
        out_path = Path(args.result_json).with_name(
            Path(args.result_json).stem + "_patched.json"
        )
    else:
        out_path = Path(f"result_{args.video_id[:8]}_patched.json")

    with open(out_path, "w") as f:
        json.dump(patched, f, indent=2, ensure_ascii=False)
    print(f"Resultado corrigido guardado em {out_path}")

    # Upload
    if args.upload:
        if not args.video_id or not args.token:
            parser.error("--upload requer --video-id e --token")
        upload_result(args.upload, args.video_id, args.token, patched)


if __name__ == "__main__":
    main()
