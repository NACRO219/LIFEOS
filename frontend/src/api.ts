const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
export const api = {
  dashboard: () => request("/api/dashboard"),
  tasks: () => request("/api/tasks"),
  addTask: (body: unknown) => request("/api/tasks", {method:"POST", body:JSON.stringify(body)}),
  toggleTask: (id:number) => request(`/api/tasks/${id}/complete`, {method:"PATCH"}),
  deleteTask: (id:number) => request(`/api/tasks/${id}`, {method:"DELETE"}),
  courses: () => request("/api/courses"),
  addCourse: (body:unknown) => request("/api/courses", {method:"POST", body:JSON.stringify(body)}),
  deleteCourse: (id:number) => request(`/api/courses/${id}`, {method:"DELETE"}),
  checkin: (body:unknown) => request("/api/checkins", {method:"POST", body:JSON.stringify(body)}),
  grades: () => request("/api/grades"),
  addGrade: (body:unknown) => request("/api/grades", {method:"POST", body:JSON.stringify(body)})
};
