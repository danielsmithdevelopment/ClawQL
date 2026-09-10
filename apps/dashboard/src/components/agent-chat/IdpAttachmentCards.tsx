'use client'

import {
  FileTextIcon,
  FolderLockIcon,
  GitBranchIcon,
  SearchIcon,
} from 'lucide-react'

import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'
import { Badge } from '@/components/ui/badge'
import type { ChatAttachment } from '@/components/dashboard/types'
import { cn } from '@/lib/utils'

function attachmentIcon(kind: ChatAttachment['kind']) {
  switch (kind) {
    case 'document':
      return FileTextIcon
    case 'onyx_citation':
      return SearchIcon
    case 'coneshare':
      return FolderLockIcon
    case 'pipeline':
      return GitBranchIcon
    default:
      return FileTextIcon
  }
}

function AttachmentCard({ attachment }: { attachment: ChatAttachment }) {
  const Icon = attachmentIcon(attachment.kind)

  const title =
    attachment.kind === 'pipeline'
      ? (attachment.title ?? attachment.stage)
      : attachment.title
  let description: string | undefined
  let href: string | undefined

  if (attachment.kind === 'document') {
    description = attachment.provider === 'paperless' ? 'Paperless archive' : 'Nextcloud file'
    if (attachment.url) href = attachment.url
    else if (attachment.paperlessId != null) description = `Paperless #${attachment.paperlessId}`
  } else if (attachment.kind === 'onyx_citation') {
    description =
      attachment.snippet?.slice(0, 120) ??
      (attachment.score != null ? `Match ${Math.round(attachment.score * 100)}%` : 'Onyx citation')
  } else if (attachment.kind === 'coneshare') {
    description = attachment.roomUrl ? 'Secure data room' : 'Coneshare link'
    href = attachment.roomUrl
  } else if (attachment.kind === 'pipeline') {
    description = attachment.merkleRoot
      ? `Merkle ${attachment.merkleRoot.slice(0, 12)}…`
      : attachment.stage
  }

  const inner = (
    <Attachment
      size="sm"
      state={attachment.kind === 'pipeline' && attachment.status === 'running' ? 'processing' : 'done'}
      className="max-w-md border-white/10 bg-zinc-900/60"
    >
      <AttachmentMedia variant="icon">
        <Icon className="size-4 text-orange-400" />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle className="text-zinc-100">{title}</AttachmentTitle>
        {description ? (
          <AttachmentDescription className="line-clamp-2 text-zinc-400">{description}</AttachmentDescription>
        ) : null}
      </AttachmentContent>
      {attachment.kind === 'pipeline' ? (
        <Badge
          variant="outline"
          className={cn(
            'mr-2 shrink-0 border-white/10 text-[10px] uppercase',
            attachment.status === 'done' && 'text-emerald-400',
            attachment.status === 'running' && 'text-orange-400',
            attachment.status === 'failed' && 'text-red-400',
          )}
        >
          {attachment.status}
        </Badge>
      ) : null}
    </Attachment>
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block w-fit">
        {inner}
      </a>
    )
  }
  return inner
}

export function IdpAttachmentList({ attachments }: { attachments: ChatAttachment[] }) {
  if (attachments.length === 0) return null
  return (
    <div className="flex flex-col gap-2 pt-1">
      {attachments.map((a) => (
        <AttachmentCard key={a.id} attachment={a} />
      ))}
    </div>
  )
}
