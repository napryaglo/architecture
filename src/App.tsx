import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'

function App() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
    }`

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-4">
          <span className="mr-auto text-lg font-semibold">Mural</span>
          <NavLink to="/" className={linkClass} end>
            Home
          </NavLink>
          <NavLink to="/about" className={linkClass}>
            About
          </NavLink>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
