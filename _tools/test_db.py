import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.local_api.database import init_db, query_all

init_db()

users = query_all("SELECT id, username, level, xp, streak_days FROM users")
print(f"Users: {len(users)}")
for u in users:
    print(f"  [{u['id']}] {u['username']:12s} Lv.{u['level']} XP={u['xp']} streak={u['streak_days']}d")

courses = query_all("SELECT id, title, language, difficulty FROM courses ORDER BY sort_order")
print(f"\nCourses: {len(courses)}")
for c in courses:
    print(f"  [{c['id']}] {c['title']:28s} {c['language']:5s} {c['difficulty']}")

lessons = query_all("SELECT id, course_id, title, external_site FROM lessons ORDER BY course_id, order_num")
print(f"\nLessons: {len(lessons)}")
sites = {}
for l in lessons:
    s = l["external_site"] or "self"
    sites[s] = sites.get(s, 0) + 1
print("  External references:")
for s, c in sorted(sites.items(), key=lambda x: -x[1]):
    print(f"    {s}: {c} chapters")

ex = query_all("SELECT id, title, difficulty, language FROM exercises")
print(f"\nExercises: {len(ex)}")
for e in ex:
    print(f"  [{e['id']}] {e['title']:20s} {e['difficulty']:5s} {e['language']}")

tasks = query_all("SELECT id, user_id, title, completed FROM study_tasks")
print(f"\nTasks: {len(tasks)}")

acts = query_all("SELECT id, user_id, type, description FROM activities")
print(f"Activities: {len(acts)}")
