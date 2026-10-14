import { translate } from '@/i18n/i18n'
import { isRuntimeProviderSearchQueryWithinLimit } from '@/runtime/runtime-provider-search-bounds'
import { withCurrentSprintClause } from '../../../shared/jira-jql-predicate'
import { buildJiraStatusCatalog } from './task-page-jira-status-catalog'
import type { TaskPageLinearCollectionEffectsModel } from './use-task-page-linear-collection-effects'
import { useEffect, useRef } from 'react'
import {
  getSingleJiraProjectScope,
  getTaskPageJiraStatusOrderScopeKey,
  loadTaskPageJiraProjectStatusOrder
} from '@/components/task-page-jira-status-order'
import { createTaskPageJiraLoadFailureState } from '@/components/task-page-jira-load-state'
import { searchTaskPageJiraIssues } from '@/components/task-page-jira-search'
import { JIRA_ITEM_LIMIT, TASK_SEARCH_DEBOUNCE_MS } from './task-page-source-context'
import { defaultScopeSource } from '@/lib/default-creation-host'
export function useTaskPageJiraListEffects(model: TaskPageLinearCollectionEffectsModel) {
  const {
    settings,
    setTaskResumeState,
    searchJiraIssues,
    listJiraIssues,
    jiraConnected,
    selectedJiraSiteId,
    taskSource,
    jiraTaskSourceContext,
    jiraTaskSourceScopeKey,
    jiraSearchPersistReadyRef,
    taskResumeApplied,
    selectedJiraIssueKey,
    setSelectedJiraIssueKey,
    selectedJiraIssueFallback,
    setSelectedJiraIssueFallback,
    setJiraIssues,
    setJiraLoading,
    setJiraError,
    setJiraErrorDetailsOpen,
    setJiraJqlRejection,
    jiraSearchInput,
    appliedJiraSearch,
    setAppliedJiraSearch,
    activeJiraPreset,
    jiraCurrentSprint,
    jiraRefreshNonce,
    jiraActiveSavedFilterId,
    jiraSavedFilters,
    jiraSavedFiltersLoading,
    selectedJiraStatuses,
    jiraQuickFiltersLoading,
    setJiraStatusCatalog,
    setJiraProjectStatusOrder,
    displayedJiraIssues
  } = model
  useEffect(() => {
    if (!taskResumeApplied) {
      return
    }
    const timeout = window.setTimeout(() => {
      setAppliedJiraSearch(jiraSearchInput)
    }, TASK_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [jiraSearchInput, taskResumeApplied, setAppliedJiraSearch])
  useEffect(() => {
    if (!taskResumeApplied) {
      return
    }
    if (!jiraSearchPersistReadyRef.current) {
      jiraSearchPersistReadyRef.current = true
      return
    }
    setTaskResumeState({
      jiraQuery: appliedJiraSearch.trim()
    })
  }, [appliedJiraSearch, setTaskResumeState, taskResumeApplied, jiraSearchPersistReadyRef])
  const previousJiraRefreshNonceRef = useRef(jiraRefreshNonce)
  useEffect(() => {
    if (!taskResumeApplied) {
      return
    }
    if (taskSource !== 'jira') {
      return
    }
    if (!jiraConnected || jiraSavedFiltersLoading || jiraQuickFiltersLoading) {
      return
    }
    const force = previousJiraRefreshNonceRef.current !== jiraRefreshNonce
    previousJiraRefreshNonceRef.current = jiraRefreshNonce
    let cancelled = false
    let sprintQueryTooLong = false
    setJiraLoading(true)
    setJiraError(null)
    setJiraJqlRejection(null)
    setJiraErrorDetailsOpen(false)
    const trimmed = appliedJiraSearch.trim()
    const savedFilter = jiraSavedFilters.find((filter) => filter.id === jiraActiveSavedFilterId)
    const exactSavedJql = savedFilter?.jql === trimmed
    const request =
      trimmed.length > 0
        ? searchTaskPageJiraIssues(
            trimmed,
            async (jql) => {
              const query = jiraCurrentSprint ? withCurrentSprintClause(jql) : jql
              if (jiraCurrentSprint && !isRuntimeProviderSearchQueryWithinLimit(query)) {
                sprintQueryTooLong = true
                throw new Error('Query exceeds the request limit after sprint filtering.')
              }
              return searchJiraIssues(query, JIRA_ITEM_LIMIT, {
                sourceContext: jiraTaskSourceContext,
                force
              })
            },
            exactSavedJql ? 'jql' : 'input'
          )
        : listJiraIssues(activeJiraPreset, JIRA_ITEM_LIMIT, {
            sourceContext: jiraTaskSourceContext,
            force,
            ...(selectedJiraStatuses.length || jiraCurrentSprint
              ? {
                  filters: {
                    ...(selectedJiraStatuses.length ? { statuses: selectedJiraStatuses } : {}),
                    ...(jiraCurrentSprint ? { currentSprint: true } : {})
                  }
                }
              : {})
          }).then((issues) => ({ issues, jqlRejection: null }))
    void request
      .then(({ issues, jqlRejection }) => {
        if (cancelled) {
          return
        }
        if (!trimmed && selectedJiraStatuses.length === 0) {
          setJiraStatusCatalog({
            scopeKey: `${jiraTaskSourceScopeKey}::${selectedJiraSiteId}::${activeJiraPreset}`,
            items: buildJiraStatusCatalog(issues)
          })
        }
        setJiraIssues(issues)
        setJiraJqlRejection(jqlRejection)
        setJiraLoading(false)
        const projectScope = getSingleJiraProjectScope(issues)
        if (!projectScope) {
          return
        }
        const statusOrderScopeKey = getTaskPageJiraStatusOrderScopeKey(
          jiraTaskSourceScopeKey,
          projectScope
        )
        void loadTaskPageJiraProjectStatusOrder(
          jiraTaskSourceContext ?? defaultScopeSource(settings),
          jiraTaskSourceScopeKey,
          projectScope
        ).then((order) => {
          if (!cancelled) {
            setJiraProjectStatusOrder({
              order,
              scopeKey: statusOrderScopeKey
            })
          }
        })
      })
      .catch((err) => {
        if (cancelled) {
          return
        }
        const failureState = createTaskPageJiraLoadFailureState(err)
        setJiraIssues(failureState.issues)
        setJiraError(
          sprintQueryTooLong
            ? {
                title: translate(
                  'jira.board.queryTooLong',
                  'The Jira query is too long with Current sprint selected. Shorten the query or turn off Current sprint.'
                ),
                details: null
              }
            : failureState.error
        )
        setJiraLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    taskSource,
    jiraConnected,
    selectedJiraSiteId,
    appliedJiraSearch,
    activeJiraPreset,
    jiraCurrentSprint,
    jiraRefreshNonce,
    jiraActiveSavedFilterId,
    jiraSavedFilters,
    jiraSavedFiltersLoading,
    selectedJiraStatuses,
    jiraQuickFiltersLoading,
    taskResumeApplied,
    jiraTaskSourceContext,
    jiraTaskSourceScopeKey
  ])
  useEffect(() => {
    if (!taskResumeApplied || taskSource !== 'jira') {
      return
    }
    if (!jiraConnected || displayedJiraIssues.length === 0) {
      if (selectedJiraIssueKey !== null) {
        setSelectedJiraIssueKey(null)
      }
      if (selectedJiraIssueFallback !== null) {
        setSelectedJiraIssueFallback(null)
      }
      return
    }
    if (
      selectedJiraIssueKey &&
      !displayedJiraIssues.some((issue) => issue.key === selectedJiraIssueKey)
    ) {
      setSelectedJiraIssueKey(null)
      setSelectedJiraIssueFallback(null)
    }
  }, [
    displayedJiraIssues,
    jiraConnected,
    selectedJiraIssueFallback,
    selectedJiraIssueKey,
    taskResumeApplied,
    taskSource,
    setSelectedJiraIssueFallback,
    setSelectedJiraIssueKey
  ])

  // Why: Linear ids are strings (e.g. "ENG-123") but the provider-generic shape needs a numeric number, so the adapter uses 0 as placeholder.
  return model
}
export type TaskPageJiraListEffectsModel = ReturnType<typeof useTaskPageJiraListEffects>
