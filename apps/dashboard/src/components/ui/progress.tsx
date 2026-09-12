'use client'

import * as ProgressPrimitive from '@radix-ui/react-progress'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'

import { cn } from '@/lib/utils'

export const Progress = forwardRef<
  ElementRef<typeof ProgressPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-2 w-full overflow-hidden rounded-full bg-zinc-800', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full rounded-full bg-orange-500 transition-[width] duration-500"
      style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName
