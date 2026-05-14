import { Link } from 'react-router-dom'

function About() {
  return (
    <section className="flex flex-col items-start gap-6">
      <h1 className="text-4xl font-bold tracking-tight">About</h1>
      <p className="text-slate-600">
        This second page exists to prove that client-side routing works. It is
        rendered by React Router from{' '}
        <code className="rounded bg-slate-200 px-1.5 py-0.5 text-sm">
          src/pages/About.tsx
        </code>
        .
      </p>
      <Link
        to="/"
        className="text-sm font-medium text-slate-900 underline underline-offset-4"
      >
        ← Back home
      </Link>
    </section>
  )
}

export default About
