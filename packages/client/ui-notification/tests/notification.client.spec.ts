// @vitest-environment jsdom
/**
 * Notification plugin halves and the notification service: browser-half
 * registrations against the real SlotRegistry (fiber teardown proving
 * removal), the persisted service semantics, and the inert node entry.
 */
import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { NotificationService } from '../src/client/service.ts'
import { en, NS, zh } from '../src/client/locales.ts'

// The store persists to localStorage; clear it so tests start from an empty document.
beforeEach(() => { localStorage.clear() })

/** Slot ledger reader: entry ids currently registered in the sidebar foot. */
function footerEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('sidebar.footer.action')
    .map(entry => entry.options.id)
}

/** Boot the browser half over a real slot tree that declares the foot list. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('sessions', {})
  // The locale plugin binds a settings scope, which reads the connection handle
  // and the forwarded-event port.
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  ctx.locale.setLocale('zh')
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-notification browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions'])
  })

  it('registers the bell, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    expect(footerEntryIds(ctx)).toContain('notification-bell')
    await fiber.dispose()
    expect(footerEntryIds(ctx)).not.toContain('notification-bell')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    expect(translate('panel.title')).toBe(zh['panel.title'])
    ctx.locale.setLocale('en')
    expect(translate('panel.title')).toBe(en['panel.title'])

    // Withdrawn dictionaries leave the key unresolved rather than translated.
    await fiber.dispose()
    expect(translate('panel.title')).not.toBe(en['panel.title'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('NotificationService', () => {
  function fresh(): { ctx: Context; notification: NotificationService } {
    const ctx = new Context()
    const notification = new NotificationService(ctx)
    return { ctx, notification }
  }

  it('allocates unique ids and unread messages newest-first', () => {
    const { notification } = fresh()
    const first = notification.push({ type: 'automation', title: 'A', content: '1' })
    const second = notification.push({ type: 'system', title: 'B', content: '2' })
    expect(first).not.toBe(second)
    expect(notification.store.getSnapshot().messages.map(m => m.title)).toEqual(['B', 'A'])
    expect(notification.store.getSnapshot().messages.every(m => !m.read)).toBe(true)
  })

  it('marks one message read, all read, removes one, and clears', () => {
    const { notification } = fresh()
    const first = notification.push({ type: 'automation', title: 'A', content: '1' })
    const second = notification.push({ type: 'automation', title: 'B', content: '2' })

    notification.markRead(second)
    const afterRead = notification.store.getSnapshot().messages
    expect(afterRead.find(m => m.id === second)?.read).toBe(true)
    expect(afterRead.find(m => m.id === first)?.read).toBe(false)

    notification.markAllRead()
    expect(notification.store.getSnapshot().messages.every(m => m.read)).toBe(true)

    notification.remove(second)
    expect(notification.store.getSnapshot().messages.map(m => m.id)).toEqual([first])

    notification.clear()
    expect(notification.store.getSnapshot().messages).toEqual([])
  })

  it('no-ops on absent ids for markRead and remove', () => {
    const { notification } = fresh()
    notification.push({ type: 'system', title: 'A', content: '1' })
    expect(() => { notification.markRead('missing') }).not.toThrow()
    expect(() => { notification.remove('missing') }).not.toThrow()
    expect(notification.store.getSnapshot().messages).toHaveLength(1)
  })

  it('carries the taskId only when provided', () => {
    const { notification } = fresh()
    const withTask = notification.push({ type: 'automation', title: 'A', content: '1', taskId: 't-1' })
    const withoutTask = notification.push({ type: 'system', title: 'B', content: '2' })
    const messages = notification.store.getSnapshot().messages
    expect(messages.find(m => m.id === withTask)?.taskId).toBe('t-1')
    expect(messages.find(m => m.id === withoutTask)?.taskId).toBeUndefined()
  })

  it('notifies subscribers on push', () => {
    const { notification } = fresh()
    const listener = vi.fn()
    notification.store.subscribe(listener)
    notification.push({ type: 'system', title: 'A', content: '1' })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('ui-notification node half', () => {
  it('contributes no host behavior', () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(applyNode).not.toThrow()
  })
})
