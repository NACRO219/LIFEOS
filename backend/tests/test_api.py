import json
import os
import sqlite3

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db}")
    monkeypatch.setenv("LIFEOS_SYNC_TOKEN", "test-token-0123456789abcdef")
    from app import database

    database.reset_engine()
    from app.main import app

    with TestClient(app) as c:
        yield c
    database.reset_engine()


AUTH = {"Authorization": "Bearer test-token-0123456789abcdef"}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["sync_enabled"] is True


def test_task_crud_and_validation(client):
    r = client.post("/api/tasks", json={"title": "  Essay  ", "category": "University", "due_date": "2026-12-01"})
    assert r.status_code == 201
    t = r.json()
    assert t["title"] == "Essay"
    # invalid inputs
    assert client.post("/api/tasks", json={"title": ""}).status_code == 422
    assert client.post("/api/tasks", json={"title": "x", "priority": "urgent"}).status_code == 422
    assert client.post("/api/tasks", json={"title": "x", "due_date": "2026-02-30"}).status_code == 422
    assert client.post("/api/tasks", json={"title": "x", "unknown": 1}).status_code == 422
    # toggle completion
    r = client.patch(f"/api/tasks/{t['id']}/complete")
    assert r.json()["completed"] is True and r.json()["completed_at"]
    r = client.patch(f"/api/tasks/{t['id']}", json={"priority": "high"})
    assert r.json()["priority"] == "high"
    assert client.delete(f"/api/tasks/{t['id']}").json() == {"ok": True}
    assert client.delete(f"/api/tasks/{t['id']}").status_code == 404


def test_courses_and_dashboard_gpa(client):
    assert client.post("/api/courses", json={"name": "Algebra", "credits": 3}).status_code == 201
    assert client.post("/api/courses", json={"name": "Bad", "credits": -1}).status_code == 422
    assert client.post("/api/courses", json={"name": "Bad", "credits": 3, "color": "red"}).status_code == 422
    client.post("/api/grades", json={"term": "S1", "gpa": 4.0, "credits": 10})
    client.post("/api/grades", json={"term": "S2", "gpa": 3.0, "credits": 30})
    assert client.post("/api/grades", json={"term": "S3", "gpa": 4.5, "credits": 3}).status_code == 422
    d = client.get("/api/dashboard").json()
    assert d["cumulative_gpa"] == pytest.approx(3.25)
    assert d["course_count"] == 1


def test_checkin_once_per_day(client):
    client.post("/api/checkins", json={"mood": "Good"})
    client.post("/api/checkins", json={"mood": "Tired"})
    rows = client.get("/api/checkins").json()
    assert len(rows) == 1 and rows[0]["mood"] == "Tired"
    assert client.get("/api/dashboard").json()["xp"] == 10
    assert client.post("/api/checkins", json={"mood": "Ecstatic"}).status_code == 422


def test_backup_requires_token_and_roundtrips(client):
    backup = {"format": "lifeos-backup", "schemaVersion": 2, "exportedAt": "2026-11-23T00:00:00Z", "settings": {}, "collections": {"tasks": [{"id": "a", "title": "x"}]}}
    assert client.put("/api/backup", json=backup).status_code == 401
    assert client.put("/api/backup", json=backup, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/api/backup", headers=AUTH).status_code == 404
    assert client.put("/api/backup", json={"hello": 1}, headers=AUTH).status_code == 422
    r = client.put("/api/backup", json=backup, headers=AUTH)
    assert r.status_code == 200 and r.json()["ok"]
    got = client.get("/api/backup", headers=AUTH).json()
    assert got == backup
    assert client.get("/api/backups", headers=AUTH).json()["count"] == 1


def test_backup_disabled_without_token(client, monkeypatch):
    monkeypatch.delenv("LIFEOS_SYNC_TOKEN")
    assert client.get("/api/backup", headers=AUTH).status_code == 503
    assert client.get("/api/health").json()["sync_enabled"] is False


def test_migration_upgrades_old_database_and_backs_it_up(tmp_path, monkeypatch):
    """A database created by the original starter keeps its data after migration."""
    db = tmp_path / "old.db"
    con = sqlite3.connect(db)
    con.executescript(
        """
        CREATE TABLE task (id INTEGER PRIMARY KEY, title VARCHAR NOT NULL, category VARCHAR NOT NULL, due_date VARCHAR,
          priority VARCHAR NOT NULL, xp INTEGER NOT NULL, completed BOOLEAN NOT NULL, created_at DATETIME NOT NULL);
        CREATE TABLE course (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL, credits FLOAT NOT NULL, teacher VARCHAR NOT NULL, color VARCHAR NOT NULL);
        INSERT INTO task VALUES (1, 'Old task', 'University', NULL, 'medium', 20, 1, '2026-11-01 10:00:00');
        INSERT INTO course VALUES (1, 'Old course', 3, '', '#3986D8');
        """
    )
    con.commit()
    con.close()
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db}")
    from app import database

    database.reset_engine()
    from app.main import app

    with TestClient(app) as c:
        tasks = c.get("/api/tasks").json()
        assert tasks[0]["title"] == "Old task" and tasks[0]["estimated_min"] == 30
        assert c.get("/api/courses").json()[0]["code"] == ""
    database.reset_engine()
    backups = [p for p in os.listdir(tmp_path) if p.startswith("old.db.bak-")]
    assert len(backups) == 1
