# Repository Guidelines

## Project Structure & Module Organization
- Runtime entry point: `index.tsx`; markup and styles live in `index.html` and `index.css`.
- Gameplay logic is in `src/`, with world systems under `src/world/`. Use `@/` when importing from the project root (e.g., `import { Chunk } from '@/world/chunk'`).
- Tests sit next to their subjects as `*.test.ts` files. Static assets are served from `public/` and resolve at `/`.

## Build, Test, and Development Commands
- `npm install` — refresh dependencies before attempting builds.
- `npm run dev` — launch the Vite dev server at `http://localhost:3000` with HMR; ideal for manual smoke tests.
- `npm run build` — produce the production bundle in `dist/`.
- `npm run preview` — serve `dist/` locally to validate deployment behavior.
- `npx tsc --noEmit` — perform a type-only check without generating output.
- `npm run test` / `npm run test:watch` — execute Vitest once or in watch mode for rapid iterations.

## Coding Style & Naming Conventions
- Language is TypeScript with four-space indentation; prefer pure functions or small classes for gameplay logic.
- Use `camelCase` for variables/functions and `PascalCase` for exported classes/components.
- Keep `index.tsx` limited to bootstrapping and wiring; push mechanics into `src/world/`.
- No enforced formatter; favor tight diffs and consistent style. Let `tsc` enforce type safety.

## Testing Guidelines
- Framework: Vitest. Co-locate tests beside implementation (`renderer.test.ts` next to `renderer.ts`).
- Target deterministic, fast specs; stub external state as needed.
- Run `npm run test` in CI scenarios, and `npm run test:watch` while developing.
- Manual 3D verification: `npm run dev`, grab pointer lock, confirm WASD movement, jump/place/break, HUD metrics, and responsive resizing behave without glitches.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `chore:`). Keep each commit focused on one logical change.
- Pull requests should summarize intent, list validation steps (commands/browsers), and include screenshots or video for UI tweaks.
- Link related issues or TODOs, and explain any follow-up work so reviewers know what remains.

## Security & Configuration Tips
- Three.js is CDN-loaded and pinned to `0.128.0`; upgrade intentionally and test pointer-lock flows.
- Pointer Lock requires HTTPS or `npm run preview`; verify interactions before shipping.
- Never commit secrets. Use `import.meta.env.*` and map through `vite.config.ts` to `process.env`.

## Agent-Specific Instructions
- Keep reasoning and experimentation in English, but present commits, PRs, reviews, and explanations in Japanese.
- Do not revert existing uncommitted changes unless explicitly instructed.
- Coordinate with the team by keeping branches short-lived and diffs review-friendly.
