import { Link } from '@/components/elements/link'
import { formatSocialProofStat, type SocialProofStats } from '@/lib/social-proof'
import { site } from '@/lib/site'

export function SocialProofBar({ stats }: { stats: SocialProofStats }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm/7 text-mist-600 dark:text-mist-400">
      <Link href={site.urls.github} className="font-medium">
        {formatSocialProofStat(stats.githubStars)} GitHub stars
      </Link>
      <span aria-hidden className="hidden text-mist-400 sm:inline">
        ·
      </span>
      <Link href={site.urls.npm} className="font-medium">
        {formatSocialProofStat(stats.npmWeeklyDownloads)} npm downloads / week
      </Link>
      <span aria-hidden className="hidden text-mist-400 sm:inline">
        ·
      </span>
      <span>Open source · Apache-2.0</span>
    </div>
  )
}
