# Orbis Browser

An open-source desktop browser built on **Electron (Chromium)**, **React**, **TypeScript** and **Vite**.
Tabs are real Chromium pages hosted in Electron `WebContentsView`s, so modern sites (YouTube, ChatGPT, Google, GitHub, Discord, …) work as in Chrome.

## Run

```bash
npm install
npm run dev     # Vite + Electron with hot reload
npm start       # production build, then launch
npm run dist    # installers via electron-builder (output in ./release)
```

## Features

- Multiple tabs (drag to reorder, pin, mute, duplicate, reopen closed tab), popups and OAuth windows
- Address bar with URL / search detection, suggestions from bookmarks and history
- Back, forward, reload, stop, home; error page with retry
- Bookmarks, history (searchable, grouped by day), downloads (pause / resume / cancel / open)
- Incognito windows: isolated in-memory session, no history, wiped on close
- Zoom, find in page, context menus (page, link, image, text, tab), view source, DevTools, print
- Site permissions (camera, mic, location, notifications, …) with per-site memory and a settings manager
- Custom title bar with working minimize / maximize / close
- Customisation, saved and applied instantly: theme (light / dark / system), accent colour,
  background (Aurora, Dusk, Mist, solid colour or your own image), tab style, sidebar, animations,
  font size, interface density

## LTS — Link & Tab Shortcuts

Type `lts <command>` in the address bar and press Enter to open the site in a **new tab**.

| Command   | Opens                    |
|-----------|--------------------------|
| `lts ytb` | https://www.youtube.com  |
| `lts gpt` | https://chatgpt.com      |
| `lts gh`  | https://github.com       |
| `lts tw`  | https://www.twitch.tv    |
| `lts gg`  | https://www.google.com   |

Add, edit or delete commands in **Settings → LTS shortcuts**. Typing `lts` shows matching suggestions,
and shortcuts also appear on the new-tab page and in the sidebar.

## Keyboard shortcuts

`Ctrl` is `⌘` on macOS.

| Action | Keys |
|---|---|
| New tab / close / reopen | Ctrl+T / Ctrl+W / Ctrl+Shift+T |
| New window / incognito | Ctrl+N / Ctrl+Shift+N |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab |
| Tab 1–8 / last tab | Ctrl+1…8 / Ctrl+9 |
| Address bar | Ctrl+L (Alt+Enter opens in a new tab) |
| Back / forward | Alt+← / Alt+→ |
| Reload / hard reload | Ctrl+R / Ctrl+Shift+R |
| Find | Ctrl+F |
| Zoom in / out / reset | Ctrl+= / Ctrl+- / Ctrl+0 |
| Bookmark | Ctrl+D |
| History / downloads | Ctrl+H / Ctrl+J |
| Sidebar / settings | Ctrl+B / Ctrl+, |
| Source / DevTools | Ctrl+U / F12 |

## Architecture & security

```
electron/   main process: window + tab controller, IPC, storage, downloads, permissions
shared/     types shared by main, preload and UI
src/        React UI (title bar, tabs, toolbar, sidebar, settings)
```

- Web content runs with `contextIsolation`, `nodeIntegration: false`, `sandbox: true` and **no preload**; pages cannot reach any Orbis API.
- The UI window is the only window with a preload; IPC handlers reject any sender that is not an Orbis UI top-level frame, and validate every argument.
- Settings from the UI are sanitised in the main process (types, ranges, URLs).
- Tabs may only navigate to `http(s)`, `file`, `about` and `view-source`; `javascript:` and custom protocols are blocked. `<webview>` is disabled.
- The production UI ships with a strict Content-Security-Policy.
- The user agent has no `Electron/` token so sites serve their normal desktop experience.

Data (settings, bookmarks, history, permissions, downloads) is stored as JSON in the Electron user-data directory.

## Known limitations

- DRM-protected streaming (Widevine, e.g. Netflix) needs a Widevine-enabled Electron build.
- No extension support, sync, or tab restore across restarts yet.
- Discord, ChatGPT, YouTube and GitHub were not exercised against the live internet in the build sandbox (no outbound access); the navigation, user-agent and isolation behaviour they depend on was verified.
