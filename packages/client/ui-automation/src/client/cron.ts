/**
 * Minimal five-field cron engine: parse `minute hour day-of-month month
 * day-of-week` expressions and compute the next run strictly after a
 * reference time. Supports `*`, ranges `a-b`, lists `a,b`, steps `/n`,
 * plain numbers, and day-of-week 7 meaning Sunday (normalized to 0).
 * The scheduler never re-parses: it stores the computed
 * `nextRunAt` per task and only recomputes after a run.
 */

/** The five normalized cron fields, each a sorted unique value list. */
export interface CronSchedule {
  /** 0-59 */
  readonly minutes: readonly number[]
  /** 0-23 */
  readonly hours: readonly number[]
  /** 1-31 */
  readonly daysOfMonth: readonly number[]
  /** 1-12 */
  readonly months: readonly number[]
  /** 0-6 (0 = Sunday) */
  readonly daysOfWeek: readonly number[]
}

/**
 * Parse one `*`-style field into its matching values.
 * @param raw - the raw field text.
 * @param min - inclusive lower bound.
 * @param max - inclusive upper bound.
 * @returns sorted unique values in `[min, max]`.
 * @throws {Error} when the field is malformed or out of range.
 */
function parseField(raw: string, min: number, max: number): number[] {
  const values = new Set<number>()
  for (const part of raw.split(',')) {
    if (part === '') throw new Error(`cron field "${raw}" has an empty entry`)
    let step = 1
    const stepped = part.includes('/')
      ? part.split('/')
      : null
    let base = part
    if (stepped !== null) {
      if (stepped.length !== 2 || !/^\d+$/.test(stepped[1]!)) {
        throw new Error(`cron field "${raw}": invalid step in "${part}"`)
      }
      step = Number(stepped[1])
      if (step < 1) throw new Error(`cron field "${raw}": step must be >= 1`)
      base = stepped[0]!
    }
    if (base === '*') {
      for (let value = min; value <= max; value += step) values.add(value)
      continue
    }
    const range = base.includes('-') ? base.split('-') : null
    if (range !== null) {
      if (range.length !== 2 || !/^\d+$/.test(range[0]!) || !/^\d+$/.test(range[1]!)) {
        throw new Error(`cron field "${raw}": invalid range "${base}"`)
      }
      const low = Number(range[0])
      const high = Number(range[1])
      if (low < min || high > max || low > high) {
        throw new Error(`cron field "${raw}": range ${base} out of [${min}, ${max}]`)
      }
      for (let value = low; value <= high; value += step) values.add(value)
      continue
    }
    if (!/^\d+$/.test(base)) throw new Error(`cron field "${raw}": invalid entry "${base}"`)
    const value = Number(base)
    if (value < min || value > max) {
      throw new Error(`cron field "${raw}": value ${value} out of [${min}, ${max}]`)
    }
    values.add(value)
  }
  return [...values].sort((a, b) => a - b)
}

/**
 * Parse a five-field cron expression into a schedule.
 * @param expr - whitespace-separated five-field cron expression.
 * @returns the normalized schedule.
 * @throws {Error} when the expression is malformed.
 */
export function parseCron(expr: string): CronSchedule {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`cron expression must have 5 fields, got ${fields.length}: "${expr}"`)
  }
  return {
    minutes: parseField(fields[0]!, 0, 59),
    hours: parseField(fields[1]!, 0, 23),
    daysOfMonth: parseField(fields[2]!, 1, 31),
    months: parseField(fields[3]!, 1, 12),
    // 7 is Sunday in the de-facto standard; normalize to 0.
    daysOfWeek: parseField(fields[4]!, 0, 7).map(value => (value === 7 ? 0 : value)),
  }
}

/**
 * Whether a date matches one schedule's month and day rule. Both day fields
 * restricted is the standard cron OR (either matching runs the job); one
 * restricted wins alone; neither is an every-day match.
 * @param date - the candidate date (local time components).
 * @param schedule - the parsed schedule.
 * @returns whether the date matches.
 */
export function matchesDate(
  date: { getMonth(): number, getDate(): number, getDay(): number },
  schedule: CronSchedule,
): boolean {
  if (!schedule.months.includes(date.getMonth() + 1)) return false
  const domRestricted = schedule.daysOfMonth.length < 31
  const dowRestricted = schedule.daysOfWeek.length < 7
  const domMatch = schedule.daysOfMonth.includes(date.getDate())
  const dowMatch = schedule.daysOfWeek.includes(date.getDay())
  if (domRestricted && dowRestricted) return domMatch || dowMatch
  if (domRestricted) return domMatch
  if (dowRestricted) return dowMatch
  return true
}

/** Search horizon in minutes (~10 years), so malformed schedules terminate. */
const MAX_MINUTES = 10 * 366 * 24 * 60

/**
 * The next run strictly after `after`, at whole-minute resolution.
 * @param expr - five-field cron expression.
 * @param after - reference epoch ms; the result is strictly greater.
 * @returns the next run epoch ms, or null when none exists within the horizon.
 * @throws {Error} when the expression is malformed.
 */
export function nextCronRun(expr: string, after: number): number | null {
  const schedule = parseCron(expr)
  const start = Math.floor(after / 60_000) + 1
  const end = start + MAX_MINUTES
  for (let minutes = start; minutes < end; minutes++) {
    const date = new Date(minutes * 60_000)
    if (
      matchesDate(date, schedule)
      && schedule.hours.includes(date.getHours())
      && schedule.minutes.includes(date.getMinutes())
    ) {
      return minutes * 60_000
    }
  }
  return null
}
