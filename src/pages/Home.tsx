import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'

function Home() {
  const [count, setCount] = useState(0)

  return (
    <section className="flex flex-col items-start gap-6">
      <h1 className="text-4xl font-bold tracking-tight">
        React + Vite + Tailwind
      </h1>
      <p className="text-slate-600">
        A TypeScript boilerplate with routing, testing, and linting wired up.
        Edit{' '}
        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">
          src/pages/Home.tsx
        </code>{' '}
        and save to see HMR in action.
      </p>

      <div className="flex items-center gap-3">
        <Button onClick={() => setCount((c) => c + 1)}>Count is {count}</Button>
        <Button variant="secondary" onClick={() => setCount(0)}>
          Reset
        </Button>
      </div>

      <Link
        to="/about"
        className="text-sm font-medium text-slate-900 underline underline-offset-4"
      >
        Go to the About page →
      </Link>
    </section>
  )
}

export default Home
