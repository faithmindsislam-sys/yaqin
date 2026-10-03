"""Lesson visibility, citations, ownership and curriculum rules."""

from .errors import ApiError


def lesson_source_ids(lesson: dict | None) -> list[str]:
    if not lesson:
        return []
    ids: list[str] = []
    for card in lesson.get("cards", []):
        ids += card.get("sources", [])
    for idea in lesson.get("explain_back", {}).get("key_ideas", []):
        if idea.get("source"):
            ids.append(idea["source"])
    for q in lesson.get("quiz", []):
        if q.get("source"):
            ids.append(q["source"])
    return list(dict.fromkeys(ids))


def lesson_summary(lesson: dict) -> dict:
    keys = ("id", "track", "module", "level", "minutes", "title", "summary", "cover", "status")
    return {k: lesson.get(k) for k in keys} | {"cards": len(lesson.get("cards", []))}


def card_docs(lesson: dict) -> list[tuple[str, str, list[str]]]:
    """(doc_id, text, source_ids) for each card's reviewed prose, in both languages.
    A card without its own sources points at the lesson's sources."""

    fallback = lesson_source_ids(lesson)
    title = " ".join((lesson.get("title") or {}).values())
    out = []
    for card in lesson.get("cards", []):
        parts = [title]
        for field in ("title", "body", "takeaway"):
            parts += [v for v in (card.get(field) or {}).values() if isinstance(v, str)]
        ids = card.get("sources") or fallback
        if ids:
            out.append((f"lesson:{lesson['id']}:{card.get('id')}", " ".join(parts), ids))
    return out


def tracks_with_lessons(tracks: list[dict], lessons: dict[str, dict]) -> list[dict]:
    out = []
    for t in tracks:
        modules = []
        for m in t.get("modules", []):
            items = [
                lesson_summary(lessons[i])
                for i in m.get("lessons", [])
                if i in lessons and lessons[i].get("status") == "published"
            ]
            modules.append({**{k: v for k, v in m.items() if k != "lessons"}, "lessons": items})
        out.append({**{k: v for k, v in t.items() if k != "modules"}, "modules": modules})
    return out


def ensure_approved(lesson: dict, sources: dict, approved: bool = True) -> None:
    ids = lesson_source_ids(lesson)
    if not ids or any(sid not in sources for sid in ids):
        raise ApiError(409, "unknown_sources", "A lesson must cite at least one known source.")
    if approved and any(sources[sid].get("review_status") != "approved" for sid in ids):
        raise ApiError(409, "unapproved_sources", "Approve every cited source before publishing this lesson.")


def curriculum_module(tracks: list[dict], track_id: str, module_id: str) -> dict:
    module = next((m for t in tracks if t["id"] == track_id for m in t["modules"] if m["id"] == module_id), None)
    if module is None:
        raise ApiError(400, "bad_request", "Choose an existing track and module.")
    return module


def check_owner(lesson: dict, actor_id: str | None, reviewer: bool) -> None:
    if not reviewer and (not actor_id or lesson.get("author_id") != actor_id):
        raise ApiError(403, "forbidden", "Only the author or an admin can manage this lesson.")


def edit_planned(
    tracks: list[dict], track: str, module: str, title: dict | None, index: int | None
) -> tuple[str, dict]:
    target = curriculum_module(tracks, track, module)
    planned = target.get("planned", [])
    if title is not None:
        index = len(planned)
        planned.append(title)
        kind = "planned_title_added"
    else:
        if index is None or index < 0 or index >= len(planned):
            raise ApiError(404, "not_found", "Coming soon title not found. Refresh the list.")
        title = planned.pop(index)
        kind = "planned_title_removed"
    target["planned"] = planned
    return kind, {"track": track, "module": module, "index": index, "title": title}
