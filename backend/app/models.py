from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Course(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    code: str = ""
    semester: str = ""
    credits: float = 0
    teacher: str = ""
    color: str = "#3986D8"


class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str = ""
    category: str = "University"
    due_date: Optional[str] = None
    priority: str = "medium"
    estimated_min: int = 30
    xp: int = 20
    completed: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    completed_at: Optional[datetime] = None


class CheckIn(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    day: str = Field(default_factory=lambda: date.today().isoformat())
    mood: str
    sleep_hours: float = 0
    wins: str = ""
    blockers: str = ""
    tomorrow_focus: str = ""
    xp_earned: int = 0


class GradeRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    term: str
    gpa: float
    credits: float


class BackupSnapshot(SQLModel, table=True):
    """A full LIFEOS app backup (JSON) uploaded from the phone."""

    id: Optional[int] = Field(default=None, primary_key=True)
    stored_at: datetime = Field(default_factory=utcnow, index=True)
    exported_at: str = ""
    schema_version: int = 0
    size: int = 0
    payload: str  # JSON text
