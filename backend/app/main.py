"""LIFEOS API.

The Android app is offline-first and does NOT need this server. The server offers:
  * the original LIFEOS REST API (courses, tasks, check-ins, GPA records, dashboard)
  * optional, token-protected backup storage for the phone app (PUT/GET /api/backup)

Configuration (environment variables or backend/.env):
  DATABASE_URL        default sqlite:///./lifeos.db
  CORS_ORIGINS        comma-separated, default http://localhost:5173,http://127.0.0.1:5173
  LIFEOS_SYNC_TOKEN   enables /api/backup; use a long random value (>= 24 chars).
                      When set, EVERY /api/* endpoint except /api/health requires
                      "Authorization: Bearer <token>", so a server reachable on your
                      network can't be read or changed by anyone else.
"""
from __future__ import annotations

import hmac
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session, col, func, select

load_dotenv()

from .database import SCHEMA_VERSION, get_session, migrate  # noqa: E402
from .models import BackupSnapshot, CheckIn, Course, GradeRecord, Task  # noqa: E402
from .schemas import CheckInCreate, CourseCreate, CourseUpdate, GradeCreate, TaskCreate, TaskUpdate  # noqa: E402

log = logging.getLogger("lifeos")

MAX_BACKUP_BYTES = 25 * 1024 * 1024
KEEP_BACKUPS = 20


@asynccontextmanager
async def lifespan(_: FastAPI):
    migrate()
    yield


def _token_matches(authorization: str | None, expected: str) -> bool:
    given = (authorization or "").removeprefix("Bearer ").strip()
    return bool(given) and hmac.compare_digest(given.encode(), expected.encode())


def require_api_auth(request: Request, authorization: str | None = Header(default=None)) -> None:
    """Protects the data endpoints whenever a token is configured (open only for local dev without one)."""
    if request.url.path == "/api/health" or request.url.path.startswith("/api/backup"):
        return  # health is public; backup routes enforce their own (stricter) rule
    expected = sync_token()
    if expected and not _token_matches(authorization, expected):
        raise HTTPException(401, "Invalid or missing API token")


app = FastAPI(title="LIFEOS API", version="2.0.0", lifespan=lifespan, dependencies=[Depends(require_api_auth)])
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):  # pragma: no cover - safety net
    log.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ---------------------------------------------------------------- helpers
def _get_or_404(session: Session, model, item_id: int, name: str):
    item = session.get(model, item_id)
    if not item:
        raise HTTPException(404, f"{name} not found")
    return item


def sync_token() -> str | None:
    t = os.getenv("LIFEOS_SYNC_TOKEN", "").strip()
    return t or None


def require_sync_auth(authorization: str | None = Header(default=None)) -> None:
    expected = sync_token()
    if not expected:
        raise HTTPException(503, "Sync is disabled: set LIFEOS_SYNC_TOKEN on the server")
    if not _token_matches(authorization, expected):
        raise HTTPException(401, "Invalid sync token")


# ---------------------------------------------------------------- health + dashboard
@app.get("/api/health")
def health():
    return {"status": "ok", "app": "LIFEOS", "version": app.version, "schema_version": SCHEMA_VERSION, "sync_enabled": sync_token() is not None}


@app.get("/api/dashboard")
def dashboard(session: Session = Depends(get_session)):
    tasks = session.exec(select(Task)).all()
    courses = session.exec(select(Course)).all()
    checkins = session.exec(select(CheckIn)).all()
    grades = session.exec(select(GradeRecord)).all()
    xp = sum(t.xp for t in tasks if t.completed) + sum(c.xp_earned for c in checkins)
    completed = sum(1 for t in tasks if t.completed)
    streak = 0
    checkin_days = {c.day for c in checkins}
    day = date.today()
    while day.isoformat() in checkin_days:
        streak += 1
        day -= timedelta(days=1)
    weighted = sum(g.gpa * g.credits for g in grades)
    credits = sum(g.credits for g in grades)
    return {
        "xp": xp,
        "level": xp // 500 + 1,
        "completed_tasks": completed,
        "total_tasks": len(tasks),
        "course_count": len(courses),
        "streak": streak,
        "cumulative_gpa": round(weighted / credits, 3) if credits else None,
        "earned_credits": credits,
    }


# ---------------------------------------------------------------- courses
@app.get("/api/courses")
def list_courses(session: Session = Depends(get_session)):
    return session.exec(select(Course).order_by(col(Course.id).desc())).all()


@app.post("/api/courses", status_code=201)
def add_course(data: CourseCreate, session: Session = Depends(get_session)):
    item = Course(**data.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.patch("/api/courses/{course_id}")
def update_course(course_id: int, data: CourseUpdate, session: Session = Depends(get_session)):
    item = _get_or_404(session, Course, course_id, "Course")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.delete("/api/courses/{course_id}")
def delete_course(course_id: int, session: Session = Depends(get_session)):
    item = _get_or_404(session, Course, course_id, "Course")
    session.delete(item)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------- tasks
@app.get("/api/tasks")
def list_tasks(session: Session = Depends(get_session)):
    return session.exec(select(Task).order_by(col(Task.completed), col(Task.id).desc())).all()


@app.post("/api/tasks", status_code=201)
def add_task(data: TaskCreate, session: Session = Depends(get_session)):
    item = Task(**data.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, data: TaskUpdate, session: Session = Depends(get_session)):
    item = _get_or_404(session, Task, task_id, "Task")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.patch("/api/tasks/{task_id}/complete")
def complete_task(task_id: int, session: Session = Depends(get_session)):
    """Toggles completion (kept for compatibility with the original frontend)."""
    item = _get_or_404(session, Task, task_id, "Task")
    item.completed = not item.completed
    item.completed_at = datetime.now(timezone.utc) if item.completed else None
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, session: Session = Depends(get_session)):
    item = _get_or_404(session, Task, task_id, "Task")
    session.delete(item)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------- check-ins
@app.get("/api/checkins")
def list_checkins(session: Session = Depends(get_session)):
    return session.exec(select(CheckIn).order_by(col(CheckIn.id).desc())).all()


@app.post("/api/checkins")
def add_checkin(data: CheckInCreate, session: Session = Depends(get_session)):
    """One check-in per day; submitting again updates it (XP is not awarded twice)."""
    today = date.today().isoformat()
    existing = session.exec(select(CheckIn).where(CheckIn.day == today)).first()
    if existing:
        for k, v in data.model_dump().items():
            setattr(existing, k, v)
        existing.xp_earned = 10
        item = existing
    else:
        item = CheckIn(day=today, **data.model_dump(), xp_earned=10)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


# ---------------------------------------------------------------- grades
@app.post("/api/grades", status_code=201)
def add_grade(data: GradeCreate, session: Session = Depends(get_session)):
    item = GradeRecord(**data.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@app.get("/api/grades")
def list_grades(session: Session = Depends(get_session)):
    return session.exec(select(GradeRecord).order_by(col(GradeRecord.id))).all()


@app.delete("/api/grades/{grade_id}")
def delete_grade(grade_id: int, session: Session = Depends(get_session)):
    item = _get_or_404(session, GradeRecord, grade_id, "Grade record")
    session.delete(item)
    session.commit()
    return {"ok": True}


# ---------------------------------------------------------------- phone backups (optional sync)
@app.put("/api/backup", dependencies=[Depends(require_sync_auth)])
async def put_backup(request: Request, session: Session = Depends(get_session)):
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BACKUP_BYTES:
        raise HTTPException(413, "Backup is too large")
    # Read incrementally so an oversized or lying upload is rejected without buffering all of it.
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_BACKUP_BYTES:
            raise HTTPException(413, "Backup is too large")
        chunks.append(chunk)
    raw = b"".join(chunks)
    try:
        text_body = raw.decode("utf-8")
        data = json.loads(text_body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(422, "Body must be UTF-8 JSON") from exc
    if not isinstance(data, dict) or data.get("format") != "lifeos-backup" or not isinstance(data.get("collections"), dict):
        raise HTTPException(422, "Not a LIFEOS backup")
    snap = BackupSnapshot(
        exported_at=str(data.get("exportedAt", ""))[:40],
        schema_version=int(data.get("schemaVersion", 0) or 0),
        size=len(raw),
        payload=text_body,
    )
    session.add(snap)
    session.commit()
    session.refresh(snap)
    # keep only the newest N snapshots
    old = session.exec(select(BackupSnapshot).order_by(col(BackupSnapshot.stored_at).desc()).offset(KEEP_BACKUPS)).all()
    for o in old:
        session.delete(o)
    session.commit()
    return {"ok": True, "id": snap.id, "stored_at": snap.stored_at.isoformat(), "size": snap.size}


@app.get("/api/backup", dependencies=[Depends(require_sync_auth)])
def get_backup(session: Session = Depends(get_session)):
    snap = session.exec(select(BackupSnapshot).order_by(col(BackupSnapshot.stored_at).desc(), col(BackupSnapshot.id).desc())).first()
    if not snap:
        raise HTTPException(404, "No backup stored yet")
    return JSONResponse(content=json.loads(snap.payload))


@app.get("/api/backups", dependencies=[Depends(require_sync_auth)])
def list_backups(session: Session = Depends(get_session)):
    rows = session.exec(select(BackupSnapshot).order_by(col(BackupSnapshot.stored_at).desc())).all()
    return {
        "count": session.exec(select(func.count()).select_from(BackupSnapshot)).one(),
        "backups": [{"id": r.id, "stored_at": r.stored_at.isoformat(), "exported_at": r.exported_at, "size": r.size, "schema_version": r.schema_version} for r in rows],
    }
