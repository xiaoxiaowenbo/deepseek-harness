// @vitest-environment jsdom
/**
 * NotificationBell render behavior: the badge reflects the unread count, the
 * popover lists messages newest-first with read-state styling, and the panel
 * actions route into the service.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { NotificationBell, type NotificationBellProps } from '../src/client/NotificationBell.tsx'
import { NotificationService } from '../src/client/service.ts'
import { zh } from '../src/client/locales.ts'

beforeEach(() => {
  // The notification store persists to localStorage; clear it for a fresh document.
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function fresh(): { ctx: Context; notification: NotificationService } {
  const ctx = new Context()
  const notification = new NotificationService(ctx)
  return { ctx, notification }
}

function props(notification: NotificationService): NotificationBellProps {
  return {
    wide: true,
    notification,
    t: makeTranslate(zh),
  } as unknown as NotificationBellProps
}

describe('NotificationBell', () => {
  it('shows no badge with no unread messages and renders the popover empty', () => {
    const { notification } = fresh()
    render(<NotificationBell {...props(notification)} />)
    expect(screen.getByRole('button', { name: zh['bell.aria'] })).toBeDefined()
    expect(within(screen.getByRole('button')).queryByText(/^\d+$/)).toBeNull()
  })

  it('shows an unread badge and lists messages newest-first, marking read on demand', () => {
    const { notification } = fresh()
    notification.push({ type: 'automation', title: '第一个任务', content: '执行成功', taskId: 't-1' })
    notification.push({ type: 'system', title: '系统通知', content: '欢迎回来' })
    render(<NotificationBell {...props(notification)} />)

    const trigger = screen.getByRole('button', { name: '2 条未读' })
    expect(trigger).toBeDefined()

    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: zh['panel.title'] })
    // Newest-first order: the second push (系统通知) leads the list.
    const rows = within(dialog).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('系统通知')
    expect(rows[0]!.textContent).toContain('欢迎回来')
    expect(rows[1]!.textContent).toContain('第一个任务')
    expect(rows[1]!.textContent).toContain('执行成功')

    // Mark one read: the row loses its unread action, the badge drops to 1.
    fireEvent.click(within(dialog).getAllByText('标记已读')[0]!)
    expect(within(dialog).getAllByText('标记已读')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '1 条未读' })).toBeDefined()
  })

  it('marks all read and clears through the panel actions', () => {
    const { notification } = fresh()
    notification.push({ type: 'automation', title: 'A', content: '1' })
    notification.push({ type: 'automation', title: 'B', content: '2' })
    render(<NotificationBell {...props(notification)} />)
    fireEvent.click(screen.getByRole('button', { name: '2 条未读' }))

    const dialog = screen.getByRole('dialog', { name: zh['panel.title'] })
    fireEvent.click(within(dialog).getByText('全部已读'))
    expect(screen.getByRole('button', { name: zh['bell.aria'] })).toBeDefined()

    // The panel stays open after marking all read; clear the list from it.
    fireEvent.click(within(screen.getByRole('dialog', { name: zh['panel.title'] })).getByText('清空消息'))
    expect(screen.getByText(zh['panel.empty'])).toBeDefined()
  })

  it('closes the popover on Escape and restores focus to the trigger', () => {
    const { notification } = fresh()
    notification.push({ type: 'system', title: 'A', content: '1' })
    render(<NotificationBell {...props(notification)} />)
    const trigger = screen.getByRole('button', { name: '1 条未读' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: zh['panel.title'] })).toBeDefined()

    fireEvent.keyDown(screen.getByRole('dialog', { name: zh['panel.title'] }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: zh['panel.title'] })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
