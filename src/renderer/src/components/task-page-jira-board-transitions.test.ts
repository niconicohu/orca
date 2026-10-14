import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JiraIssue, JiraStatus, JiraTransition } from '../../../shared/jira-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'

const mocks = vi.hoisted(() => ({
  jiraListTransitions: vi.fn()
}))

vi.mock('@/runtime/runtime-jira-client', () => ({
  jiraListTransitions: mocks.jiraListTransitions
}))

const { findJiraBoardSectionTransition, loadTaskPageJiraIssueTransitions } =
  await import('./task-page-jira-board-transitions')
const settings: TaskSourceContext = {
  kind: 'task-source',
  provider: 'jira',
  projectId: 'project',
  hostId: 'local'
}

function status(id: string, name: string): JiraStatus {
  return { id, name, categoryKey: 'indeterminate', categoryName: 'In Progress' }
}

function transition(id: string, to: JiraStatus): JiraTransition {
  return { id, name: `To ${to.name}`, to }
}

function issue(key: string, statusValue: JiraStatus, siteId?: string): JiraIssue {
  return {
    id: key,
    key,
    siteId,
    title: key,
    url: `https://example.atlassian.net/browse/${key}`,
    project: { id: 'p1', key: 'STA', name: 'Stably' },
    issueType: { id: 't1', name: 'Task' },
    status: statusValue,
    labels: [],
    updatedAt: '2026-08-07T12:00:00.000Z',
    createdAt: '2026-08-07T12:00:00.000Z'
  }
}

describe('findJiraBoardSectionTransition', () => {
  const inProgress = status('2', 'In Progress')
  const done = status('3', 'Done')

  it('matches by the status id of issues already in the section', () => {
    const renamed = transition('t-done', { ...done, name: 'Completed' })
    const found = findJiraBoardSectionTransition([transition('t-ip', inProgress), renamed], {
      label: 'Done',
      issues: [issue('STA-1', done)]
    })
    expect(found).toBe(renamed)
  })

  it('falls back to matching the section label by status name', () => {
    const toDone = transition('t-done', done)
    const found = findJiraBoardSectionTransition([toDone], { label: 'Done', issues: [] })
    expect(found).toBe(toDone)
  })

  it('matches an empty column through its board-config status ids', () => {
    const renamed = transition('t-done', { ...done, name: 'Completed' })
    const found = findJiraBoardSectionTransition([renamed], {
      label: 'Done column',
      statusIds: ['3'],
      issues: []
    })
    expect(found).toBe(renamed)
  })

  it('returns null when no transition reaches the section', () => {
    expect(
      findJiraBoardSectionTransition([transition('t-ip', inProgress)], {
        label: 'Done',
        issues: [issue('STA-1', done)]
      })
    ).toBeNull()
  })
  it('does not select an arbitrary action when several actions reach a column', () => {
    expect(
      findJiraBoardSectionTransition([transition('first', done), transition('second', done)], {
        label: 'Done',
        statusIds: ['3'],
        fromBoard: true,
        issues: []
      })
    ).toBeNull()
  })
  it('does not use a same-named status outside an authoritative board column', () => {
    expect(
      findJiraBoardSectionTransition([transition('other', status('other', 'Done'))], {
        label: 'Done',
        statusIds: ['3'],
        fromBoard: true,
        issues: []
      })
    ).toBeNull()
  })
  it('does not borrow a status ID from another Jira site in fallback columns', () => {
    expect(
      findJiraBoardSectionTransition(
        [transition('wrong', status('3', 'Blocked'))],
        {
          label: 'Done',
          statusIds: ['3'],
          fromBoard: false,
          issues: [issue('ABC-1', done, 'site-b')]
        },
        'site-a'
      )
    ).toBeNull()
  })
})

describe('loadTaskPageJiraIssueTransitions', () => {
  beforeEach(() => {
    mocks.jiraListTransitions.mockReset()
  })

  it('caches per issue status and refetches after the status changes', async () => {
    const inProgress = status('2', 'In Progress')
    const done = status('3', 'Done')
    mocks.jiraListTransitions.mockResolvedValue([transition('t-done', done)])

    await loadTaskPageJiraIssueTransitions(settings, 'scope', issue('STA-9', inProgress, 'site-a'))
    await loadTaskPageJiraIssueTransitions(settings, 'scope', issue('STA-9', inProgress, 'site-a'))
    expect(mocks.jiraListTransitions).toHaveBeenCalledTimes(1)

    await loadTaskPageJiraIssueTransitions(settings, 'scope', issue('STA-9', done, 'site-a'))
    expect(mocks.jiraListTransitions).toHaveBeenCalledTimes(2)
  })

  it('surfaces a failed transitions request and allows an explicit retry', async () => {
    mocks.jiraListTransitions.mockRejectedValue(new Error('offline'))
    await expect(
      loadTaskPageJiraIssueTransitions(
        settings,
        'scope',
        issue('STA-500', status('2', 'In Progress'))
      )
    ).rejects.toThrow('offline')
    mocks.jiraListTransitions.mockResolvedValue([])
    await expect(
      loadTaskPageJiraIssueTransitions(
        settings,
        'scope',
        issue('STA-500', status('2', 'In Progress')),
        true
      )
    ).resolves.toEqual([])
    expect(mocks.jiraListTransitions).toHaveBeenCalledTimes(2)
  })
})
