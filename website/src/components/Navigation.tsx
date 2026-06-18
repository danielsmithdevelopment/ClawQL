'use client'

import clsx from 'clsx'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'

import { Button } from '@/components/Button'
import { useIsInsideMobileNavigation } from '@/components/MobileNavigation'
import { useSectionStore } from '@/components/SectionProvider'
import { Tag } from '@/components/Tag'
import { remToPx } from '@/lib/remToPx'
import { CloseButton } from '@headlessui/react'

interface NavGroup {
  title: string
  links: Array<{
    title: string
    href: string
  }>
}

function useInitialValue<T>(value: T, condition = true) {
  let initialValue = useRef(value).current
  return condition ? initialValue : value
}

function TopLevelNavItem({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const external = href.startsWith('http')
  return (
    <li className="md:hidden">
      <CloseButton
        as={Link}
        href={href}
        rel={external ? 'noopener noreferrer' : undefined}
        className="block py-1 text-sm text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      >
        {children}
      </CloseButton>
    </li>
  )
}

function NavLink({
  href,
  children,
  tag,
  active = false,
  isAnchorLink = false,
}: {
  href: string
  children: React.ReactNode
  tag?: string
  active?: boolean
  isAnchorLink?: boolean
}) {
  const external = href.startsWith('http')
  return (
    <CloseButton
      as={Link}
      href={href}
      rel={external ? 'noopener noreferrer' : undefined}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex justify-between gap-2 py-1 pr-3 text-sm transition',
        isAnchorLink ? 'pl-7' : 'pl-4',
        active
          ? 'text-zinc-900 dark:text-white'
          : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white',
      )}
    >
      <span className="truncate">{children}</span>
      {tag && (
        <Tag variant="small" color="zinc">
          {tag}
        </Tag>
      )}
    </CloseButton>
  )
}

function VisibleSectionHighlight({
  group,
  pathname,
}: {
  group: NavGroup
  pathname: string
}) {
  let [sections, visibleSections] = useInitialValue(
    [
      useSectionStore((s) => s.sections),
      useSectionStore((s) => s.visibleSections),
    ],
    useIsInsideMobileNavigation(),
  )

  let isPresent = useIsPresent()
  let firstVisibleSectionIndex = Math.max(
    0,
    [{ id: '_top' }, ...sections].findIndex(
      (section) => section.id === visibleSections[0],
    ),
  )
  let itemHeight = remToPx(2)
  let height = isPresent
    ? Math.max(1, visibleSections.length) * itemHeight
    : itemHeight
  let top =
    group.links.findIndex((link) => linkMatchesPath(link.href, pathname)) *
      itemHeight +
    firstVisibleSectionIndex * itemHeight

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.2 } }}
      exit={{ opacity: 0 }}
      className="absolute inset-x-0 top-0 bg-zinc-800/2.5 will-change-transform dark:bg-white/2.5"
      style={{ borderRadius: 8, height, top }}
    />
  )
}

function ActivePageMarker({
  group,
  pathname,
}: {
  group: NavGroup
  pathname: string
}) {
  let itemHeight = remToPx(2)
  let offset = remToPx(0.25)
  let activePageIndex = group.links.findIndex((link) =>
    linkMatchesPath(link.href, pathname),
  )
  let top = offset + activePageIndex * itemHeight

  return (
    <motion.div
      layout
      className="absolute left-2 h-6 w-px bg-claw-cyan"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.2 } }}
      exit={{ opacity: 0 }}
      style={{ top }}
    />
  )
}

function linkMatchesPath(href: string, pathname: string) {
  if (href === pathname) return true
  if (href === '/' || href.startsWith('http')) return false
  return pathname.startsWith(`${href}/`)
}

function NavigationGroup({
  group,
  className,
}: {
  group: NavGroup
  className?: string
}) {
  // If this is the mobile navigation then we always render the initial
  // state, so that the state does not change during the close animation.
  // The state will still update when we re-open (re-render) the navigation.
  let isInsideMobileNavigation = useIsInsideMobileNavigation()
  let [pathname, sections] = useInitialValue(
    [usePathname(), useSectionStore((s) => s.sections)],
    isInsideMobileNavigation,
  )

  let isActiveGroup =
    group.links.findIndex((link) => linkMatchesPath(link.href, pathname)) !== -1

  return (
    <li className={clsx('relative mt-6', className)}>
      <motion.p
        layout="position"
        className="text-xs font-semibold text-zinc-900 dark:text-white"
      >
        {group.title}
      </motion.p>
      <div className="relative mt-3 pl-2">
        <AnimatePresence initial={!isInsideMobileNavigation}>
          {isActiveGroup && (
            <VisibleSectionHighlight group={group} pathname={pathname} />
          )}
        </AnimatePresence>
        <motion.div
          layout
          className="absolute inset-y-0 left-2 w-px bg-zinc-900/10 dark:bg-white/5"
        />
        <AnimatePresence initial={false}>
          {isActiveGroup && (
            <ActivePageMarker group={group} pathname={pathname} />
          )}
        </AnimatePresence>
        <ul role="list" className="border-l border-transparent">
          {group.links.map((link) => (
            <motion.li key={link.href} layout="position" className="relative">
              <NavLink
                href={link.href}
                active={linkMatchesPath(link.href, pathname)}
              >
                {link.title}
              </NavLink>
              <AnimatePresence mode="popLayout" initial={false}>
                {link.href === pathname && sections.length > 0 && (
                  <motion.ul
                    role="list"
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      transition: { delay: 0.1 },
                    }}
                    exit={{
                      opacity: 0,
                      transition: { duration: 0.15 },
                    }}
                  >
                    {sections.map((section) => (
                      <li key={section.id}>
                        <NavLink
                          href={`${link.href}#${section.id}`}
                          tag={section.tag}
                          isAnchorLink
                        >
                          {section.title}
                        </NavLink>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </ul>
      </div>
    </li>
  )
}

export const navigation: Array<NavGroup> = [
  {
    title: 'Getting started',
    links: [
      { title: 'Overview', href: '/getting-started' },
      { title: 'Quickstart', href: '/quickstart' },
      { title: 'Install', href: '/install' },
      { title: 'MCP clients', href: '/mcp-clients' },
      { title: 'Choose your tier', href: '/deployment' },
    ],
  },
  {
    title: 'Architecture & vision',
    links: [
      { title: 'Architecture hub', href: '/architecture' },
      { title: 'Vision & Roadmap', href: '/vision/roadmap' },
      {
        title: 'Master enablement guide',
        href: '/vision/technical-enablement',
      },
      { title: 'Modularization v2.1', href: '/vision/modularization' },
      {
        title: 'Immutable releases (Layer 0)',
        href: '/vision/immutable-releases',
      },
      { title: 'DAOS specification', href: '/ouroboros/specification' },
      { title: 'Slide deck', href: '/vision/slide-deck' },
    ],
  },
  {
    title: 'Deployment & operations',
    links: [
      { title: 'Deployment hub', href: '/deployment' },
      {
        title: 'Operations guide (Tier 1–3)',
        href: '/deployment/operations-guide',
      },
      { title: 'Tier 2: Kubernetes', href: '/deployment/kubernetes' },
      { title: 'Helm chart', href: '/helm' },
      { title: 'Platform ops (HTTP, Docker)', href: '/deployment/platforms' },
      { title: 'Tailscale & Headscale', href: '/tailscale' },
      { title: 'Dashboard on Kubernetes', href: '/dashboard-kubernetes' },
      {
        title: 'Istio & observability lab',
        href: '/docker-desktop-observability',
      },
      { title: 'OpenClaw + ClawQL', href: '/openclaw' },
    ],
  },
  {
    title: 'Guides',
    links: [
      { title: 'Guides hub', href: '/guides' },
      { title: 'ClawQL Learn', href: '/learn' },
      { title: 'Token efficiency', href: '/architecture/token-efficiency' },
      { title: 'Security overview', href: '/security' },
      { title: 'Defense in depth', href: '/security/defense-in-depth' },
      {
        title: 'Security curriculum (32 modules)',
        href: '/security/best-practices',
      },
      { title: 'HITL & human interfaces', href: '/reference/hitl' },
      { title: 'Verticals guide', href: '/reference/verticals' },
      { title: 'Troubleshooting', href: '/troubleshooting' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { title: 'Reference hub', href: '/reference' },
      { title: 'Protocol v2.1', href: '/reference/protocol' },
      { title: 'Core concepts', href: '/concepts' },
      { title: 'MCP tools', href: '/tools' },
      { title: 'Configuration', href: '/spec-configuration' },
      {
        title: 'Contributor specification',
        href: '/contributing/technical-specification',
      },
      { title: 'Optional tools hub', href: '/reference/optional-tools' },
      { title: 'Ouroboros library', href: '/ouroboros' },
      { title: 'Bundled specs', href: '/bundled-specs' },
      { title: 'GraphQL layer', href: '/graphql-proxy' },
      { title: 'NATS JetStream', href: '/nats-jetstream' },
      { title: 'Benchmarks', href: '/benchmarks' },
    ],
  },
  {
    title: 'Examples',
    links: [
      { title: 'Examples hub', href: '/examples' },
      {
        title: 'Cloudflare docs deploy',
        href: '/case-studies/cloudflare-docs-mcp',
      },
      {
        title: 'Vault + GitHub session',
        href: '/case-studies/vault-memory-github-session-2026-04',
      },
      {
        title: 'Cross-thread vault recall',
        href: '/case-studies/cross-thread-vault-recall',
      },
    ],
  },
  {
    title: 'Resources',
    links: [
      { title: 'Resources hub', href: '/resources' },
      { title: 'Roadmap', href: '/vision/roadmap' },
      { title: 'Changelog & releases', href: '/resources/changelog' },
      { title: 'Migration guide', href: '/resources/migration' },
      {
        title: 'GitHub',
        href: 'https://github.com/danielsmithdevelopment/ClawQL',
      },
    ],
  },
]

export function Navigation(props: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav aria-label="Documentation" {...props}>
      <ul role="list">
        <TopLevelNavItem href="/">Home</TopLevelNavItem>
        <TopLevelNavItem href="/getting-started">
          Getting started
        </TopLevelNavItem>
        <TopLevelNavItem href="/architecture">Architecture</TopLevelNavItem>
        <TopLevelNavItem href="/deployment">Deployment</TopLevelNavItem>
        <TopLevelNavItem href="/learn">Learn</TopLevelNavItem>
        <TopLevelNavItem href="https://github.com/danielsmithdevelopment/ClawQL">
          GitHub
        </TopLevelNavItem>
        {navigation.map((group, groupIndex) => (
          <NavigationGroup
            key={group.title}
            group={group}
            className={groupIndex === 0 ? 'md:mt-0' : ''}
          />
        ))}
        <li className="sticky bottom-0 z-10 mt-6 min-[416px]:hidden">
          <Button
            href="https://www.npmjs.com/package/clawql-mcp"
            variant="filled"
            className="w-full"
          >
            npm package
          </Button>
        </li>
      </ul>
    </nav>
  )
}
