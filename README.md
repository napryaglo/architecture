# Mural

A TypeScript boilerplate built with **React 19**, **Vite**, and **Tailwind CSS v4**.

## Stack

- **React 19** + **TypeScript**
- **Vite** — dev server and build tooling
- **Tailwind CSS v4** — via the `@tailwindcss/vite` plugin (no config file or PostCSS setup)
- **React Router v7** — client-side routing
- **Vitest** + **Testing Library** — unit testing in a `jsdom` environment
- **ESLint** (flat config) + **Prettier** — linting and formatting

## Requirements

**Node.js 20.19+ or 22.12+** (see `.nvmrc`). Vite 8 and its toolchain rely on
native bindings and `require(esm)` support that older Node versions lack — on
Node < 20.19 the build skips a native binding and the test runner fails to
start.

## Getting started

```bash
nvm use        # or install Node 20.19+/22.12+ manually
npm install
npm run dev
```

The dev server runs at the URL Vite prints (default `http://localhost:5173`).

## Scripts

| Script            | Description                                      |
| ----------------- | ------------------------------------------------ |
| `npm run dev`     | Start the Vite dev server with HMR               |
| `npm run build`   | Type-check and build for production into `dist/` |
| `npm run preview` | Preview the production build locally             |
| `npm run test`    | Run the test suite with Vitest                   |
| `npm run lint`    | Lint all `.ts`/`.tsx` files with ESLint          |
| `npm run format`  | Format the project with Prettier                 |

## Project structure

```
src/
├── main.tsx            # Entry point; wraps App in BrowserRouter
├── App.tsx             # Layout + route definitions
├── index.css           # Tailwind import
├── pages/
│   ├── Home.tsx        # Demo page (Tailwind + Button component)
│   └── About.tsx       # Second page demonstrating routing
├── components/
│   └── Button.tsx      # Reusable styled component
└── test/
    ├── setup.ts        # Testing Library / jest-dom setup
    └── Button.test.tsx # Sample test
```
