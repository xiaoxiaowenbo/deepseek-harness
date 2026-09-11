/**
 * AutomationPage: the `conversation.view` occupant. A management page for
 * user-defined scheduled tasks — a task-card grid, a create/edit modal with
 * cron presets, and an execution-history modal. All data comes from the
 * AutomationService's persisted store; mutations go through the service.
 */
import { useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useSyncExternalStore } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NotificationService } from '@deepseek-ai/dsh-client-ui-notification/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { nextCronRun, parseCron } from './cron.ts'
import { CRON_PRESETS, NS } from './locales.ts'
import type { AutomationService } from './service.ts'
import type { AutomationTask, ExecutionRecord } from './store.ts'
import css from './AutomationPage.module.css'

/** Values the slot inject face hands this view. */
export interface AutomationViewInjected {
  /** Task and scheduler service (the instance the plugin owns). */
  automation: AutomationService
  /** Notification service the automation outcomes feed. */
  notification: NotificationService
  /** Session the view is bound to; the default target for new tasks. */
  sessionId: SessionId
}

/** Full props for the automation conversation view. */
export type AutomationViewProps = ConvViewProps
  & InjectFace<AutomationViewInjected>
  & PropsLocale<typeof NS>

/** Dictionary key domain of the automation namespace (zh is the source of truth). */
type AutomationT = (key: keyof typeof import('./locales.ts').zh, params?: Record<string, string>) => string

/** Format an epoch-ms stamp as a locale wall-clock label. */
function formatTime(value: number | null | undefined): string {
  if (value == null) return '--'
  return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

/** One card in the task grid: name, status, prompt preview, and actions. */
function TaskCard({
  task,
  automation,
  t,
  onEdit,
  onHistory,
}: {
  task: AutomationTask
  automation: AutomationService
  t: AutomationT
  onEdit: (task: AutomationTask) => void
  onHistory: (task: AutomationTask) => void
}) {
  const toggleEnabled = (): void => { automation.setEnabled(task.id, !task.enabled) }
  const confirmDelete = (): void => {
    if (window.confirm(t('task.confirmDelete'))) automation.deleteTask(task.id)
  }
  return (
    <div className={css.card} data-testid={`task-${task.id}`}>
      <div className={css.cardHeader}>
        <span className={css.cardName} title={task.name}>{task.name}</span>
        {task.running
          ? <span className={`${css.badge} ${css.badgeRunning}`}>{t('status.running')}</span>
          : <span className={`${css.badge} ${task.enabled ? css.badgeIdle : css.badgeDisabled}`}>
            {task.enabled ? t('status.idle') : t('task.disabled')}
          </span>}
      </div>
      <div className={css.cardPrompt} title={task.prompt}>{task.prompt}</div>
      <div className={css.cardMeta}>
        <span>{t('task.lastRun')}：{formatTime(task.lastRunAt)}</span>
        <span>{t('task.nextRun')}：{task.enabled ? formatTime(task.nextRunAt) : '--'}</span>
      </div>
      <div className={`${css.cardMeta} ${css.cardCron}`}><span>{task.cron}</span></div>
      <div className={css.cardActions}>
        <button type="button" className={css.cardAction} disabled={task.running} onClick={() => { void automation.runNow(task.id) }}>
          {task.running ? t('task.running') : t('task.runNow')}
        </button>
        <button type="button" className={css.cardAction} onClick={() => { onEdit(task) }}>{t('task.edit')}</button>
        <button type="button" className={css.cardAction} onClick={() => { onHistory(task) }}>{t('task.history')}</button>
        <button type="button" className={css.cardAction} onClick={toggleEnabled}>
          {task.enabled ? t('task.disabled') : t('task.enabled')}
        </button>
        <button type="button" className={`${css.cardAction} ${css.danger}`} onClick={confirmDelete}>
          {t('task.delete')}
        </button>
      </div>
    </div>
  )
}

/** Create/edit modal: name, prompt, cron presets plus a custom expression. */
function TaskFormModal({
  initial,
  t,
  onSave,
  onCancel,
}: {
  initial: AutomationTask | undefined
  t: AutomationT
  onSave: (fields: { name: string; cron: string; prompt: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')
  const [cron, setCron] = useState(initial?.cron ?? CRON_PRESETS[3]!.cron)
  const cronValid = useMemo(() => {
    try { parseCron(cron); return true } catch { return false }
  }, [cron])
  const nextRun = useMemo(() => {
    if (!cronValid) return undefined
    return nextCronRun(cron, Date.now())
  }, [cron, cronValid])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedPrompt = prompt.trim()
    if (trimmedName === '' || trimmedPrompt === '' || !cronValid) return
    onSave({ name: trimmedName, cron: cron.trim(), prompt: trimmedPrompt })
  }

  return createPortal((
    <div className={css.overlay} role="dialog" aria-modal="true" onClick={onCancel}>
      <form className={css.modal} onClick={event => { event.stopPropagation() }} onSubmit={submit}>
        <div className={css.modalHeader}>
          <h3 className={css.modalTitle}>{initial === undefined ? t('task.add') : t('task.edit')}</h3>
          <button type="button" className={css.modalClose} aria-label="close" onClick={onCancel}>×</button>
        </div>
        <div className={css.modalBody}>
          <label className={css.field}>
            <span className={css.fieldLabel}>{t('task.name')}</span>
            <input
              className={css.input}
              value={name}
              placeholder={t('task.namePlaceholder')}
              onChange={event => { setName(event.target.value) }}
            />
          </label>
          <label className={css.field}>
            <span className={css.fieldLabel}>{t('task.prompt')}</span>
            <textarea
              className={`${css.input} ${css.textarea}`}
              value={prompt}
              placeholder={t('task.promptPlaceholder')}
              onChange={event => { setPrompt(event.target.value) }}
            />
          </label>
          <div className={css.field}>
            <span className={css.fieldLabel}>{t('task.schedule')}</span>
            <div className={css.presets}>
              {CRON_PRESETS.map(preset => (
                <button
                  key={preset.cron}
                  type="button"
                  className={`${css.preset} ${cron === preset.cron ? css.presetActive : ''}`}
                  onClick={() => { setCron(preset.cron) }}
                >
                  {t(preset.key)}
                </button>
              ))}
            </div>
            <input
              className={`${css.input} ${cronValid ? '' : css.inputError}`}
              value={cron}
              placeholder={t('task.cronPlaceholder')}
              onChange={event => { setCron(event.target.value) }}
            />
            <div className={css.hint}>
              {cronValid && nextRun !== null
                ? `${t('task.nextRun')}：${formatTime(nextRun)}`
                : t('task.cronInvalid')}
            </div>
          </div>
        </div>
        <div className={css.modalFooter}>
          <button type="button" className={css.button} onClick={onCancel}>{t('task.cancel')}</button>
          <button
            type="submit"
            className={`${css.button} ${css.buttonPrimary}`}
            disabled={name.trim() === '' || prompt.trim() === '' || !cronValid}
          >
            {initial === undefined ? t('task.save') : t('task.update')}
          </button>
        </div>
      </form>
    </div>
  ), document.body)
}

/** Execution-history modal: the bounded record list for one task. */
function HistoryModal({
  task,
  executions,
  t,
  onClose,
}: {
  task: AutomationTask
  executions: readonly ExecutionRecord[]
  t: AutomationT
  onClose: () => void
}) {
  return createPortal((
    <div className={css.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={css.modal} onClick={event => { event.stopPropagation() }}>
        <div className={css.modalHeader}>
          <h3 className={css.modalTitle}>{t('task.historyTitle', { name: task.name })}</h3>
          <button type="button" className={css.modalClose} aria-label="close" onClick={onClose}>×</button>
        </div>
        <div className={css.modalBody}>
          {executions.length === 0
            ? <div className={css.emptyText}>{t('task.historyEmpty')}</div>
            : (
              <ul className={css.historyList}>
                {executions.map(record => (
                  <li key={record.id} className={css.historyRow}>
                    <span className={css.historyTime}>{formatTime(record.startedAt)}</span>
                    <span className={`${css.historyStatus} ${record.status === 'running'
                      ? css.historyRunning
                      : record.status === 'success' ? css.historySuccess : css.historyFailed}`}
                    >
                      {record.status === 'running'
                        ? t('status.running')
                        : record.status === 'success'
                          ? t('run.success')
                          : t('run.failed', { message: record.message })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </div>
        <div className={css.modalFooter}>
          <button type="button" className={css.button} onClick={onClose}>{t('task.historyClose')}</button>
        </div>
      </div>
    </div>
  ), document.body)
}

/** The automation conversation view. */
export function AutomationPage({ automation, sessionId, t }: AutomationViewProps) {
  const state = useSyncExternalStore(
    automation.store.subscribe,
    automation.store.getSnapshot,
    automation.store.getSnapshot,
  )
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AutomationTask | undefined>(undefined)
  const [historyTask, setHistoryTask] = useState<AutomationTask | undefined>(undefined)

  const closeEditor = (): void => { setCreating(false); setEditing(undefined) }
  const saveTask = (fields: { name: string; cron: string; prompt: string }): void => {
    if (editing !== undefined) {
      automation.updateTask(editing.id, fields)
    } else {
      automation.createTask({ ...fields, sessionId })
    }
    closeEditor()
  }

  const historyExecutions = historyTask === undefined
    ? []
    : state.executions.filter(record => record.taskId === historyTask.id)

  return (
    <div className={css.page}>
      <div className={css.topBar}>
        <div>
          <h2 className={css.title}>{t('page.title')}</h2>
          <p className={css.subtitle}>{t('page.subtitle')}</p>
        </div>
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={() => { setCreating(true) }}>
          {t('task.add')}
        </button>
      </div>

      {state.tasks.length === 0 && !creating
        ? (
          <div className={css.empty}>
            <div className={css.emptyIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15.5 13.5" />
              </svg>
            </div>
            <h3 className={css.emptyTitle}>{t('empty.title')}</h3>
            <p className={css.emptyBody}>{t('empty.body')}</p>
          </div>
        )
        : (
          <div className={css.grid}>
            {state.tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                automation={automation}
                t={t}
                onEdit={setEditing}
                onHistory={setHistoryTask}
              />
            ))}
          </div>
        )}

      {(creating || editing !== undefined) && (
        <TaskFormModal
          initial={editing}
          t={t}
          onSave={saveTask}
          onCancel={closeEditor}
        />
      )}

      {historyTask !== undefined && (
        <HistoryModal
          task={historyTask}
          executions={historyExecutions}
          t={t}
          onClose={() => { setHistoryTask(undefined) }}
        />
      )}
    </div>
  )
}
