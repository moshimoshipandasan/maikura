# Repository Guidelines

## Project Structure & Module Organization
This Vite project keeps runtime logic in `index.tsx`, markup in `index.html`, styles in `index.css`, and tooling config (`vite.config.ts`, `tsconfig.json`, `metadata.json`) at the root. Expand features by adding `src/<feature>/` modules imported from `index.tsx` to keep bootstrapping lean. Place textures, audio, or UI images under `public/`.

## Build, Test, and Development Commands
- `npm install` - install or refresh dependencies.
- `npm run dev` - start the hot reloading dev server on `http://localhost:5173`.
- `npm run build` - produce the optimized bundle in `dist/` and run the TypeScript checker.
- `npm run preview` - serve the built output locally to mimic production hosting.

## Coding Style & Naming Conventions
Use TypeScript with four space indentation, camelCase for variables such as `playerVelocity`, and PascalCase for exported classes. Organize gameplay systems into pure functions or small classes to separate physics, input, and rendering. Keep comments brief and focused on the intent behind math heavy blocks. Run `npm run build` before committing to surface type or bundling regressions.

## Testing Guidelines
Automated coverage is not yet configured, so document manual validation in every PR: run `npm run dev`, lock the pointer, and sprint across the terrain. When you add automated coverage, adopt Vitest with `*.test.ts` beside the code (for example, `src/world/terrain.test.ts`) and add smoke tests that confirm scene boot and controls do not throw.

## Commit & Pull Request Guidelines
Follow the existing Conventional Commits pattern (`feat:`, `fix:`, `chore:`). Keep commits scoped to a single gameplay or tooling change and update docs or config in the same diff when necessary. PR descriptions should include a short summary, validation steps (commands run, browsers checked), and visuals when the user interface changes. Link issues or TODOs so future contributors can trace decisions.

## Security & Configuration Tips
Three.js is loaded from a CDN in `index.html`, so upgrade versions deliberately and prefer pinned URLs. Pointer Lock APIs require secure contexts, so test with `npm run preview` behind HTTPS before deploying. Store any future secrets outside of `metadata.json` and expose them via Vite's `import.meta.env` to avoid accidental leakage.

## Agent Communication
Keep your internal reasoning in English to align with code comments and upstream docs, but deliver outward explanations, commit narratives, and review feedback in Japanese so the broader team can act quickly. 内部思考は英語で統一しつつ、コミットメッセージやPR説明などの対外的な説明は日本語でまとめてください。
