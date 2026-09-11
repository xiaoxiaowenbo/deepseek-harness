/**
 * Notification plugin, browser half: owns the persisted message store and
 * renders the sidebar-foot bell. Any plugin (currently the automation
 * scheduler) pushes through `ctx.notification`; the bell reads the same
 * store. The service is constructed here and provided to consumers through
 * the slot inject face, so it follows this plugin's fiber.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and the
// session standard props (scope of the sidebar slot is root, none needed).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the sidebar SlotMap row ('sidebar.footer.action') into
// the program so PropsRuntime resolves.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { NotificationBell } from './NotificationBell.tsx'
import { en, NS, zh, type NotificationKey } from './locales.ts'
import { NotificationService } from './service.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Notification-center copy. */
    'notification': NotificationKey
  }
}

export { NotificationBell } from './NotificationBell.tsx'
export { NotificationService } from './service.ts'
export type { NotificationBellProps } from './NotificationBell.tsx'
export type { NotificationInput } from './service.ts'
export type { NotificationMessage, NotificationStore, NotificationType } from './store.ts'

/** Required services: slot registration, locale dictionaries, the layout/session kit. */
export const inject = ['slots', 'locale', 'sessions']

/**
 * Client plugin body: provide the notification service, register the
 * dictionaries, and hang the bell beside Settings at the sidebar foot.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const notification = new NotificationService(ctx)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-notification: dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'notification-bell',
    order: 10,
    locale: NS,
    inject: () => ({ notification }),
  }, NotificationBell))
}
