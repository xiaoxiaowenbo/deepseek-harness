/**
 * AutomationService: user-defined scheduled tasks. Owns the persisted
 * task/execution store, runs a browser scheduler that sends each due
 * task's prompt into its bound session, and reports outcomes to the
 * notification center. Constructed in the client apply and handed to the
 * view through the slot inject face; the plugin effect owns its lifetime.
 */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { ISessions, SessionFace } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { NotificationService } from '@deepseek-ai/dsh-client-ui-notification/client'
import type {} from '@deepseek-ai/dsh-client-ui-notification/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { nextCronRun, parseCron } from './cron.ts'
import type { AutomationStore, AutomationTask, ExecutionRecord } from './store.ts'
import { createAutomationStore, MAX_EXECUTIONS_PER_TASK } from './store.ts'

/** Fields a caller supplies when creating a task; the service allocates the rest. */
export interface CreateTaskInput {
  name: string
  cron: string
  prompt: string
  /** Session bound to the task; the run resolves or creates one when absent. */
  sessionId?: SessionId
}

/** Fields a caller may patch on an existing task. */
export interface UpdateTaskInput {
  name?: string
  cron?: string
  prompt?: string
  enabled?: boolean
}

/**
 * Scheduler and task store for browser-side automation.
 *
 * The scheduler is deliberately browser-bound: it only runs while a web
 * session is open. Execution records and notifications are durable, so a
 * user reopening the app sees every past outcome.
 */
export class AutomationService {
  /** The persisted task and execution store (components subscribe; mutations go through the methods below). */
  readonly store: AutomationStore
  private readonly sessions: ISessions
  private readonly notification: NotificationService
  private timer: ReturnType<typeof setInterval> | undefined

  /**
   * @param ctx - owning root context (the plugin apply context; the plugin
   * effect owns the scheduler timer).
   */
  constructor(ctx: Context) {
    this.store = createAutomationStore()
    this.sessions = ctx.sessions
    this.notification = ctx.notification
  }

  /**
   * Create one task and schedule its first run.
   * @param input - task fields; an invalid cron expression throws.
   * @returns the created task.
   */
  createTask(input: CreateTaskInput): AutomationTask {
    parseCron(input.cron)
    const now = Date.now()
    const task: AutomationTask = {
      id: randomUUID(),
      name: input.name.trim(),
      cron: input.cron.trim(),
      prompt: input.prompt,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      nextRunAt: nextCronRun(input.cron.trim(), now),
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    }
    this.store.update(state => { state.tasks.push(task) })
    return task
  }

  /**
   * Patch one task. An invalid cron expression throws and leaves the task
   * untouched.
   * @param id - task id (absent ids no-op).
   * @param patch - fields to replace; `undefined` fields stay unchanged.
   */
  updateTask(id: string, patch: UpdateTaskInput): void {
    this.store.update(state => {
      const task = state.tasks.find(t => t.id === id)
      if (task === undefined) return
      const cron = patch.cron?.trim()
      if (cron !== undefined) parseCron(cron)
      if (patch.name !== undefined) task.name = patch.name.trim()
      if (cron !== undefined) task.cron = cron
      if (patch.prompt !== undefined) task.prompt = patch.prompt
      if (patch.enabled !== undefined) task.enabled = patch.enabled
      task.updatedAt = Date.now()
      task.nextRunAt = task.enabled ? nextCronRun(task.cron, Date.now()) : null
    })
  }

  /**
   * Remove one task and its execution records.
   * @param id - task id (absent ids no-op).
   */
  deleteTask(id: string): void {
    this.store.update(state => {
      state.tasks = state.tasks.filter(t => t.id !== id)
      state.executions = state.executions.filter(record => record.taskId !== id)
    })
  }

  /**
   * Enable or disable one task. Disabling clears its next run; enabling
   * reschedules from the current time.
   * @param id - task id.
   * @param enabled - desired state.
   */
  setEnabled(id: string, enabled: boolean): void {
    this.updateTask(id, { enabled })
  }

  /**
   * Start a scheduler timer. Idempotent; the plugin effect calls it on
   * apply and {@link dispose} on teardown.
   * @param intervalMs - tick cadence; defaults to 30s for prompt due runs.
   */
  start(intervalMs = 30_000): void {
    if (this.timer !== undefined) return
    this.timer = setInterval(() => { void this.tick() }, intervalMs)
  }

  /** Stop the scheduler timer. Safe when never started or already stopped. */
  dispose(): void {
    if (this.timer === undefined) return
    clearInterval(this.timer)
    this.timer = undefined
  }

  /**
   * Run every enabled, non-running task whose next run is due.
   * @param now - wall-clock ms used for the due check and rescheduling.
   */
  async tick(now = Date.now()): Promise<void> {
    const due: string[] = []
    this.store.update(state => {
      for (const task of state.tasks) {
        if (!task.enabled || task.running) continue
        if (task.nextRunAt === undefined || task.nextRunAt === null) {
          task.nextRunAt = nextCronRun(task.cron, now)
        } else if (task.nextRunAt <= now) {
          due.push(task.id)
        }
      }
    })
    await Promise.allSettled(due.map(id => this.runTask(id)))
  }

  /**
   * Run one task immediately, outside its schedule. Absent or already
   * running tasks no-op.
   * @param taskId - task id.
   * @returns completion of the run.
   */
  runNow(taskId: string): Promise<void> {
    return this.runTask(taskId)
  }

  /**
   * Execute one task: mark it running, resolve or create its session, send
   * the prompt as a queued turn, then record the outcome and push a
   * notification. Failures mark the record failed instead of throwing.
   * @param taskId - task id.
   */
  async runTask(taskId: string): Promise<void> {
    const task = this.store.getSnapshot().tasks.find(t => t.id === taskId)
    if (task === undefined || task.running) return
    const now = Date.now()
    const executionId = randomUUID()
    this.store.update(state => {
      const current = state.tasks.find(t => t.id === taskId)
      if (current !== undefined) {
        current.running = true
        current.lastRunAt = now
        current.nextRunAt = nextCronRun(current.cron, now)
      }
      state.executions.unshift({
        id: executionId,
        taskId,
        status: 'running',
        startedAt: now,
        message: '',
      })
      state.executions = pruneExecutions(state.executions)
    })

    let outcome: { status: 'success' | 'failed'; message: string; content: string }
    try {
      const session = await this.resolveSession(task)
      const result = await session.prompt([{ type: 'text', text: task.prompt }], 'queue')
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      outcome = { status: 'success', message: '', content: task.prompt.slice(0, 120) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      outcome = { status: 'failed', message, content: message }
    }

    this.store.update(state => {
      const current = state.tasks.find(t => t.id === taskId)
      if (current !== undefined) current.running = false
      const record = state.executions.find(entry => entry.id === executionId)
      if (record !== undefined) {
        record.status = outcome.status
        record.completedAt = Date.now()
        record.message = outcome.message
      }
    })
    this.notification.push({
      type: 'automation',
      title: task.name,
      content: outcome.content,
      taskId,
    })
  }

  /**
   * Resolve the session a task runs in: the bound session when still
   * addressable, otherwise a newly created session (persisted on the task
   * so later runs reuse it).
   * @param task - the task being run.
   * @returns the session face.
   */
  private async resolveSession(task: AutomationTask): Promise<SessionFace> {
    if (task.sessionId !== undefined) {
      const bound = this.sessions.binding(task.sessionId)
      if (bound !== undefined) return bound.session
    }
    const sessionId = await this.sessions.create()
    this.store.update(state => {
      const current = state.tasks.find(t => t.id === task.id)
      if (current !== undefined) current.sessionId = sessionId
    })
    const bound = this.sessions.binding(sessionId)
    if (bound === undefined) {
      throw new Error('automation: created session is not addressable')
    }
    return bound.session
  }
}

/** Keep the newest records per task within the bounded window. */
function pruneExecutions(records: ExecutionRecord[]): ExecutionRecord[] {
  const counts = new Map<string, number>()
  return records.filter(record => {
    const seen = (counts.get(record.taskId) ?? 0) + 1
    counts.set(record.taskId, seen)
    return seen <= MAX_EXECUTIONS_PER_TASK
  })
}
