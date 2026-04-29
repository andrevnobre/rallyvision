#!/usr/bin/env python3
"""
Aplica clean_ball_positions + extract_shots a todos os vídeos done que
ainda não têm o campo 'shots' no resultado.

Uso (dentro do container API ou com PYTHONPATH apontando para backend/):
  python scripts/backfill_shots.py [--dry-run]
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.models.video import Video
from app.services.ball_trajectory import enrich_result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        videos = db.query(Video).filter(Video.status == "done", Video.result.isnot(None)).all()
        print(f"{len(videos)} vídeos done encontrados")

        updated = 0
        skipped = 0
        for v in videos:
            result = json.loads(v.result)
            if "shots" in result:
                skipped += 1
                continue

            enriched = enrich_result(result)
            print(
                f"  {v.id[:8]}  bp {len(result.get('ball_positions', []))} → "
                f"{len(enriched['ball_positions'])}  shots={len(enriched['shots'])}"
            )
            if not args.dry_run:
                v.result = json.dumps(enriched, ensure_ascii=False)
                updated += 1

        if not args.dry_run:
            db.commit()

        print(f"\nActualizados: {updated}  Já tinham shots: {skipped}")
        if args.dry_run:
            print("(dry-run — nada foi gravado)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
