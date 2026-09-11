/**
 * NotificationBell: the `sidebar.footer.action` occupant. A bell trigger
 * (icon + unread badge) beside Settings that opens a message-list popover.
 * All state comes from the NotificationService's persisted store.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useSyncExternalStore } from 'react'
import { useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the sidebar SlotMap row ('sidebar.footer.action') into the program.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { NS } from './locales.ts'
import type { NotificationService } from './service.ts'
import css from './NotificationBell.module.css'

/** Full props for the sidebar-foot notification bell. */
export type NotificationBellProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof NS>
  & InjectFace<{ notification: NotificationService }>

const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

/** Inline bell glyph (no dedicated icon exists in ui-primitives). */
function BellIcon({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

/** Absolute wall-clock label for a message row (browser locale + time zone). */
function formatMessageTime(createdAt: number): string {
  return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(createdAt)
}

/** The sidebar-foot bell: trigger plus the portaled message list popover. */
export function NotificationBell({ notification, t, wide }: NotificationBellProps) {
  const state = useSyncExternalStore(
    notification.store.subscribe,
    notification.store.getSnapshot,
    notification.store.getSnapshot,
  )
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelPosition = useAnchoredPosition({
    open,
    anchorRef: triggerRef,
    panelRef,
    side: 'top',
    gap: 6,
    margin: 16,
  })
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)

  const messages = state.messages
  const unread = messages.filter(message => !message.read).length
  const unreadLabel = t('bell.unread', { count: unread })
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    setOpen(false)
    triggerRef.current?.focus()
  }

  const panel = open
    ? createPortal((
      <div
        ref={panelRef}
        className={css.panel}
        style={panelPosition ?? MEASURE_STYLE}
        role="dialog"
        aria-label={t('panel.title')}
      >
        <div className={css.panelHeader}>
          <span className={css.panelTitle}>{t('panel.title')}</span>
          {messages.length > 0 && (
            <div className={css.panelActions}>
              <button type="button" className={css.panelAction} onClick={() => { notification.markAllRead() }}>
                {t('panel.markAllRead')}
              </button>
              <button type="button" className={css.panelAction} onClick={() => { notification.clear() }}>
                {t('panel.clear')}
              </button>
            </div>
          )}
        </div>
        {messages.length === 0
          ? <div className={css.empty}>{t('panel.empty')}</div>
          : (
            <ul className={css.list}>
              {messages.map(message => (
                <li
                  key={message.id}
                  className={message.read ? css.row : `${css.row} ${css.rowUnread}`}
                >
                  {!message.read && <span className={css.unreadDot} aria-hidden="true" />}
                  <div className={css.rowBody}>
                    <div className={css.rowTitleRow}>
                      <span className={css.rowTitle}>{message.title}</span>
                      <span className={css.rowTime}>{formatMessageTime(message.createdAt)}</span>
                    </div>
                    <div className={css.rowContent}>{message.content}</div>
                    <div className={css.rowMeta}>
                      <span className={css.rowType}>{t(`type.${message.type}`)}</span>
                      {!message.read && (
                        <button
                          type="button"
                          className={css.rowAction}
                          onClick={() => { notification.markRead(message.id) }}
                        >
                          {t('panel.markRead')}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>
    ), document.body)
    : null

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={wide ? css.trigger : `${css.trigger} ${css.triggerRail}`}
        aria-expanded={open}
        aria-label={unread > 0 ? unreadLabel : t('bell.aria')}
        onClick={() => { setOpen(current => !current) }}
      >
        <span className={css.bell}><BellIcon size={wide ? 16 : 18} /></span>
        {unread > 0 && <span className={css.badge}>{unread}</span>}
      </button>
      {panel}
    </div>
  )
}
