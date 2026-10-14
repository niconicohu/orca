import { z } from 'zod'
import { MAX_JIRA_STATUS_FILTERS, MAX_JIRA_STATUS_NAME_LENGTH } from '../jira-quick-filters'

const JiraStatuses = z
  .array(
    z
      .string()
      .min(1)
      .max(MAX_JIRA_STATUS_NAME_LENGTH)
      .refine((name) => name.trim().length > 0)
  )
  .max(MAX_JIRA_STATUS_FILTERS)

export const JiraQuickFilterStateParam = z.object({ statuses: JiraStatuses }).strict()
export const JiraIssueListFiltersParam = z
  .object({
    currentSprint: z.boolean().optional(),
    statuses: JiraStatuses.optional()
  })
  .strict()
