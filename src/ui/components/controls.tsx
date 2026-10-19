import type { ReactNode } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as ToggleGroup from '@radix-ui/react-toggle-group'

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  id,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: ReactNode
  description?: ReactNode
  id: string
  disabled?: boolean
}) {
  return (
    <div className={`flex items-start gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-rule transition-colors data-[state=checked]:bg-ballpoint disabled:cursor-not-allowed"
      >
        <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
      <label htmlFor={id} className={`select-none leading-tight ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className="block text-[0.95rem] font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-3">{description}</span>}
      </label>
    </div>
  )
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  id,
  disabled,
  title,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: ReactNode
  description?: ReactNode
  id: string
  disabled?: boolean
  title?: string
}) {
  return (
    <div className="flex items-start gap-2.5" title={title}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-ballpoint disabled:cursor-not-allowed"
      />
      <label htmlFor={id} className={`select-none leading-tight ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className="text-[0.95rem] font-medium text-ink">{label}</span>
        {description && <span className="ml-1.5 text-sm text-ink-3">{description}</span>}
      </label>
    </div>
  )
}

export function Slider({
  value,
  onValueChange,
  min,
  max,
  step,
  label,
  disabled,
}: {
  value: number
  onValueChange: (v: number) => void
  min: number
  max: number
  step: number
  label: string
  disabled?: boolean
}) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      onValueChange={([v]) => v !== undefined && onValueChange(v)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className="relative flex h-5 w-full touch-none select-none items-center data-[disabled]:opacity-40"
    >
      <SliderPrimitive.Track className="relative h-1 grow rounded-full bg-rule">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-ballpoint" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={label}
        className="block h-4 w-4 rounded-full border-2 border-ballpoint bg-surface shadow"
      />
    </SliderPrimitive.Root>
  )
}

export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
}: {
  value: T
  onValueChange: (v: T) => void
  options: { value: T; label: string; hint?: string }[]
  label: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={label}
      className="inline-flex rounded-lg bg-sunken p-1"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          title={o.hint}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-sm"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

export function TextButton({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode
  onClick: () => void
  className?: string
}) {
  return (
    <button type="button" onClick={onClick} className={`link text-sm ${className}`}>
      {children}
    </button>
  )
}
