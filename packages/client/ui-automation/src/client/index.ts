/**
 * Automation plugin, browser half: owns the task scheduler service and
 * registers the automation conversation view. The scheduler pushes every
 * execution outcome into the notification center, so the bell reflects
 * automation activity without any further wiring.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale), the
// conversation view SlotMap row, and the session standard props.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { AutomationPage, type AutomationViewInjected } from './AutomationPage.tsx'
import { en, NS, zh, type AutomationKey } from './locales.ts'
import { AutomationService } from './service.ts'
import type { NotificationService } from '@deepseek-ai/dsh-client-ui-notification/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Automation view and task-form copy. */
    'automation': AutomationKey
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Notification center the automation scheduler reports into. */
    notification: NotificationService
  }
}

export type { AutomationTask, ExecutionRecord } from './store.ts'
export type { AutomationService } from './service.ts'
export type { AutomationViewInjected } from './AutomationPage.tsx'

/** Required services: slot registration, locale dictionaries, sessions, and the notification center. */
export const inject = ['slots', 'locale', 'sessions', 'notification']

/**
 * Client plugin body: create the automation service, register the
 * dictionaries, hang the automation view tab beside Chat, and start the
 * scheduler for the plugin fiber's lifetime.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const automation = new AutomationService(ctx)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-automation: dictionaries')
  ctx.effect(() => {
    automation.start()
    return () => { automation.dispose() }
  }, 'ui-automation: scheduler')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'automation',
    order: 30,
    locale: NS,
    label: () => t('view.label'),
    inject: (sessionId: SessionId): AutomationViewInjected => ({
      automation,
      notification: ctx.notification,
      sessionId,
    }),
  }, AutomationPage))
}
