import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/learn/schedule-notify-workflows` (h2 ids match @sindresorhus/slugify). */
export const learnScheduleNotifyWorkflowsSections: Array<Section> = [
  { title: 'What schedule and notify are', id: 'what-schedule-and-notify-are' },
  { title: 'Using schedule alone', id: 'using-schedule-alone' },
  { title: 'Using notify alone', id: 'using-notify-alone' },
  {
    title: 'Built-in schedule to Slack notifications',
    id: 'built-in-schedule-to-slack-notifications',
  },
  {
    title: 'Agent-orchestrated schedule plus notify',
    id: 'agent-orchestrated-schedule-plus-notify',
  },
  {
    title: 'Human-in-the-loop with Label Studio and Slack',
    id: 'human-in-the-loop-with-label-studio-and-slack',
  },
  {
    title: 'Full example env job flow and thread',
    id: 'full-example-env-job-flow-and-thread',
  },
  { title: 'Safety and operations', id: 'safety-and-operations' },
  {
    title: 'Related guides and references',
    id: 'related-guides-and-references',
  },
]
