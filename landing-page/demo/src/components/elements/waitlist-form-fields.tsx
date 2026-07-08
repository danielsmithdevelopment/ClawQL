import { waitlistSubject, waitlistThanksUrl, type WaitlistSource } from '@/lib/waitlist'

/** Hidden fields required by FormSubmit — https://formsubmit.co */
export function WaitlistFormFields({ source }: { source: WaitlistSource }) {
  return (
    <>
      <input type="hidden" name="_subject" value={waitlistSubject(source)} />
      <input type="hidden" name="_next" value={waitlistThanksUrl} />
      <input type="hidden" name="_template" value="table" />
      <input type="hidden" name="source" value={source} />
      <input type="text" name="_honey" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    </>
  )
}
