# Repository Guidelines

## Project Structure & Module Organization
- Runtime entry: `index.tsx`; markup: `index.html`; styles: `index.css`.
- Root config: `vite.config.ts`, `tsconfig.json`, `metadata.json`, `package.json`.
- Add features in `src/<feature>/` and import from `index.tsx` to keep bootstrapping lean.
- Assets (textures/audio/UI) live in `public/` (served at `/`).
- When tests are added, colocate them as `*.test.ts` beside code (e.g., `src/world/terrain.test.ts`).

## Build, Test, and Development Commands
- `npm install` — install/refresh dependencies.
- `npm run dev` — start Vite with HMR at `http://localhost:3000`.
- `npm run build` — produce optimized bundle in `dist/`.
- `npm run preview` — serve `dist/` locally to mimic production hosting.
- Type-check (optional until scripted): `npx tsc --noEmit`.
- Tests (when adopted): `npm run test` via Vitest.

## Coding Style & Naming Conventions
- TypeScript with four-space indentation.
- camelCase for variables (e.g., `playerVelocity`), PascalCase for exported classes.
- Organize gameplay into pure functions or small classes to separate physics, input, and rendering.
- Keep comments brief, focusing on intent behind math-heavy code.
- Run `npm run build` before committing to surface bundling/type regressions.

## Testing Guidelines
- Automated coverage not yet configured. In PRs, document manual validation: run `npm run dev`, acquire Pointer Lock, sprint across terrain, and record issues/FPS.
- When Vitest is adopted, place smoke tests next to code and ensure scene boot and controls do not throw. Name files `*.test.ts` and keep them fast.

## Commit & Pull Request Guidelines
- Conventional Commits (`feat:`, `fix:`, `chore:`). Scope commits to a single gameplay/tooling change; update docs/config in the same diff as needed.
- PRs include: short summary, validation steps (commands run, browsers checked), and screenshots/video when UI changes. Link issues/TODOs for traceability.

## Security & Configuration Tips
- Three.js is loaded from a CDN; pin versions (currently `0.128.0`) and upgrade deliberately.
- Pointer Lock requires secure contexts; verify with `npm run preview` over HTTPS before deploying.
- Store secrets outside `metadata.json`; expose via `import.meta.env`.

## Agent-Specific Instructions
- Keep internal reasoning in English. Provide outward explanations—commit messages, PR descriptions, review feedback—in Japanese for the team.
