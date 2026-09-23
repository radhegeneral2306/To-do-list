# Company Task List

Task assignment and tracking app for all branches: **Raipur, Durg, Jagdalpur, Rajim, Kurud, Hardware**.

- **React** app, hosted free on **GitHub Pages**
- **Google Sheet** is the database, with **Google Apps Script** as the backend API
- Works on mobile and desktop

## Roles

| Role | Sees | Can do |
|---|---|---|
| **Admin** | All branches | Everything: assign tasks, manage users & branches |
| **Partner** | All branches | Same as Admin |
| **Branch Manager** | Own branch | Assign / edit / delete tasks in own branch |
| **Employee** | Own tasks only | Update status (Pending → In Progress → Done) and remarks |

All of these rules are checked on the server (`backend/Code.gs`), not just hidden in the UI.

## Screens
- **Branch Dashboard**: branch tabs, per-employee counts (Pending / In Progress / Overdue / Done); click an employee to see their tasks
- **Assign Task**: branch → person → task, priority, due date
- **My Tasks**: your own tasks, with filters and search
- **Users**: add users, change role/branch, disable, reset password, add branches
- **Account**: change your password

## Going live
1. Set up the Google Sheet backend: Steps 1–4 of [`backend/README.md`](backend/README.md).
2. GitHub repo **Settings → Pages → Source: GitHub Actions**.
3. Add the repo variable `VITE_API_URL` (Step 5 of the backend guide).
4. Merge to `main`. The workflow builds and publishes to `https://<username>.github.io/To-do-list/`.
   Did you add the variable after merging? Then use **Actions → Deploy to GitHub Pages → Run workflow**.

Without `VITE_API_URL` the app runs in **demo mode**. It uses the same backend code, but the data
is saved only in that browser. Demo logins use password `demo123` (e.g. `partner`, `raipur.manager`, `raipur.staff1`);
the admin is `admin` / `admin123`.

## Develop locally
```bash
npm install
npm run dev      # http://localhost:5173/To-do-list/  (demo mode)
npm test         # runs backend/Code.gs against a fake sheet and checks permissions
npm run build
```
To use your real sheet locally, copy `.env.example` to `.env.local` and fill in `VITE_API_URL`.

## Limits of Google Sheet as a database
- Each action takes about **1–3 seconds** (Apps Script is slow to start).
- No live updates. Pages refresh every 60 seconds, or use **↻ Refresh**.
- Comfortable up to about **100 users and a few thousand tasks**. Beyond that, move to a real database (e.g. Supabase).
- Apps Script free quota: about 20,000 requests/day, which is plenty for this size.
