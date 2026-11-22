from typing import Optional
from pydantic import BaseModel, Field

class CourseCreate(BaseModel):
    name: str
    credits: float = Field(ge=0)
    teacher: str = ""
    color: str = "#3986D8"

class TaskCreate(BaseModel):
    title: str
    category: str = "University"
    due_date: Optional[str] = None
    priority: str = "medium"
    xp: int = 20

class CheckInCreate(BaseModel):
    mood: str
    sleep_hours: float = 0
    wins: str = ""
    blockers: str = ""
    tomorrow_focus: str = ""

class GradeCreate(BaseModel):
    term: str
    gpa: float = Field(ge=0, le=4)
    credits: float = Field(gt=0)
