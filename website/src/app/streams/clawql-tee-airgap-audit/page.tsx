import { DocProse } from '@/components/DocProse'
import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import AirgapBody from '@/generated/clawql-tee-airgap-audit-body.mdx'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'clawql-tee Air-Gap Audit Transport',
  description:
    'Unidirectional QR code streaming of WORM audit trails and SEV-SNP attestation out of a TEE — Merkle-chained frames for regulator verification without network trust.',
  path: '/streams/clawql-tee-airgap-audit',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlTeeAirgapAuditPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Security
        </Tag>
        <Tag color="claw" variant="medium">
          Air-gap
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>QR air-gap audit — not yet shipped.</strong> Companion to{' '}
          <a
            href="/streams/clawql-tee"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql-tee
          </a>{' '}
          and{' '}
          <a
            href="/streams/clawql-cellrt"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql-cellrt
          </a>
          . Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/streams/clawql-tee-airgap-audit.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/streams/clawql-tee-airgap-audit.md
          </a>
          .
        </Note>
      </div>

      <DocProse className="flex-auto">
        <AirgapBody />
      </DocProse>
    </article>
  )
}
