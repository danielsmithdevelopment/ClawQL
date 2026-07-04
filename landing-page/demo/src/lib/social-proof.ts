import { site } from './site'

export type SocialProofStats = {
  githubStars: number
  npmWeeklyDownloads: number
}

const FALLBACK: SocialProofStats = {
  githubStars: 12,
  npmWeeklyDownloads: 200,
}

/** Fetched at build time for static export — falls back if the network is unavailable. */
export async function getSocialProofStats(): Promise<SocialProofStats> {
  try {
    const [githubRes, npmRes] = await Promise.all([
      fetch(`${site.urls.githubApi}/repos/danielsmithdevelopment/ClawQL`, {
        next: { revalidate: 3600 },
      }),
      fetch('https://api.npmjs.org/downloads/point/last-week/clawql-mcp', {
        next: { revalidate: 3600 },
      }),
    ])

    const github = githubRes.ok ? ((await githubRes.json()) as { stargazers_count?: number }) : null
    const npm = npmRes.ok ? ((await npmRes.json()) as { downloads?: number }) : null

    return {
      githubStars: github?.stargazers_count ?? FALLBACK.githubStars,
      npmWeeklyDownloads: npm?.downloads ?? FALLBACK.npmWeeklyDownloads,
    }
  } catch {
    return FALLBACK
  }
}

export function formatSocialProofStat(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`
  }
  return String(value)
}
