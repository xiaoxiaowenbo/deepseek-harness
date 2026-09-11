// @vitest-environment jsdom
/**
 * Automation plugin halves, the scheduler service, and the cron engine:
 * browser-half view registration against the real SlotRegistry, persisted
 * task/execution semantics with notification handoff, and the parse /
 * next-run invariants.
 */
import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import {
  apply as applyNotification,
  inject as notificationInject,
} from '@deepseek-ai/dsh-client-ui-notification/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { nextCronRun, parseCron } from '../src/client/cron.ts'
import { AutomationService } from '../src/client/service.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { MAX_EXECUTIONS_PER_TASK } from '../src/client/store.ts'
import { NotificationService } from '@deepseek-ai/dsh-client-ui-notification/client'

// Task and execution stores persist to localStorage; clear it between tests.
beforeEach(() => { localStorage.clear() })

/** View-roster reader: entry ids currently registered in the conversation view slot. */
function viewEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots.entries('conversation.view').map(entry => entry.options.id)
}

/** Minimal sessions fake supporting binding/create only (the service's whole surface). */
function stubSessions(): {
  binding: (id: string) => { session: { prompt: ReturnType<typeof vi.fn> } } | undefined
  create: () => Promise<string>
} {
  let seq = 0
  const sessions = new Map<string, { prompt: ReturnType<typeof vi.fn> }>()
  return {
    binding: id => {
      const session = sessions.get(id)
      return session === undefined ? undefined : { session }
    },
    create: async () => {
      const id = `session-${++seq}`
      sessions.set(id, { prompt: vi.fn(async () => ({ ok: true })) })
      return id
    },
  }
}

/** Boot the browser half over a real slot tree declaring both used slots. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.view': { kind: 'list', scope: 'session' },
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('sessions', stubSessions())
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  await ctx.plugin({ inject: notificationInject, apply: applyNotification }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

/** Fresh services over a fake sessions surface for scheduler semantics. */
function fresh(): {
  ctx: Context
  notification: NotificationService
  automation: AutomationService
  sessions: ReturnType<typeof stubSessions>
} {
  const ctx = new Context()
  const notification = new NotificationService(ctx)
  const sessions = stubSessions()
  const automation = new AutomationService({ sessions, notification } as unknown as Context)
  return { ctx, notification, automation, sessions }
}

describe('cron engine', () => {
  it('parses wildcards, ranges, steps, and normalizes Sunday 7 to 0', () => {
    const schedule = parseCron('*/5 9-18 1,15 * 7')
    expect(schedule.minutes).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
    expect(schedule.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
    expect(schedule.daysOfMonth).toEqual([1, 15])
    expect(schedule.months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(schedule.daysOfWeek).toEqual([0])
  })

  it('rejects wrong field counts and out-of-range values', () => {
    expect(() => parseCron('* * * *')).toThrow(/5 fields/)
    expect(() => parseCron('60 * * * *')).toThrow(/out of \[0, 59\]/)
    expect(() => parseCron('* 24 * * *')).toThrow(/out of \[0, 23\]/)
  })

  it('computes the next multiple-of-five minute strictly after the reference', () => {
    const after = new Date(2026, 8, 9, 10, 2, 0).getTime()
    const next = nextCronRun('*/5 * * * *', after)
    expect(next).toBe(new Date(2026, 8, 9, 10, 5, 0).getTime())
  })

  it('rolls a daily run to the next day once today passed', () => {
    const after = new Date(2026, 8, 9, 10, 2, 0).getTime()
    const next = nextCronRun('0 8 * * *', after)
    expect(next).toBe(new Date(2026, 8, 10, 8, 0, 0).getTime())
  })

  it('matches a weekly weekday rule (2026-09-09 is a Wednesday)', () => {
    const after = new Date(2026, 8, 9, 10, 2, 0).getTime()
    const next = nextCronRun('0 9 * * 1', after)
    expect(next).toBe(new Date(2026, 8, 14, 9, 0, 0).getTime())
  })
})

describe('AutomationService', () => {
  it('creates a task with a scheduled first run and rejects an invalid cron', () => {
    const { automation } = fresh()
    const task = automation.createTask({ name: '日报', cron: '0 8 * * *', prompt: '生成日报' })
    expect(automation.store.getSnapshot().tasks).toHaveLength(1)
    expect(task.enabled).toBe(true)
    expect(task.nextRunAt).toBeGreaterThan(Date.now() - 1)
    expect(() => automation.createTask({ name: '坏', cron: 'a b c', prompt: 'x' })).toThrow(/5 fields/)
  })

  it('patches a task and revalidates the cron without partial writes', () => {
    const { automation } = fresh()
    const task = automation.createTask({ name: 'A', cron: '*/5 * * * *', prompt: 'p' })
    const nextRun = task.nextRunAt
    automation.updateTask(task.id, { name: 'B', prompt: 'q', cron: '0 9 * * 1' })
    const patched = automation.store.getSnapshot().tasks[0]!
    expect(patched.name).toBe('B')
    expect(patched.prompt).toBe('q')
    expect(patched.cron).toBe('0 9 * * 1')
    expect(patched.nextRunAt).not.toBe(nextRun)
    expect(() => automation.updateTask(task.id, { cron: 'nope' })).toThrow()
    expect(automation.store.getSnapshot().tasks[0]!.cron).toBe('0 9 * * 1')
  })

  it('disabling clears the next run and enabling reschedules', () => {
    const { automation } = fresh()
    const task = automation.createTask({ name: 'A', cron: '0 8 * * *', prompt: 'p' })
    automation.setEnabled(task.id, false)
    expect(automation.store.getSnapshot().tasks[0]!.nextRunAt).toBeNull()
    automation.setEnabled(task.id, true)
    expect(automation.store.getSnapshot().tasks[0]!.nextRunAt).toBeDefined()
  })

  it('deleteTask removes the task and its execution records', async () => {
    const { automation } = fresh()
    const task = automation.createTask({ name: 'A', cron: '0 8 * * *', prompt: 'p' })
    await automation.runNow(task.id)
    expect(automation.store.getSnapshot().executions).toHaveLength(1)
    automation.deleteTask(task.id)
    expect(automation.store.getSnapshot().tasks).toHaveLength(0)
    expect(automation.store.getSnapshot().executions).toHaveLength(0)
  })

  it('records success and pushes an automation notification with the taskId', async () => {
    const { automation, notification } = fresh()
    const task = automation.createTask({ name: 'A', cron: '0 8 * * *', prompt: 'p' })
    await automation.runNow(task.id)
    const records = automation.store.getSnapshot().executions
    expect(records).toHaveLength(1)
    expect(records[0]!.status).toBe('success')
    expect(records[0]!.completedAt).toBeDefined()
    const messages = notification.store.getSnapshot().messages
    expect(messages[0]!.type).toBe('automation')
    expect(messages[0]!.title).toBe('A')
    expect(messages[0]!.taskId).toBe(task.id)
    expect(automation.store.getSnapshot().tasks[0]!.running).toBe(false)
    expect(automation.store.getSnapshot().tasks[0]!.lastRunAt).toBeDefined()
  })

  it('records a failure with the error message instead of throwing', async () => {
    const { automation, notification, sessions } = fresh()
    const task = automation.createTask({ name: 'A', cron: '0 8 * * *', prompt: 'p' })
    await automation.runNow(task.id)
    const bound = sessions.binding(automation.store.getSnapshot().tasks[0]!.sessionId!)!
    bound.session.prompt.mockRejectedValueOnce(new Error('boom'))
    await automation.runNow(task.id)
    const records = automation.store.getSnapshot().executions
    expect(records).toHaveLength(2)
    expect(records[0]!.status).toBe('failed')
    expect(records[0]!.message).toContain('boom')
    expect(notification.store.getSnapshot().messages[0]!.content).toContain('boom')
  })

  it('creates and persists a session when the task has none bound', async () => {
    const { automation, sessions } = fresh()
    const task = automation.createTask({ name: 'A', cron: '0 8 * * *', prompt: 'p' })
    expect(task.sessionId).toBeUndefined()
    await automation.runNow(task.id)
    expect(automation.store.getSnapshot().tasks[0]!.sessionId).toBeDefined()
    expect(sessions.binding(automation.store.getSnapshot().tasks[0]!.sessionId!)).toBeDefined()
  })

  it('no-ops for absent and already-running tasks', async () => {
    const { automation } = fresh()
    const task = automation.createTask({ name: 'A', cron: '0 8 * * *', prompt: 'p' })
    // Mark the task running through the store (snapshots are frozen in dev).
    automation.store.update(state => { state.tasks[0]!.running = true })
    await automation.runNow(task.id)
    expect(automation.store.getSnapshot().executions).toHaveLength(0)
    await automation.runNow('missing')
    expect(automation.store.getSnapshot().executions).toHaveLength(0)
  })

  it('tick runs only due enabled tasks and reschedules them', async () => {
    const { automation } = fresh()
    const due = automation.createTask({ name: 'due', cron: '*/5 * * * *', prompt: 'p' })
    const far = automation.createTask({ name: 'far', cron: '0 0 1 1 *', prompt: 'p' })
    // Force the due task's next run into the past.
    automation.store.update(state => {
      const task = state.tasks.find(t => t.id === due.id)
      if (task !== undefined) task.nextRunAt = Date.now() - 60_000
    })
    await automation.tick()
    const executions = automation.store.getSnapshot().executions
    expect(executions).toHaveLength(1)
    expect(executions[0]!.taskId).toBe(due.id)
    const after = automation.store.getSnapshot().tasks.find(t => t.id === due.id)!
    expect(after.nextRunAt).toBeGreaterThan(Date.now() - 1)
    expect(automation.store.getSnapshot().tasks.find(t => t.id === far.id)!.nextRunAt).toBeDefined()
  })

  it('bounds execution records per task at the store maximum', async () => {
    const { automation } = fresh()
    const task = automation.createTask({ name: 'A', cron: '0 8 * * *', prompt: 'p' })
    for (let index = 0; index < MAX_EXECUTIONS_PER_TASK + 5; index++) {
      await automation.runNow(task.id)
    }
    const records = automation.store.getSnapshot().executions.filter(r => r.taskId === task.id)
    expect(records).toHaveLength(MAX_EXECUTIONS_PER_TASK)
  })

  it('start is idempotent and dispose clears the timer', () => {
    vi.useFakeTimers()
    try {
      const { automation } = fresh()
      automation.start()
      automation.start()
      expect(vi.getTimerCount()).toBe(1)
      automation.dispose()
      expect(vi.getTimerCount()).toBe(0)
      automation.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ui-automation browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'notification'])
  })

  it('registers the automation view, and fiber teardown removes it', async () => {
    const { ctx, fiber } = await bench()
    expect(viewEntryIds(ctx)).toContain('automation')
    await fiber.dispose()
    expect(viewEntryIds(ctx)).not.toContain('automation')
  })

  it('registers both dictionaries under its own namespace and keeps en key-identical', async () => {
    const { ctx } = await bench()
    const translate = ctx.locale.bind(NS)
    expect(translate('view.label')).toBe(zh['view.label'])
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('ui-automation node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})
