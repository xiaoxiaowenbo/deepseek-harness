/**
 * NotificationService: the cross-plugin notification face. Any plugin
 * (currently the automation scheduler) can push a message; the bell renders
 * the same persisted store. Registered as `ctx.notification` through the
 * Service base class.
 */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { NotificationStore } from './store.ts'
import { createNotificationStore } from './store.ts'
import type { NotificationMessage, NotificationType } from './store.ts'

/** Input accepted by {@link NotificationService.push}. */
export interface NotificationInput {
  type: NotificationType
  title: string
  content: string
  /** Owning automation task, when the message reports a task execution. */
  taskId?: string
}

/** The outward `ctx.notification` face (concrete class; consumers type against this export). */
export class NotificationService extends Service {
  /** The persisted message store (components subscribe; mutations go through the methods below). */
  readonly store: NotificationStore
  private seq = 0

  /**
   * @param ctx - owning root context (the plugin apply context; the service
   * registers itself and follows that fiber's lifetime).
   */
  constructor(ctx: Context) {
    super(ctx, 'notification')
    this.store = createNotificationStore()
  }

  /**
   * Append one unread message at the head of the list.
   * @param input - message fields (id, read, and createdAt are service-allocated).
   * @returns the allocated message id.
   */
  push(input: NotificationInput): string {
    const message: NotificationMessage = {
      id: `n-${Date.now().toString(36)}-${(this.seq++).toString(36)}`,
      type: input.type,
      title: input.title,
      content: input.content,
      read: false,
      createdAt: Date.now(),
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
    }
    this.store.update(state => { state.messages.unshift(message) })
    return message.id
  }

  /**
   * Mark one message read. Absent ids no-op.
   * @param id - message id.
   */
  markRead(id: string): void {
    this.store.update(state => {
      const message = state.messages.find(m => m.id === id)
      if (message !== undefined) message.read = true
    })
  }

  /** Mark every message read. */
  markAllRead(): void {
    this.store.update(state => {
      for (const message of state.messages) message.read = true
    })
  }

  /**
   * Remove one message. Absent ids no-op.
   * @param id - message id.
   */
  remove(id: string): void {
    this.store.update(state => {
      state.messages = state.messages.filter(m => m.id !== id)
    })
  }

  /** Remove every message. */
  clear(): void {
    this.store.update(state => { state.messages = [] })
  }
}
