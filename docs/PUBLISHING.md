# Publishing Councilwise on GitHub — step by step (Windows)

This guide takes you from the project folder on your PC to a public GitHub repository with a downloadable Windows installer. It takes about 30 minutes the first time. Copy the commands exactly; replace anything in `<angle brackets>`.

---

## Part 1 · One-time setup

### 1. Create a GitHub account
1. Go to https://github.com/signup and create an account. Your **username** becomes part of the project address, e.g. `github.com/<username>/councilwise`. Pick something professional.
2. Turn on two-factor authentication: profile picture → **Settings → Password and authentication → Enable two-factor authentication**.
3. Optional but recommended: **Settings → Emails →** tick **Keep my email addresses private**. Note the address shown, like `12345678+<username>@users.noreply.github.com`. You will use it in step 3 so your personal email is not published in the project history.

### 2. Install Git
1. Download **Git for Windows** from https://git-scm.com/download/win and run the installer.
2. Keep the default options. When asked about the default branch name, choose **Override… → `main`**.
3. Git Credential Manager is included; it will open a browser window to sign you in to GitHub the first time you push.

### 3. Tell Git who you are
Open **PowerShell** (Start → type *PowerShell*) and run:

```powershell
git config --global user.name "Suman Mondal"
git config --global user.email "<your GitHub no-reply email from step 1>"
git --version
```

### 4. (Optional) Install Node.js
Only needed if you want to run or build the app from source on your PC. Download the **LTS** version from https://nodejs.org and install it with the defaults. GitHub builds the installer for you either way (Part 4).

---

## Part 2 · Prepare the project folder

1. Unzip `councilwise-1.0.0-source.zip` to a simple path, for example `C:\Projects\councilwise`.
2. Open PowerShell **in that folder**:

```powershell
cd C:\Projects\councilwise
dir
```

You should see `README.md`, `package.json`, `src`, `docs` and so on.

3. Put your GitHub username into the links (README, package.json, docs). Replace `<username>` below:

```powershell
$u = "<username>"
Get-ChildItem -Recurse -File -Include *.md,package.json -Exclude node_modules |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
  ForEach-Object { $t = Get-Content $_.FullName -Raw; if ($t -match 'Chalkduggo') { Set-Content $_.FullName ($t -replace 'Chalkduggo', $u) -NoNewline; "updated $($_.Name)" } }
```

(If you installed Node.js, `npm run set-repo -- <username>` does the same.)

---

## Part 3 · Create the repository and upload

### 5. Create an empty repository on GitHub
1. Go to https://github.com/new
2. **Repository name:** `councilwise`
3. **Description:** `Eight models. One verdict. An open-source LLM council for your documents — sign in to your own AI accounts, no API keys. Windows app.`
4. Choose **Public**.
5. **Do not** tick "Add a README", ".gitignore" or "license" — the project already has them.
6. Click **Create repository**. Keep the page open.

### 6. Upload with Git
Back in PowerShell, in the project folder:

```powershell
git init -b main
git add .
git commit -m "Councilwise 1.0.0 — first public release"
git remote add origin https://github.com/<username>/councilwise.git
git push -u origin main
```

The first `git push` opens a browser window: sign in to GitHub and click **Authorize**. When it finishes, refresh the GitHub page — your README, screenshots and demo animation appear.

> If you see `error: failed to push some refs`, the GitHub repository was not empty. Delete it, recreate it without a README (step 5), and push again.

### 7. Check the automatic tests
Open the **Actions** tab of your repository. A workflow called **CI** runs the unit tests and a full end-to-end council in a virtual machine. After a few minutes it should show a green tick. (If Actions asks you to enable workflows, click **I understand… enable them**.)

---

## Part 4 · Publish the Windows download (a Release)

### 8. Tag the version — GitHub builds the installer for you
In PowerShell:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

This starts the **Release** workflow (Actions tab). In about 10 minutes it:
- runs the tests on Windows,
- builds `Councilwise-Setup-1.0.0.exe` (installer) and `Councilwise-Portable-1.0.0.exe`,
- creates a checksum file,
- publishes a **Release** page with all three files and the release notes.

Open **Releases** (right-hand side of the repository page) to see it. That page is the link you share: `https://github.com/<username>/councilwise/releases/latest`

**Alternative (no Actions):** Releases → **Draft a new release** → *Choose a tag* → type `v1.0.0` → **Create new tag** → title `Councilwise 1.0.0` → paste the text from `docs/RELEASE_NOTES.md` → drag in the two `.exe` files → **Publish release**.

### 9. Test the download yourself
Download the installer from the Release page on your PC and install it. Windows SmartScreen will say *Windows protected your PC* because the app is not code-signed: click **More info → Run anyway**. Then:
1. Click **Try the demo** — a full council should run in about a minute.
2. Members & logins → sign in to two or three real models → **Check sign-in & plan**.
3. Run a small real council on a short document.

Please do step 3 before you announce the project: website sign-in pages and layouts change often, and it is better that you find a broken connector than your first visitor.

---

## Part 5 · Make the repository page look professional

### 10. About box
On the repository home page, click the ⚙️ next to **About**:
- **Description:** (same as step 5)
- **Website:** your Release link
- **Topics:** `llm` `llm-council` `ai` `multi-agent` `electron` `windows` `desktop-app` `document-review` `chatgpt` `claude` `gemini` `perplexity` `open-source`
- Tick **Releases**; untick **Packages** and **Deployments**.

### 11. Social preview (the image shown when the link is shared)
**Settings → General → Social preview → Edit → Upload an image** → choose `docs/social-preview.png`.

### 12. Turn on the community features
- **Settings → General → Features:** tick **Issues** and **Discussions**.
- **Settings → Code security → Private vulnerability reporting → Enable** (used by SECURITY.md).
- **Settings → Branches → Add branch ruleset** for `main` → require a pull request before merging (optional, useful once others contribute).

### 13. Pin it on your profile
Go to your profile page → **Customize your pins** → tick `councilwise`.

---

## Part 6 · Updating the project later

```powershell
cd C:\Projects\councilwise
git pull                      # get any changes merged on GitHub
# ...edit files...
git add .
git commit -m "Describe what you changed"
git push
```

To ship a new version (for example 1.0.1):
1. Change `"version"` in `package.json` to `1.0.1`.
2. Add a section at the top of `CHANGELOG.md` and update `docs/RELEASE_NOTES.md`.
3. Commit and push, then:

```powershell
git tag v1.0.1
git push origin v1.0.1
```

GitHub builds and publishes the new installer automatically.

### Fixing a connector quickly
If a model's website changes and stops working, users can fix it without waiting for a release by dropping an updated JSON file into their connector folder. Put the fixed file in `src/main/adapters/sites/` too, bump its `version`, and release a patch version. See [CONNECTORS.md](CONNECTORS.md).

---

## Prefer clicking to typing? GitHub Desktop

1. Install https://desktop.github.com and sign in.
2. **File → Add local repository →** choose `C:\Projects\councilwise` → it offers to **create a repository** here → **Create**.
3. Write the summary `Councilwise 1.0.0 — first public release` → **Commit to main**.
4. **Publish repository** → untick *Keep this code private* → **Publish**.
5. For the Release, use the *Alternative (no Actions)* steps in Part 4, or **Repository → Open in Command Prompt** and run the two `git tag` commands.

---

## Checklist before you announce

- [ ] README shows your username in every link (no `Chalkduggo` left)
- [ ] CI is green on the Actions tab
- [ ] Release `v1.0.0` exists with the installer, portable app and checksums
- [ ] You installed it from the Release and ran the demo and one real council
- [ ] Topics, website and social preview are set
- [ ] Issues, Discussions and private vulnerability reporting are on
- [ ] The repo is pinned on your profile
