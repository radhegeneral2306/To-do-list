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
1. At the top, pick the function **`setup`** in the dropdown and click **▶ Run**.
2. Google will ask for permission → **Review permissions** → pick your account →
   "Google hasn't verified this app" → **Advanced** → **Go to … (unsafe)** → **Allow**.
   (This is normal. It is your own script asking to edit your own sheet.)
3. Go back to the sheet. You should now see 4 tabs: `Users`, `Tasks`, `Sessions`, `Branches`.

First login: **username `admin`, password `admin123`**. Change it right away in the app (Account tab).

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
