import { permanentRedirect } from 'next/navigation'

/** @deprecated Use `/plugins` — kept only so static builds resolve the old path. */
export default function PluginsReferenceRedirectPage() {
  permanentRedirect('/plugins')
}
