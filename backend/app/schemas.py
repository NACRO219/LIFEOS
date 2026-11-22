from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Category = Literal["University", "Programming", "Chinese", "English", "French", "Fitness", "Personal", "Projects"]
Priority = Literal["low", "medium", "high", "critical"]
Mood = Literal["Great", "Good", "Okay", "Tired", "Stressed"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _check_day(v: Optional[str]) -> Optional[str]:
    if v in (None, ""):
        return None
    try:
        date.fromisoformat(v)
    except ValueError as exc:  # pragma: no cover - message path
        raise ValueError("must be a date in YYYY-MM-DD format") from exc
    return v


class CourseCreate(_Strict):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(default="", max_length=30)
    semester: str = Field(default="", max_length=40)
    credits: float = Field(ge=0, le=60)
    teacher: str = Field(default="", max_length=120)
    color: str = Field(default="#3986D8", pattern=r"^#[0-9a-fA-F]{6}$")


class CourseUpdate(_Strict):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, max_length=30)
    semester: Optional[str] = Field(default=None, max_length=40)
    credits: Optional[float] = Field(default=None, ge=0, le=60)
    teacher: Optional[str] = Field(default=None, max_length=120)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class TaskCreate(_Strict):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    category: Category = "University"
    due_date: Optional[str] = None
    priority: Priority = "medium"
    estimated_min: int = Field(default=30, ge=0, le=1440)
    xp: int = Field(default=20, ge=0, le=1000)

    _v_due = field_validator("due_date")(_check_day)


class TaskUpdate(_Strict):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    category: Optional[Category] = None
    due_date: Optional[str] = None
    priority: Optional[Priority] = None
    estimated_min: Optional[int] = Field(default=None, ge=0, le=1440)
    xp: Optional[int] = Field(default=None, ge=0, le=1000)

    _v_due = field_validator("due_date")(_check_day)


class CheckInCreate(_Strict):
    mood: Mood
    sleep_hours: float = Field(default=0, ge=0, le=24)
    wins: str = Field(default="", max_length=5000)
    blockers: str = Field(default="", max_length=5000)
    tomorrow_focus: str = Field(default="", max_length=5000)


class GradeCreate(_Strict):
    term: str = Field(min_length=1, max_length=60)
    gpa: float = Field(ge=0, le=4)
    credits: float = Field(gt=0, le=200)
