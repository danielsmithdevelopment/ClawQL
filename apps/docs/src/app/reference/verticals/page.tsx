import { permanentRedirect } from 'next/navigation'

/** @deprecated Use `/plugins#verticals` — kept only so static builds resolve the old path. */
export default function VerticalsReferenceRedirectPage() {
  permanentRedirect('/plugins#verticals')
}
