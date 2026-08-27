import { Note } from '@/components/mdx'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'
import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'

export const metadata = docsPageMetadata({
  title: 'clawql-tee — Trusted Execution Environment',
  description:
    'Hardware TEE for ClawQL cellrt: AMD SEV-SNP / Intel TDX remote attestation, attestation-gated Vault secrets, optional GPU CC, and air-gap QR audit transport.',
  path: '/streams/clawql-tee',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlTeePage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Security
        </Tag>
        <Tag color="claw" variant="medium">
          TEE
        </Tag>
        <Tag color="amber" variant="medium">
          Draft
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Hardware TEE path — not yet shipped.</strong> Builds on{' '}
          <a
            href="/streams/clawql-cellrt"
            className="font-medium text-inherit underline underline-offset-2"
          >
            clawql-cellrt
          </a>
          . Air-gap audit:{' '}
          <a
            href="/streams/clawql-tee-airgap-audit"
            className="font-medium text-inherit underline underline-offset-2"
          >
            QR transport
          </a>
          . Source:{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/streams/clawql-tee.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/streams/clawql-tee.md
          </a>
          .
        </Note>
      </div>

      <AgentMarkdownDocBody path="/streams/clawql-tee" className="flex-auto" />
    </article>
  )
}
