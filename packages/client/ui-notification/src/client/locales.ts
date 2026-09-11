/** `notification` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'notification'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'bell.aria': '消息通知',
  'bell.unread': '{count} 条未读',
  'panel.title': '消息通知',
  'panel.empty': '暂无消息',
  'panel.markAllRead': '全部已读',
  'panel.markRead': '标记已读',
  'panel.remove': '删除',
  'panel.clear': '清空消息',
  'type.automation': '自动化任务',
  'type.system': '系统通知',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<NotificationKey, string> = {
  'bell.aria': 'Notifications',
  'bell.unread': '{count} unread',
  'panel.title': 'Notifications',
  'panel.empty': 'No messages',
  'panel.markAllRead': 'Mark all read',
  'panel.markRead': 'Mark as read',
  'panel.remove': 'Remove',
  'panel.clear': 'Clear messages',
  'type.automation': 'Automation',
  'type.system': 'System',
}

/** Key domain of the `notification` namespace (zh is the source of truth). */
export type NotificationKey = keyof typeof zh
