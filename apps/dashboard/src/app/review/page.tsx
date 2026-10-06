import { ReviewPage } from '@/components/managed/ReviewPage'
import { requireManagedConsole } from '@/lib/managed/require-managed'

export default function ReviewPageRoute() {
  requireManagedConsole()
  return <ReviewPage />
}
