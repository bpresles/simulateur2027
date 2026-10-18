import { useEffect } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'

interface Props {
  value: number
  format: (v: number) => string
  className?: string
}

/** Nombre qui glisse vers sa nouvelle valeur quand le scénario change. */
export function AnimatedNumber({ value, format, className }: Props) {
  const spring = useSpring(value, { stiffness: 140, damping: 24, mass: 0.8 })
  const text = useTransform(spring, format)
  useEffect(() => {
    spring.set(value)
  }, [spring, value])
  return (
    <motion.span className={className} aria-label={format(value)}>
      {text}
    </motion.span>
  )
}
