/**
 * Notification message model and state factory. State is a plain
 * persisted document (messages in reverse-chronological order); the store
 * itself is created by the service, and components only read it.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Message source discriminator used for the list type tag. */
export type NotificationType = 'automation' | 'system'

/** One persisted notification message. */
export interface NotificationMessage {
  /** Stable opaque id (service-allocated). */
  id: string
  type: NotificationType
  /** Short headline, e.g. the owning task name for automation results. */
  title: string
  /** Human-readable body shown in the message list. */
  content: string
  read: boolean
  /** Epoch ms of creation; newest messages sort first. */
  createdAt: number
  /** Owning automation task, when the message reports a task execution. */
  taskId?: string
}

/** The notification store document. */
export interface NotificationState {
  messages: NotificationMessage[]
}

/** Persistence key backing the notification store document. */
export const NOTIFICATION_STORE_KEY = 'dsh.notification.messages'

/** Live store handle the service owns and the bell reads. */
export type NotificationStore = SnapshotStore<NotificationState>

/**
 * Create the notification store with whole-document localStorage
 * persistence. Storage failures only disable persistence, never the store.
 * @returns a ready store.
 */
export function createNotificationStore(): NotificationStore {
  return createSnapshotStore<NotificationState>(
    { messages: [] },
    { persist: { name: NOTIFICATION_STORE_KEY } },
  )
}
