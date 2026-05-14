# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server with HMR
npm run build        # tsc -b (type-check) then vite build → dist/
npm run preview      # serve the production build
npm run test         # Vitest in watch mode
npx vitest run       # Vitest single run (CI-style)
npx vitest run src/test/Button.test.tsx   # run one test file
npm run lint         # ESLint over all .ts/.tsx
npm run format       # Prettier write over the repo
```

## Environment requirement

Node **20.19+ / 22.12+** is mandatory (`.nvmrc` pins 22.12.0; `engines` enforces it). On older Node the Vite 8 build silently skips a native `rolldown` binding and Vitest fails to start its worker — both are environment failures, not code bugs. If `npm install` was ever run on Node < 20.19, regenerate the lockfile: `rm -rf node_modules package-lock.json && npm install`.

## Architecture

A React 19 + Vite 8 + Tailwind v4 TypeScript boilerplate. Notable wiring:

- **Tailwind v4 has no config file.** It is enabled purely via the `@tailwindcss/vite` plugin in `vite.config.ts` and `@import 'tailwindcss'` in `src/index.css`. There is no `tailwind.config.js` or PostCSS setup — customization goes in `index.css` via `@theme`.
- **Vitest config lives inside `vite.config.ts`** (not a separate file), under the `test` key: `jsdom` environment, `globals: true`, and `src/test/setup.ts` for `@testing-library/jest-dom` matchers. The `/// <reference types="vitest/config" />` at the top of that file is what types the `test` key.
- **Routing**: `src/main.tsx` wraps the app in `<BrowserRouter>`; `src/App.tsx` owns the layout (nav header) and the `<Routes>` table. Pages live in `src/pages/`, one component per route.
- **TypeScript** uses project references — `tsconfig.json` references `tsconfig.app.json` (app code, includes `src`) and `tsconfig.node.json` (Vite config). Test-related global types (`vitest/globals`, `@testing-library/jest-dom`) are declared in `tsconfig.app.json`'s `types` array.
- **ESLint** is flat-config (`eslint.config.js`); `eslint-config-prettier` is last in the extends chain so formatting is owned entirely by Prettier.

## Conventions

- Prettier: no semicolons, single quotes, trailing commas, 80-col (`.prettierrc`).
- No path aliases configured — use relative imports.
- Design specs are kept in `docs/superpowers/specs/`.
