/**
 * Automation task and execution-record model, plus the persisted state
 * factory. State is a single localStorage-backed document; the service
 * owns every mutation and components only read it.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Lifecycle status shown on a task card. */
export type AutomationTaskStatus = 'idle' | 'running'

/** One user-defined scheduled task. */
export interface AutomationTask {
  /** Stable opaque id (service-allocated). */
  id: string
  /** Display name shown on the task card. */
  name: string
  /** Five-field cron expression driving the schedule. */
  cron: string
  /** Prompt text sent to the bound session on every run. */
  prompt: string
  /** Whether the scheduler considers this task. */
  enabled: boolean
  /** Session receiving each run; resolved lazily when unset. */
  sessionId?: SessionId
  /** Epoch ms of creation. */
  createdAt: number
  /** Epoch ms of the last field change. */
  updatedAt: number
  /** Epoch ms when the last run started. */
  lastRunAt?: number
  /** Epoch ms of the next scheduled run; null/absent while the task cannot run. */
  nextRunAt?: number | null
  /** Whether a run is currently in flight (drives the card spinner). */
  running?: boolean
}

/** One task execution record, newest first. */
export interface ExecutionRecord {
  /** Stable opaque id (service-allocated). */
  id: string
  /** Owning task id. */
  taskId: string
  status: 'running' | 'success' | 'failed'
  /** Epoch ms when the run started. */
  startedAt: number
  /** Epoch ms when the run settled. */
  completedAt?: number
  /** Short human-readable outcome shown in the history panel. */
  message: string
}

/** The automation store document. */
export interface AutomationState {
  tasks: AutomationTask[]
  executions: ExecutionRecord[]
}

/** Persistence key backing the automation store document. */
export const AUTOMATION_STORE_KEY = 'dsh.automation.tasks'

/** Live store handle the service owns and the view reads. */
export type AutomationStore = SnapshotStore<AutomationState>

/** Newest-first execution records are bounded to this many per task. */
export const MAX_EXECUTIONS_PER_TASK = 50

/**
 * Create the automation store with whole-document localStorage
 * persistence. Storage failures only disable persistence, never the store.
 * @returns a ready store.
 */
export function createAutomationStore(): AutomationStore {
  return createSnapshotStore<AutomationState>(
    { tasks: [], executions: [] },
    { persist: { name: AUTOMATION_STORE_KEY } },
  )
}
