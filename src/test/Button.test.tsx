import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Button from '../components/Button'

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Press</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Press' }))

    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('applies the secondary variant styles', () => {
    render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-slate-200')
  })
})
