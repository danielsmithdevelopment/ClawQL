'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef } from 'react'

import { Button } from '@/components/Button'
import { useIsInsideMobileNavigation } from '@/components/MobileNavigation'
import { useSectionStore } from '@/components/SectionProvider'
import { Tag } from '@/components/Tag'
import {
  docsMobileShortcuts,
  docsNavigation,
  type NavGroup,
} from '@/lib/docs-nav-data'
import { remToPx } from '@/lib/remToPx'
import { CloseButton } from '@headlessui/react'

interface NavGroupProps extends NavGroup {}

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
  group: NavGroupProps
  pathname: string
}) {
  let [sections, visibleSections] = useInitialValue(
    [
      useSectionStore((s) => s.sections),
      useSectionStore((s) => s.visibleSections),
    ],
    useIsInsideMobileNavigation(),
  )

  let firstVisibleSectionIndex = Math.max(
    0,
    [{ id: '_top' }, ...sections].findIndex(
      (section) => section.id === visibleSections[0],
    ),
  )
  let itemHeight = remToPx(2)
  let height = Math.max(1, visibleSections.length) * itemHeight
  let top =
    group.links.findIndex((link) => linkMatchesPath(link.href, pathname)) *
      itemHeight +
    firstVisibleSectionIndex * itemHeight

  return (
    <div
      className="absolute inset-x-0 top-0 bg-zinc-800/2.5 transition-[top,height] duration-200 ease-out dark:bg-white/2.5"
      style={{ borderRadius: 8, height, top }}
    />
  )
}

function ActivePageMarker({
  group,
  pathname,
}: {
  group: NavGroupProps
  pathname: string
}) {
  let itemHeight = remToPx(2)
  let offset = remToPx(0.25)
  let activePageIndex = group.links.findIndex((link) =>
    linkMatchesPath(link.href, pathname),
  )
  let top = offset + activePageIndex * itemHeight

  return (
    <div
      className="absolute left-2 h-6 w-px bg-claw-cyan transition-[top] duration-200 ease-out"
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
  group: NavGroupProps
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
      <p className="text-xs font-semibold text-zinc-900 dark:text-white">
        {group.title}
      </p>
      <div className="relative mt-3 pl-2">
        {isActiveGroup ? (
          <VisibleSectionHighlight group={group} pathname={pathname} />
        ) : null}
        <div className="absolute inset-y-0 left-2 w-px bg-zinc-900/10 dark:bg-white/5" />
        {isActiveGroup ? (
          <ActivePageMarker group={group} pathname={pathname} />
        ) : null}
        <ul role="list" className="border-l border-transparent">
          {group.links.map((link) => (
            <li key={link.href} className="relative">
              <NavLink
                href={link.href}
                active={linkMatchesPath(link.href, pathname)}
              >
                {link.title}
              </NavLink>
              {link.href === pathname && sections.length > 0 ? (
                <ul role="list">
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
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}

export const navigation = docsNavigation

export function Navigation(props: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav aria-label="Documentation" {...props}>
      <ul role="list">
        {docsMobileShortcuts.map((item) => (
          <TopLevelNavItem key={item.href} href={item.href}>
            {item.title}
          </TopLevelNavItem>
        ))}
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
