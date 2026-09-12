import { GridPattern } from '@/components/GridPattern'

/**
 * Full-bleed within the main column (not the viewport): matches Layout sidebar offsets
 * (`lg:ml-72` / `xl:ml-80`) so the wash lines up with prose, not under the nav rail.
 */
export function HeroPattern() {
  return (
    <div
      className="pointer-events-none relative left-1/2 -z-10 !mx-0 mb-[calc(var(--spacing)*-20)] min-h-[min(22vh,11rem)] w-screen !max-w-none -translate-x-1/2 overflow-hidden lg:w-[calc(100vw-18rem)] xl:w-[calc(100vw-20rem)]"
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-b from-claw-terra/10 via-claw-warm-white to-claw-warm-white dark:from-claw-terra/20 dark:via-claw-bg dark:to-claw-bg" />
      <GridPattern
        width={72}
        height={56}
        x="50%"
        y={-6}
        squares={[
          [0, 1],
          [1, 2],
        ]}
        className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-[-18deg] fill-claw-graph/5 stroke-claw-graph/15 dark:fill-claw-cyan/5 dark:stroke-claw-terra/25"
      />
    </div>
  )
}
