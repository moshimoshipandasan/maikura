# Repository Guidelines

This guide sets shared, minimal expectations for contributors to this game project. Read once before opening a PR.

## Project Structure & Module Organization

- Entry points: `index.tsx` (runtime), `index.html` (markup), `index.css` (styles).
- Source lives in `src/` (game logic under `src/world/`).
- Tests are colocated as `*.test.ts` next to code (e.g., `src/world/renderer.test.ts`).
- Static assets are served from `public/` (path `/`).
- Vite alias: `@` → project root.

## Build, Test, and Development Commands

- `npm install` — install/refresh dependencies.
- `npm run dev` — start Vite dev server with HMR at `http://localhost:3000` (`host 0.0.0.0`).
- `npm run build` — build optimized bundle to `dist/`.
- `npm run preview` — serve `dist/` locally to mimic production hosting.
- `npx tsc --noEmit` — type‑check only.
- `npm run test` / `npm run test:watch` — run Vitest once / watch mode.

## Coding Style & Naming Conventions

- Language: TypeScript; indentation: four spaces.
- Naming: `camelCase` for vars/functions; `PascalCase` for exported classes.
- Structure gameplay as pure functions or small classes; keep `index.tsx` for bootstrapping only.
- Comments: keep brief; explain math/physics intent.
- Formatting/linting: no enforced formatter here; keep diffs small and consistent; rely on `tsc` for type safety.

## Testing Guidelines

- Framework: Vitest. Keep tests fast, deterministic, and colocated as `*.test.ts`.
- Run: `npm run test` (CI) or `npm run test:watch` (local).
- Manual 3D smoke: `npm run dev`, acquire Pointer Lock, verify WASD/ジャンプ、設置/破壊、HUD（FPS/座標）とリサイズが例外なく動作。

## Commit & Pull Request Guidelines

- Conventional Commits (`feat:`, `fix:`, `chore:`). One logical change per commit.
- PRs must include: short summary, validation steps (commands, browsers), and screenshots/video for UI changes. Link issues/TODOs.
- Keep branches focused; prefer small, reviewable diffs.

## Security & Configuration Tips

- Three.js is CDN‑loaded and version‑pinned (currently `0.128.0`). Upgrade deliberately.
- Pointer Lock requires a secure context; verify via `npm run preview` before deploying.
- Do not commit secrets. Use `import.meta.env` (e.g., `GEMINI_API_KEY`), mapped to `process.env.*` via `vite.config.ts`.
- Vite dev server defaults: `host 0.0.0.0`, `port 3000`.

## Agent‑Specific Instructions

- Internal reasoning in English; external comms (commits/PRs/reviews) in Japanese for the team.

