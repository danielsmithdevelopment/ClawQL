/** Injects JSON-LD; safe for static generation (no user input). */
export function JsonLd(props: {
  data: Record<string, unknown> | Array<unknown>
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(props.data),
      }}
    />
  )
}
