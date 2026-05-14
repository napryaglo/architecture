# React + Vite + Tailwind + TypeScript Boilerplate — Design

**Date:** 2026-05-14
**Status:** Approved

## Goal

Produce a clean, modern TypeScript boilerplate in the existing `mural` repository
using React, Vite, and Tailwind CSS, with routing, testing, and linting wired up
and a minimal demo page proving everything works.

## Scaffolding Approach

Start from the official Vite template:

```
npm create vite@latest . -- --template react-ts
```

Then layer on Tailwind v4 and the selected extras. Scaffold into the **current
directory** (the repo already has git history) rather than a subfolder.

## Final Structure

```
mural/
├── src/
│   ├── main.tsx            # entry; wraps App in BrowserRouter
│   ├── App.tsx             # route definitions
│   ├── index.css           # @import "tailwindcss"
│   ├── pages/
│   │   ├── Home.tsx        # minimal styled demo page
│   │   └── About.tsx       # second page proving routing works
│   ├── components/
│   │   └── Button.tsx      # reusable Tailwind-styled component example
│   └── test/
│       └── Button.test.tsx # sample Vitest + Testing Library test
├── vite.config.ts          # react + tailwind + vitest config
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── eslint.config.js        # flat config, TS + React rules
├── .prettierrc
├── package.json
└── README.md               # how to run dev/build/test/lint
```

## Key Decisions

### Tailwind CSS v4
Use Tailwind v4 with the `@tailwindcss/vite` plugin. This is the current
recommended setup — no `tailwind.config.js` or PostCSS config required. Styles
are pulled in via `@import "tailwindcss";` in `src/index.css`.

### React Router v7
Use React Router v7 in `BrowserRouter` mode. `main.tsx` wraps `<App />` in
`<BrowserRouter>`; `App.tsx` holds `<Routes>` with two routes:
- `/` → `Home` page
- `/about` → `About` page

Both pages share a small nav with links to demonstrate client-side navigation.

### Vitest
Configure Vitest inside `vite.config.ts` (shared config with Vite). Use:
- `jsdom` environment
- `@testing-library/react` + `@testing-library/jest-dom`
- A `src/test/setup.ts` for jest-dom matchers

Ship one passing sample test for the `Button` component.

### ESLint + Prettier
- ESLint flat config (`eslint.config.js`) with TypeScript and React rules
  (from the Vite template baseline, extended as needed).
- Prettier with a `.prettierrc`.
- `eslint-config-prettier` to disable formatting rules that conflict with
  Prettier.

### Path Aliases
Not included (not selected). Use plain relative imports.

### npm Scripts
```
dev      → vite
build    → tsc -b && vite build
preview  → vite preview
test     → vitest
lint     → eslint .
format   → prettier --write .
```

## Sample Content

A minimal demo page (`Home`) that:
- Renders a heading and short text styled with Tailwind utility classes.
- Uses the reusable `Button` component to prove component composition works.
- Links to the `About` page to prove routing works.

The `About` page is a small second page confirming navigation.

## Success Criteria

- `npm install` succeeds.
- `npm run dev` serves a styled page with working navigation.
- `npm run build` produces a production build with no type errors.
- `npm run test` runs and the sample test passes.
- `npm run lint` passes with no errors.
- `README.md` documents all scripts.
```