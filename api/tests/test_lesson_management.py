import copy

import pytest

from app.auth import User, current_user
from app.db import get_store
from app.main import app

AUTHOR = "00000000-0000-0000-0000-000000000001"
OTHER = "00000000-0000-0000-0000-000000000002"


@pytest.fixture
def actor():
    def set_actor(role="teacher", uid=AUTHOR):
        app.dependency_overrides[current_user] = lambda: User(id=uid, role=role)
    yield set_actor
    app.dependency_overrides.clear()


def draft():
    return {"id": "test-management", "track": "first-steps", "module": "purification", "minutes": 3,
            "title": {"en": "TEST management", "ar": "اختبار الإدارة"},
            "summary": {"en": "TEST lifecycle", "ar": "اختبار دورة الدرس"},
            "cards": [{"id": "c1", "kind": "concept", "title": {"en": "Wash", "ar": "الغسل"},
                       "body": {"en": "Wash your face", "ar": "اغسل الوجه"}, "sources": ["quran:5:6"]}]}


@pytest.mark.parametrize("level", [1, 2, 3, 4, "foundation", "deeper"])
def test_numbered_levels_and_legacy_drafts(client, actor, level):
    actor()
    lesson = {**draft(), "level": level}
    response = client.post("/api/review/drafts", json=lesson)
    assert response.status_code == 200
    expected = {"foundation": 1, "deeper": 2}.get(level, level)
    assert get_store().lessons[lesson["id"]]["level"] == expected


@pytest.mark.parametrize("level", [0, 5, "advanced"])
def test_invalid_levels_cannot_be_saved(client, actor, level):
    actor()
    assert client.post("/api/review/drafts", json={**draft(), "level": level}).status_code == 400


def test_lifecycle_preserves_position_then_deletes_and_audits(client, fake_llm, actor):
    fake_llm()
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    assert client.post("/api/review/test-management/submit").status_code == 200
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 403  # an author never approves
    actor("super_admin", OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    store = get_store()
    before = copy.deepcopy(store.tracks)
    assert "lesson:test-management:c1" in store.doc_sources
    assert client.post("/api/review/test-management/delete").status_code == 409
    actor("teacher", OTHER)
    assert client.post("/api/review/test-management/unpublish").status_code == 403
    actor()
    assert client.post("/api/review/test-management/unpublish").status_code == 200
    assert store.tracks == before
    assert [e["kind"] for e in store.events] == ["created", "submit", "approve", "unpublish"]
    assert "lesson:test-management:c1" not in store.doc_sources
    assert "test-management" not in client.get("/api/content").json()["lessons"]
    assert not any(l["id"] == "test-management" for t in client.get("/api/tracks").json() for m in t["modules"] for l in m["lessons"])
    actor("learner")
    assert client.get("/api/lessons/test-management").status_code == 404
    actor()
    assert client.post("/api/review/test-management/unpublish").status_code == 409
    # Publishing after Hide rebuilds retrieval; an admin can subsequently hide/delete it.
    assert client.post("/api/review/test-management/submit").status_code == 200
    actor("admin", OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    assert "lesson:test-management:c1" in store.doc_sources
    assert client.post("/api/review/test-management/unpublish").status_code == 200
    assert client.post("/api/review/test-management/delete").status_code == 200
    assert "test-management" not in store.lessons
    assert all("test-management" not in m["lessons"] for t in store.tracks for m in t["modules"])
    assert "lesson:test-management:c1" not in store.doc_sources
    assert store.admin_events[-1]["kind"] == "lesson_deleted"
    assert store.admin_events[-1]["payload"] == {"id": "test-management", "title": draft()["title"]}


def test_pending_source_rules_and_author_permissions(client, fake_llm, actor):
    store = get_store()
    store.sources["quran:5:6"]["review_status"] = "pending"
    store.reload_index()
    fake_llm()
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    assert client.post("/api/review/test-management/submit").status_code == 200
    actor("teacher", OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 403
    actor()
    assert client.post("/api/review/test-management/decision", json={"decision": "request_changes"}).status_code == 403
    actor("admin", OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 409
    assert store.sources["quran:5:6"]["review_status"] == "pending"
    assert "lesson:test-management:c1" not in store.doc_sources  # Tutor still excludes pending sources.


def test_checks_block_submission_and_publication(client, fake_llm, actor):
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    fake_llm({"issues": [{"severity": "high", "issue": "TEST blocking issue"}]})
    assert client.post("/api/review/test-management/submit").status_code == 409
    assert get_store().lessons["test-management"]["status"] == "draft"
    fake_llm()
    assert client.post("/api/review/test-management/submit").status_code == 200
    actor("admin", OTHER)
    fake_llm({"issues": [{"severity": "high", "issue": "TEST blocking issue"}]})
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 409
    assert get_store().lessons["test-management"]["status"] == "in_review"
    fake_llm()
    del get_store().sources["quran:5:6"]
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 409


def test_zero_citations_never_submit_or_publish(client, fake_llm, actor):
    actor()
    fake_llm()
    store = get_store()
    lesson = draft()
    lesson["cards"][0]["sources"] = []
    assert client.post("/api/review/drafts", json=lesson).status_code == 400
    store.lessons[lesson["id"]] = {**lesson, "status": "draft", "author_id": AUTHOR}
    assert client.post("/api/review/test-management/submit").status_code == 409
    store.lessons[lesson["id"]]["status"] = "in_review"
    actor("admin", OTHER)
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 409


def test_delete_refuses_any_progress_and_foreign_authors(client, actor):
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    actor("teacher", OTHER)
    assert client.post("/api/review/test-management/delete").status_code == 403
    actor("admin", OTHER)
    store = get_store()
    store.progress[(OTHER, "test-management")] = {"card_index": 0}
    before = copy.deepcopy(store.tracks)
    response = client.post("/api/review/test-management/delete")
    assert response.status_code == 409 and response.json()["error"]["code"] == "has_progress"
    assert "hidden" in response.json()["error"]["message"]
    assert "test-management" in store.lessons and store.tracks == before and not store.admin_events
    assert (OTHER, "test-management") in store.progress
    assert client.post("/api/review/missing/delete").status_code == 404
    assert client.post("/api/review/missing/unpublish").status_code == 404


@pytest.mark.parametrize("role", ["teacher", "admin", "super_admin"])
def test_planned_permissions_audit_and_validation(client, actor, role):
    actor(role)
    body = {"track": "first-steps", "module": "purification", "title": {"en": "TEST future", "ar": "اختبار قادم"}}
    store = get_store()
    before = copy.deepcopy(store.tracks)
    allowed = role != "teacher"
    assert client.post("/api/review/planned", json=body).status_code == (200 if allowed else 403)
    if not allowed:
        assert store.tracks == before and not store.admin_events
        assert client.post("/api/review/planned/remove", json={"track": body["track"], "module": body["module"], "index": 0}).status_code == 403
        return
    module = store.tracks[0]["modules"][0]
    index = len(module["planned"]) - 1
    assert module["planned"][index] == body["title"]
    assert store.admin_events[-1]["kind"] == "planned_title_added"
    assert client.post("/api/review/planned/remove", json={"track": body["track"], "module": body["module"], "index": index}).status_code == 200
    assert body["title"] not in module["planned"]
    assert store.admin_events[-1]["kind"] == "planned_title_removed"
    for title in [{"en": " ", "ar": "عنوان"}, {"en": "x" * 201, "ar": "عنوان"}, {"en": "Title", "ar": ""}]:
        assert client.post("/api/review/planned", json={**body, "title": title}).status_code == 400
    assert client.post("/api/review/planned", json={**body, "module": "missing"}).status_code == 400
    assert client.post("/api/review/planned", json={**body, "track": "missing"}).status_code == 400
    assert client.post("/api/review/planned/remove", json={"track": body["track"], "module": body["module"], "index": 999}).status_code == 404
    assert client.post("/api/review/planned/remove", json={"track": body["track"], "module": body["module"], "index": -1}).status_code == 400


@pytest.mark.parametrize("role,code", [("anonymous", 401), ("learner", 403)])
def test_learners_and_guests_cannot_manage_lessons(client, actor, role, code):
    actor(role, None if role == "anonymous" else OTHER)
    for suffix in ["unpublish", "delete"]:
        assert client.post(f"/api/review/wudu-order/{suffix}").status_code == code
    assert client.post("/api/review/planned", json={"track": "first-steps", "module": "purification", "title": {"en": "TEST", "ar": "اختبار"}}).status_code == code
    assert client.post("/api/review/planned/remove", json={"track": "first-steps", "module": "purification", "index": 0}).status_code == code


def test_editor_text_is_cleaned_and_plain_body_comes_from_it(client, actor):
    actor()
    lesson = draft()
    card = lesson["cards"][0]
    del card["body"]
    card["html"] = {"en": '<p onclick="x()">Wash <font color="#b94a2d" face="serif" size="5" style="color:red">your</font> face</p>'
                          '<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:x">now</a><b>!'}
    assert client.post("/api/review/drafts", json=lesson).status_code == 200
    saved = get_store().lessons[lesson["id"]]["cards"][0]
    assert saved["html"] == {"en": '<p>Wash <font color="#b94a2d" face="serif" size="5">your</font> face</p>now<b>!</b>', "ar": ""}
    assert saved["body"] == {"en": "Wash your face\nnow!", "ar": ""}
    card["html"] = {"en": '<blockquote data-tone="green" class="x">Note</blockquote><blockquote data-tone="url(x)">Other</blockquote><p data-tone="red">End</p>'}
    assert client.post("/api/review/drafts", json=lesson).status_code == 200
    assert get_store().lessons[lesson["id"]]["cards"][0]["html"]["en"] == '<blockquote data-tone="green">Note</blockquote><blockquote>Other</blockquote><p>End</p>'
    card["html"] = {"en": "<p><br></p>", "ar": "&nbsp;"}  # formatting with no text is not a body
    assert client.post("/api/review/drafts", json=lesson).status_code == 400


def test_lesson_in_one_language_cover_and_contributors(client, actor):
    actor()
    # Credits are the emails of the accounts that save the lesson: a list sent by the editor can neither add nor remove one.
    get_store().users = {AUTHOR: {"id": AUTHOR, "email": "amina@example.test", "display_name": "Amina"},
                         OTHER: {"id": OTHER, "email": "yusuf@example.test", "display_name": None}}
    lesson = {**draft(), "title": {"ar": "درس بالعربية"}, "contributors": ["Someone Else"],
              "cover": "data:image/webp;base64,UklGRg=="}
    assert client.post("/api/review/drafts", json=lesson).json()["contributors"] == ["amina@example.test"]
    actor("admin", OTHER)
    assert client.post("/api/review/drafts", json={**lesson, "contributors": []}).json()["contributors"] == ["amina@example.test", "yusuf@example.test"]
    actor()
    # An older entry made of the saver's profile name gives way to the email; other typed names stay.
    get_store().lessons[lesson["id"]]["contributors"] = ["Amina", "Faith Minds"]
    assert client.post("/api/review/drafts", json=lesson).json()["contributors"] == ["Faith Minds", "amina@example.test"]
    saved = get_store().lessons[lesson["id"]]
    assert saved["title"] == {"en": "", "ar": "درس بالعربية"} and saved["contributors"] == ["Faith Minds", "amina@example.test"]
    # Staff emails stay in Studio: learner responses carry no contributors.
    assert client.get(f"/api/lessons/{lesson['id']}").json()["contributors"] == ["Faith Minds", "amina@example.test"]
    live = next(l for l in get_store().lessons.values() if l["status"] == "published")
    live["contributors"] = ["amina@example.test"]
    actor("learner")
    assert "contributors" not in client.get(f"/api/lessons/{live['id']}").json()
    assert "contributors" not in client.get("/api/content").json()["lessons"][live["id"]]
    assert get_store().lessons[live["id"]]["contributors"] == ["amina@example.test"]
    actor()
    for bad in [{"title": {"en": " ", "ar": ""}}, {"cover": "javascript:alert(1)"}, {"cover": "data:image/svg+xml;base64,AAAA"},
                {"contributors": [""]}, {"contributors": ["x"] * 21}]:
        assert client.post("/api/review/drafts", json={**lesson, **bad}).status_code == 400


def test_tags(client, actor):
    actor()
    lesson = {**draft(), "tags": ["wudu", "طهارة"]}
    assert client.post("/api/review/drafts", json=lesson).status_code == 200
    assert get_store().lessons[lesson["id"]]["tags"] == ["wudu", "طهارة"]
    for bad in [[""], ["x" * 41], ["t"] * 13]:
        assert client.post("/api/review/drafts", json={**lesson, "tags": bad}).status_code == 400


def test_any_verse_can_be_quoted(client, actor):
    actor()
    verse = client.post("/api/review/sources/quran", json={"surah": 1, "ayah": 2}).json()
    assert verse["id"] == "quran:1:2" and verse["review_status"] == "pending" and verse["text_en"].startswith("[All] praise")
    assert "\u06dd" not in verse["text_ar"] and verse["ref_ar"].endswith("٢")
    get_store().sources["quran:1:2"]["review_status"] = "approved"  # a second pick keeps the library entry
    assert client.post("/api/review/sources/quran", json={"surah": 1, "ayah": 2}).json()["review_status"] == "approved"
    assert client.post("/api/review/sources/quran", json={"surah": 1, "ayah": 8}).status_code == 404
    quote = {"id": "q1", "kind": "quote", "title": {"en": "Al-Fatihah 1:2"}, "sources": ["quran:1:2"]}
    assert client.post("/api/review/drafts", json={**draft(), "cards": [*draft()["cards"], quote]}).status_code == 200
    actor("learner")
    assert client.post("/api/review/sources/quran", json={"surah": 1, "ayah": 1}).status_code == 403


def test_admin_can_submit_a_draft_they_did_not_write(client, fake_llm, actor):
    fake_llm()
    actor()
    assert client.post("/api/review/drafts", json=draft()).status_code == 200
    actor("teacher", OTHER)
    assert client.post("/api/review/test-management/submit").status_code == 403
    actor("admin", OTHER)
    assert client.post("/api/review/test-management/submit").status_code == 200
    assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
    assert get_store().lessons["test-management"]["author_id"] == AUTHOR
