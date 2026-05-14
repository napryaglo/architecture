import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300',
}

function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}

export default Button
