import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import GoldenHostImagesBody from '@/generated/golden-host-images-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'Golden host images (Packer + Pulumi)',
  description:
    'Managed-tier ClawQL hosts: Packer bakes golden AMIs/GCP images; Pulumi provisions EC2/GCE/R2 with tier sync prefixes and boot-time team vault pull.',
  path: '/getting-started/golden-host-images',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function GoldenHostImagesPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Getting started
        </Tag>
        <Tag color="amber" variant="medium">
          Packer
        </Tag>
        <Tag color="sky" variant="medium">
          Pulumi
        </Tag>
        <Tag color="zinc" variant="medium">
          Managed tiers
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Managed host provisioning.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/getting-started/golden-host-images.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/getting-started/golden-host-images.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Team sync:{' '}
          <a
            href="/getting-started/team-vault-sync"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Team vault sync
          </a>
          . Local agent containment:{' '}
          <a
            href="/getting-started/local-agent-sandbox"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Local agent sandbox
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <GoldenHostImagesBody />
      </Prose>
    </article>
  )
}
