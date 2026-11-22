from datetime import datetime, date
from typing import Optional
from sqlmodel import SQLModel, Field

class Course(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    credits: float = 0
    teacher: str = ""
    color: str = "#3986D8"

class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    category: str = "University"
    due_date: Optional[str] = None
    priority: str = "medium"
    xp: int = 20
    completed: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

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
