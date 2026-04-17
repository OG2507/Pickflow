import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────
// Activity Log Helper
//
// Provides two functions:
//
//   logActivity(opts)   — log a single event (create / update / delete)
//   logChanges(opts)    — diff before/after objects and log each changed field
//
// Both are fire-and-forget — errors are swallowed after a console.error
// so a logging failure never breaks the underlying save.
// ─────────────────────────────────────────────────────────────

export type ActivityAction = 'create' | 'update' | 'delete'

export type LogActivityOptions = {
  action:      ActivityAction
  entityType:  string            // 'product' | 'client' | 'order' | ...
  entityId:    string | number   // primary key of the record
  entityLabel?: string           // e.g. SKU, order number, client name — for display
  fieldName?:  string
  oldValue?:   unknown
  newValue?:   unknown
  notes?:      string
}

export type LogChangesOptions = {
  entityType:   string
  entityId:     string | number
  entityLabel?: string
  before:       Record<string, unknown> | null | undefined
  after:        Record<string, unknown> | null | undefined
  ignoreFields?: string[]        // fields to skip (e.g. lastmodified timestamps)
  notes?:       string
}

// Cache user identity to avoid a round trip on every log call
let cachedUserId: string | null = null
let cachedUserName: string | null = null

async function getCurrentUser(): Promise<{ userid: string | null; username: string | null }> {
  if (cachedUserId && cachedUserName) {
    return { userid: cachedUserId, username: cachedUserName }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { userid: null, username: null }

  cachedUserId = user.id

  // Look up display name
  const { data: userRow } = await supabase
    .from('tblusers')
    .select('displayname, username')
    .eq('userid', user.id)
    .maybeSingle()

  cachedUserName = userRow?.displayname || userRow?.username || user.email || null

  return { userid: cachedUserId, username: cachedUserName }
}

// Clear cache on logout
export function clearActivityUserCache() {
  cachedUserId = null
  cachedUserName = null
}

// Format any value for storage as text
function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toISOString()
  try { return JSON.stringify(v) } catch { return String(v) }
}

// Compare two values as they would be stored
function equal(a: unknown, b: unknown): boolean {
  const sa = toText(a)
  const sb = toText(b)
  if (sa === null && sb === null) return true
  if (sa === null || sb === null) return false
  return sa === sb
}

// Default fields to ignore in diffs — timestamps etc.
const DEFAULT_IGNORE = new Set([
  'lastmodified',
  'modifiedat',
  'updatedat',
  'dateadded',
  'createdat',
])

// Log a single event
export async function logActivity(opts: LogActivityOptions): Promise<void> {
  try {
    const { userid, username } = await getCurrentUser()

    await supabase.from('tblactivitylog').insert({
      action:      opts.action,
      entitytype:  opts.entityType,
      entityid:    String(opts.entityId),
      entitylabel: opts.entityLabel ?? null,
      fieldname:   opts.fieldName ?? null,
      oldvalue:    toText(opts.oldValue),
      newvalue:    toText(opts.newValue),
      userid:      userid,
      username:    username,
      notes:       opts.notes ?? null,
    })
  } catch (err) {
    console.error('[activity log] failed to log activity:', err)
    // Swallow — never break the save that called us
  }
}

// Diff two objects and log one row per changed field
export async function logChanges(opts: LogChangesOptions): Promise<void> {
  try {
    const before = opts.before || {}
    const after = opts.after || {}
    const ignore = new Set([...DEFAULT_IGNORE, ...(opts.ignoreFields || [])])

    // Collect union of keys from both objects
    const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)])

    const changes: Array<{ field: string; old: unknown; new: unknown }> = []
    for (const k of keys) {
      if (ignore.has(k)) continue
      if (!equal(before[k], after[k])) {
        changes.push({ field: k, old: before[k], new: after[k] })
      }
    }

    if (changes.length === 0) return

    const { userid, username } = await getCurrentUser()
    const rows = changes.map(c => ({
      action:      'update',
      entitytype:  opts.entityType,
      entityid:    String(opts.entityId),
      entitylabel: opts.entityLabel ?? null,
      fieldname:   c.field,
      oldvalue:    toText(c.old),
      newvalue:    toText(c.new),
      userid,
      username,
      notes:       opts.notes ?? null,
    }))

    await supabase.from('tblactivitylog').insert(rows)
  } catch (err) {
    console.error('[activity log] failed to log changes:', err)
  }
}
