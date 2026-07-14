'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { Logo } from '@/components/Logo'
import { Navigation } from '@/components/Navigation'
import { OnThisPageProvider } from '@/components/OnThisPage'
import { SectionProvider } from '@/components/SectionProvider'
import { DOC_LAYOUT_SECTIONS_BY_PATH } from '@/lib/doc-layout-sections'

const WebMcpRegister = dynamic(
  () =>
    import('@/components/WebMcpRegister').then((m) => ({
      default: m.WebMcpRegister,
    })),
  { ssr: false },
)

export function Layout({ children }: { children: React.ReactNode }) {
  let pathname = usePathname()

  return (
    <SectionProvider sections={DOC_LAYOUT_SECTIONS_BY_PATH[pathname] ?? []}>
      <OnThisPageProvider>
        <WebMcpRegister />
        <div className="h-full lg:ml-72 xl:ml-80">
          <header className="contents lg:pointer-events-none lg:fixed lg:inset-0 lg:z-40 lg:flex">
            <div className="docs-sidebar contents lg:pointer-events-auto lg:block lg:w-72 lg:overflow-y-auto lg:border-r lg:border-zinc-900/10 lg:px-6 lg:pt-4 lg:pb-8 xl:w-80 lg:dark:border-claw-graph/40">
              <div className="hidden lg:flex">
                <Link href="/" aria-label="Home">
                  <Logo />
                </Link>
              </div>
              <Header />
              <Navigation className="docs-desktop-nav hidden lg:mt-10 lg:block" />
            </div>
          </header>
          <div className="relative flex h-full flex-col px-4 pt-14 sm:px-6 lg:px-8">
            <main id="main-content" className="flex-auto" tabIndex={-1}>
              {children}
            </main>
            <Footer />
          </div>
        </div>
      </OnThisPageProvider>
    </SectionProvider>
  )
}
