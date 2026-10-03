"""Read bundled tracks, lessons and sources for local storage and seeding."""

import json
from pathlib import Path


def load_content(content_dir: Path) -> tuple[list[dict], dict[str, dict], dict[str, dict]]:
    tracks_path = content_dir / "tracks.json"
    tracks = json.loads(tracks_path.read_text()) if tracks_path.exists() else []
    lessons = {}
    for p in sorted((content_dir / "lessons").glob("*.json")):
        data = json.loads(p.read_text())
        lessons[data["id"]] = data
    sources = {}
    for p in sorted((content_dir / "sources").glob("*.json")):
        for s in json.loads(p.read_text()):
            sources[s["id"]] = s
    return tracks, lessons, sources
