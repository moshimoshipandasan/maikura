# Repository Guidelines

## Project Structure & Module Organization
- Entry points: `index.tsx` (runtime), `index.html` (markup), `index.css` (styles).
- Source lives in `src/` (game logic under `src/world/`).
- Tests are colocated as `*.test.ts` beside code (e.g., `src/world/renderer.test.ts`).
- Static assets are served from `public/` (path `/`).

## Build, Test, and Development Commands
- `npm install` — install/refresh dependencies.
- `npm run dev` — start Vite dev server with HMR at `http://localhost:3000`.
- `npm run build` — output optimized bundle to `dist/`.
- `npm run preview` — serve `dist/` locally to mimic production hosting.
- `npx tsc --noEmit` — type-check only.
- `npm run test` / `npm run test:watch` — run Vitest once / in watch mode.

## Coding Style & Naming Conventions
- Language: TypeScript; indentation: four spaces.
- Naming: `camelCase` for vars/functions, `PascalCase` for exported classes.
- Structure gameplay as pure functions or small classes; keep `index.tsx` focused on bootstrapping.
- Comments should be brief and explain intent behind math/physics.

## Testing Guidelines
- Framework: Vitest. Keep tests fast and deterministic.
- Naming: `*.test.ts` next to implementation.
- Manual smoke for 3D: run `npm run dev`, acquire Pointer Lock, verify WASD/ジャンプ、設置/破壊、HUD（FPS/座標）とリサイズが例外なく動作。

## Commit & Pull Request Guidelines
- Conventional Commits (`feat:`, `fix:`, `chore:`). One logical change per commit.
- PRs must include: short summary, validation steps (commands, browsers), and screenshots/video for UI changes. Link issues/TODOs.

## Security & Configuration Tips
- Three.js is CDN-loaded and version‑pinned (currently `0.128.0`). Upgrade deliberately.
- Pointer Lock needs a secure context; verify via `npm run preview` before deploying.
- Secrets are NOT committed. Use `import.meta.env` (e.g., set `GEMINI_API_KEY`; mapped via `vite.config.ts` to `process.env.*`).
- Vite dev server: `host 0.0.0.0`, `port 3000`; alias `@` → project root.

## Agent-Specific Instructions
- Internal reasoning in English; external comms (commits/PRs/reviews) in Japanese for the team.
