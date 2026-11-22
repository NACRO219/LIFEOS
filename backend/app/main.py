from datetime import date
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from .database import create_db_and_tables, get_session
from .models import Course, Task, CheckIn, GradeRecord
from .schemas import CourseCreate, TaskCreate, CheckInCreate, GradeCreate

app = FastAPI(title="LIFEOS API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    create_db_and_tables()

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "LIFEOS"}

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
    today = date.today()
    while today.isoformat() in checkin_days:
        streak += 1
        from datetime import timedelta
        today -= timedelta(days=1)
    weighted = sum(g.gpa * g.credits for g in grades)
    credits = sum(g.credits for g in grades)
    return {
        "xp": xp, "level": xp // 500 + 1, "completed_tasks": completed,
        "total_tasks": len(tasks), "course_count": len(courses),
        "streak": streak, "cumulative_gpa": round(weighted / credits, 3) if credits else None,
        "earned_credits": credits
    }

@app.get("/api/courses")
def list_courses(session: Session = Depends(get_session)):
    return session.exec(select(Course).order_by(Course.id.desc())).all()

@app.post("/api/courses")
def add_course(data: CourseCreate, session: Session = Depends(get_session)):
    item = Course(**data.model_dump())
    session.add(item); session.commit(); session.refresh(item)
    return item

@app.delete("/api/courses/{course_id}")
def delete_course(course_id: int, session: Session = Depends(get_session)):
    item = session.get(Course, course_id)
    if not item: raise HTTPException(404, "Course not found")
    session.delete(item); session.commit()
    return {"ok": True}

@app.get("/api/tasks")
def list_tasks(session: Session = Depends(get_session)):
    return session.exec(select(Task).order_by(Task.completed, Task.id.desc())).all()

@app.post("/api/tasks")
def add_task(data: TaskCreate, session: Session = Depends(get_session)):
    item = Task(**data.model_dump())
    session.add(item); session.commit(); session.refresh(item)
    return item

@app.patch("/api/tasks/{task_id}/complete")
def complete_task(task_id: int, session: Session = Depends(get_session)):
    item = session.get(Task, task_id)
    if not item: raise HTTPException(404, "Task not found")
    item.completed = not item.completed
    session.add(item); session.commit(); session.refresh(item)
    return item

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, session: Session = Depends(get_session)):
    item = session.get(Task, task_id)
    if not item: raise HTTPException(404, "Task not found")
    session.delete(item); session.commit()
    return {"ok": True}

@app.get("/api/checkins")
def list_checkins(session: Session = Depends(get_session)):
    return session.exec(select(CheckIn).order_by(CheckIn.id.desc())).all()

@app.post("/api/checkins")
def add_checkin(data: CheckInCreate, session: Session = Depends(get_session)):
    today = date.today().isoformat()
    existing = session.exec(select(CheckIn).where(CheckIn.day == today)).first()
    if existing:
        existing.mood = data.mood
        existing.sleep_hours = data.sleep_hours
        existing.wins = data.wins
        existing.blockers = data.blockers
        existing.tomorrow_focus = data.tomorrow_focus
        existing.xp_earned = 10
        item = existing
    else:
        item = CheckIn(day=today, **data.model_dump(), xp_earned=10)
    session.add(item); session.commit(); session.refresh(item)
    return item

@app.post("/api/grades")
def add_grade(data: GradeCreate, session: Session = Depends(get_session)):
    item = GradeRecord(**data.model_dump())
    session.add(item); session.commit(); session.refresh(item)
    return item

@app.get("/api/grades")
def list_grades(session: Session = Depends(get_session)):
    return session.exec(select(GradeRecord).order_by(GradeRecord.id)).all()
