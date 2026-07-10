import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import TeamVaultSyncBody from '@/generated/team-vault-sync-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Team vault sync',
  description:
    'Share ~/.ClawQL Memory notes across your team via R2, S3, or GCS object storage — clawql sync CLI, auto push/pull, and Helm teamSync values.',
  path: '/getting-started/team-vault-sync',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function TeamVaultSyncPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="sky" variant="medium">
          Team sync
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Sync reference.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/team-vault-sync.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/getting-started/team-vault-sync.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Overview:{' '}
          <a
            href="/getting-started/for-teams"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Getting started for teams
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <TeamVaultSyncBody />
      </Prose>
    </article>
  )
}
