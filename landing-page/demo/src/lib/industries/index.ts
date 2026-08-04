import { educationIndustry } from './education'
import { healthcareIndustry } from './healthcare'
import { insuranceIndustry } from './insurance'
import { legalIndustry } from './legal'
import { lendingIndustry } from './lending'
import { realEstateIndustry } from './real-estate'
import { surveillanceIndustry } from './surveillance'

export type {
  Industry,
  IndustryAuditEvent,
  IndustryExample,
  IndustryResource,
  IndustryStackRow,
  IndustryWorkflowStep,
} from './types'

export const industries = [
  lendingIndustry,
  realEstateIndustry,
  surveillanceIndustry,
  healthcareIndustry,
  legalIndustry,
  insuranceIndustry,
  educationIndustry,
] as const

export const industriesBySlug = Object.fromEntries(industries.map((industry) => [industry.slug, industry])) as Record<
  string,
  (typeof industries)[number]
>

export function getIndustry(slug: string): (typeof industries)[number] | undefined {
  return industriesBySlug[slug]
}
