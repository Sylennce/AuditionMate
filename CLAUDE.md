# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build       # Production build → dist/
npm run lint        # Type-check only (tsc --noEmit), no separate test suite
npm run dev         # Dev server via tsx server.ts (Express + Vite middleware on :3000)
npm run preview     # Serve the dist/ folder
```

Always run `npm run build` before committing to catch type errors. There are no automated tests.

## Workflow

After every completed task: `git add`, `git commit`, and `git push` to `main` without asking. The owner is the only user while the app is being built.

## Architecture

This is a **PWA installed to the user's phone home screen**. The production artifact is the `dist/` folder built by Vite — `server.ts` / SQLite are vestiges of an earlier server-side design and are **not used by the deployed app**. All data lives in the browser via IndexedDB.

### Data flow

```
src/api.ts  (IndexedDB layer)
    ↕
src/App.tsx  (all views + state — single large file)
    ↕
src/types.ts  (Scene, Line interfaces)
```

`src/api.ts` stores audio as raw `Blob` objects in IndexedDB and returns `Line` objects with `audioPath` set to a fresh `URL.createObjectURL()` on every `getLines()` call. These blob URLs are the live audio sources used during rehearsal — they are not persisted URLs.

### View state machine

`App.tsx` owns a single `view` state string that switches between five full-screen views:

- `HOME` → scene list
- `SCENE_DETAIL` → line list for a scene
- `RECORD` → record a single line (mic + Web Speech API transcription)
- `REHEARSE` → rehearsal mode (reader audio playback + cue-word speech detection)
- `SELF_TAPE` → same as REHEARSE but also records video via MediaRecorder

All views are co-located in `App.tsx`. Shared UI pieces (`TeleprompterText`, `RehearsalSettingsModal`) are also in `App.tsx`. Smaller reusable modals live in `src/components/`.

### Rehearsal / cue detection logic

Both `RehearseView` and `SelfTapeView` share the same pattern:

1. **READER lines**: play the stored blob audio via `<audio ref>`. iOS requires audio to be unlocked by playing a silent buffer on the initial user tap (`unlockAudio()`) before the 3-second countdown, otherwise autoplay is blocked.
2. **MYSELF lines**: start `webkitSpeechRecognition` / `SpeechRecognition`. When the actor's cue word (last word of their line) appears in the last 6 words of the transcript, advance automatically. A manual skip button (ChevronRight) is always visible as fallback.
3. Recognition is set to `continuous = true` and auto-restarts on `onend` with a 200ms delay (shorter causes `InvalidStateError` on iOS Safari).

### Settings persistence

Three teleprompter settings are stored in `localStorage` under `auditionMate.*` keys:
- `rehearseFontPx` (18–44)
- `scrollSpeed` (10–120 px/s)
- `scrollDelaySec` (0–10)

### PWA / deployment

`vite-plugin-pwa` generates `dist/sw.js` with Workbox. The service worker uses network-first for `/api/` and `/uploads/`, cache-first for static assets. `public/manifest.webmanifest` is the source of truth for the installed app name/icons. After `npm run build`, push to GitHub — the live URL serves the `dist/` output.
