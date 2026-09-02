import { AgentMarkdownDocBody } from '@/components/AgentMarkdownDocBody'
import { Note } from '@/components/mdx'
import { Prose } from '@/components/Prose'
import { Tag } from '@/components/Tag'
import { docsPageMetadata } from '@/lib/seo'

export const metadata = docsPageMetadata({
  title: 'clawql-payments — Stripe, x402, MPP, Adyen, and WORM audit',
  description:
    'ClawQL unified payments: native Stripe + x402 + MPP + AP2 + ACP agentic rails, PayPal Orders, Adyen Checkout, plan entitlements, and WORM-audited payment events.',
  path: '/payments/clawql-payments',
  ogType: 'article',
})

export const dynamic = 'force-static'

export default function ClawqlPaymentsPage() {
  return (
    <article className="flex h-full flex-col pt-10 pb-10">
      <div className="not-prose mb-6 flex flex-wrap items-center gap-2">
        <Tag color="claw" variant="medium">
          Platform
        </Tag>
        <Tag color="claw" variant="medium">
          Payments
        </Tag>
      </div>

      <div className="not-prose mb-8">
        <Note>
          <strong>Native agentic + enterprise rails.</strong> Generated from{' '}
          <a
            href="https://github.com/danielsmithdevelopment/ClawQL/blob/main/docs/payments/clawql-payments.md"
            className="font-medium text-inherit underline underline-offset-2"
          >
            docs/payments/clawql-payments.md
          </a>{' '}
          on <code className="font-mono text-xs">main</code>. Related:{' '}
          <a
            href="/plugins/payments"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Payments plugin
          </a>
          ,{' '}
          <a
            href="/learn/payments-and-entitlements"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Learn walkthrough
          </a>
          ,{' '}
          <a
            href="/inference/clawql-inference"
            className="font-medium text-inherit underline underline-offset-2"
          >
            Agentic Gateway
          </a>
          .
        </Note>
      </div>

      <Prose className="flex-auto">
        <AgentMarkdownDocBody path="/payments/clawql-payments" />
      </Prose>
    </article>
  )
}
