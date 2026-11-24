# Vizzy Studio (macOS, Intel)

Music visualizer + lyric video maker, as a native Mac app.
Load a song, build your visuals with layers, export an MP4 (up to 4K / 60 fps).

## Build the DMG on GitHub (no Terminal needed)

1. Create a new repository on github.com (private is fine).
2. Upload **everything in this folder** to the repository root
   (`package.json`, `src/`, `build/`, `.github/`, ...).
   - The folder `.github` is hidden in Finder. Press **Cmd + Shift + .** to show hidden files,
     then drag everything into GitHub's "Upload files" page.
   - If `.github/workflows/build-dmg.yml` did not upload: on GitHub click
     **Add file → Create new file**, type `.github/workflows/build-dmg.yml` as the name,
     and paste the content of `WORKFLOW_build-dmg.yml`.
3. Open the **Actions** tab → **Build Vizzy Studio DMG (Intel)** → **Run workflow**.
4. Wait about 3–6 minutes. Open the finished run → **Artifacts** → download **Vizzy-Studio-DMG**.
5. Unzip, open the `.dmg`, drag **Vizzy Studio** to Applications.

## First launch on macOS 11 (the app is not signed)

Right-click the app → **Open** → **Open**.
If macOS says it is damaged, run once in Terminal:

    xattr -cr "/Applications/Vizzy Studio.app"

## How to use

1. **Load audio** (button top right, or drag an mp3/wav/m4a into the window).
2. Pick a **Template**, or add layers on the left: Visualizer, Text, Lyrics, Image/Logo, Shape, Particles, Effect, Background.
3. Click a layer to edit it on the right. Drag on the preview to move it.
   Every layer can **react to bass / mids / highs / beat**.
4. **Lyrics**: add a Lyrics layer → *Paste text* → *Tap to sync* (press Space when each line starts),
   or import an `.lrc` / `.srt` file.
5. Timeline at the bottom: drag clips to move them, drag the edges to trim.
6. **Export MP4** (Cmd+E). Choose 1080p / 4K, fps and quality.

Shortcuts: Space play/pause · Cmd+Z / Shift+Cmd+Z undo/redo · Cmd+S save · Cmd+O open ·
Cmd+E export · Delete removes the selected layer · ← → seek.

## If export says FFmpeg cannot start

The app ships its own FFmpeg. If your macOS 11 refuses to run it, install one with
Homebrew (`brew install ffmpeg`) and restart the app — it finds `/usr/local/bin/ffmpeg` automatically.
