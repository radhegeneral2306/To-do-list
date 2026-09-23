# Google Sheet backend — setup guide

This is a one-time setup, about 15 minutes. Do it from a computer (not a phone), logged in to the
Google account that should **own** the data (ideally a company Gmail, not a personal one).

## Step 1: Create the Google Sheet
1. Open https://sheets.google.com and create a **blank** spreadsheet.
2. Name it e.g. `Company Task List DB`.

## Step 2: Paste the backend code
1. In the sheet, click **Extensions → Apps Script**.
2. Delete everything in the `Code.gs` file there.
3. Open [`Code.gs`](./Code.gs) from this repo, copy **all** of it, and paste it in.
4. Click the 💾 **Save** icon.

## Step 3: Run setup (creates the tabs + first admin)
1. Go back to the **Google Sheet tab** in your browser and **reload the page** (F5).
2. Wait 5–10 seconds. A new menu **Task App** appears at the top, next to *Help*.
3. Click **Task App → Run setup**.
4. Google will ask for permission → **Continue** → pick your account →
   "Google hasn't verified this app" → **Advanced** → **Go to … (unsafe)** → **Allow**.
   (This is normal. It is your own script asking to edit your own sheet.)
5. If nothing happens after allowing, click **Task App → Run setup** once more.
6. A popup says **"Setup done ✅"**, and you see 4 new tabs at the bottom: `Users`, `Tasks`, `Sessions`, `Branches`.

First login: **username `admin`, password `admin123`**. Change it right away in the app (Account tab).

> **Other way (from the script editor):** in the dropdown next to ▶ Run, make sure it says **`setup`**
> (not `doGet` or `myFunction`), then click ▶ Run.

### Tabs didn't appear?
Open Apps Script → **Executions** (left sidebar, ☰ list icon) and look at the last run:
- **Function name is `doGet` / `myFunction`:** the wrong function ran. Use **Task App → Run setup**.
- **Error "not linked to a Google Sheet":** you made the script from script.google.com. Delete it, open
  **your Sheet → Extensions → Apps Script**, and paste the code there.
- **Error about authorization/permission:** run it again and finish the Allow steps in Step 3.
- **No "Task App" menu:** you pasted old code, or didn't save. Paste the latest `Code.gs`, click 💾, reload the Sheet.

## Step 4: Deploy as a Web App
1. In Apps Script, click **Deploy → New deployment**.
2. Click the ⚙️ next to "Select type" → **Web app**.
3. Set:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Click **Deploy** and copy the **Web app URL** (it ends with `/exec`).

"Anyone" here only means anyone can *reach* the URL. Without a valid login, the script refuses every request.

## Step 5: Connect the React app
In GitHub: repo **Settings → Secrets and variables → Actions → Variables tab → New repository variable**
- Name: `VITE_API_URL`
- Value: the `/exec` URL from Step 4

Then re-run the deploy (Actions tab → "Deploy to GitHub Pages" → Run workflow).

## When you change Code.gs later
Paste the new code, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
The URL stays the same. If you skip this, the old code keeps running.

## Rules to follow
- **Do not edit the `Users` or `Sessions` tabs by hand.** Passwords are stored as hashes; editing breaks logins.
- You *can* read the `Tasks` tab freely, filter it, or make reports from it in another sheet.
- Don't rename tabs or columns.
- Don't share the sheet with employees. They use the app; only the owner/admin needs the sheet.
