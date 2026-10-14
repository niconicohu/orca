import type {
  JiraIssue,
  JiraIssueUpdate,
  JiraMutationResult,
  JiraTransition
} from '../../../shared/jira-types'
import type { TaskPageJiraBoardSection } from './task-page-jira-board-sections'
import {
  findJiraBoardSectionTransitions,
  loadTaskPageJiraIssueTransitions
} from './task-page-jira-board-transitions'
import {
  jiraGetIssue,
  jiraUpdateIssue,
  type RuntimeJiraSettings
} from '@/runtime/runtime-jira-client'

export async function getJiraBoardMoveTransitions(
  settings: RuntimeJiraSettings,
  scopeKey: string,
  issue: JiraIssue,
  destination: TaskPageJiraBoardSection,
  force = false
): Promise<JiraTransition[]> {
  const transitions = await loadTaskPageJiraIssueTransitions(settings, scopeKey, issue, force)
  return findJiraBoardSectionTransitions(transitions, destination, issue.siteId)
}

export async function applyJiraBoardMove(
  settings: RuntimeJiraSettings,
  issue: JiraIssue,
  updates: JiraIssueUpdate
): Promise<{ result: JiraMutationResult; latest: JiraIssue | null }> {
  const result = await jiraUpdateIssue(settings, issue.key, updates, issue.siteId)
  if (!result.ok) {
    return { result, latest: null }
  }
  const latest = await jiraGetIssue(settings, issue.key, issue.siteId).catch(() => null)
  return { result, latest }
}
