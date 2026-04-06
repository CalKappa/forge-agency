import { supabase } from './supabase'

/**
 * Safe wrapper around supabase update that always filters by id only.
 * Optionally retries with fallbackUpdates when a column-not-found error occurs
 * (e.g. token_usage column not yet migrated).
 *
 * @param {string} tableName
 * @param {string} id            - Primary key value
 * @param {object} updates       - Fields to update
 * @param {object} [fallbackUpdates] - If provided, retried without optional columns on schema errors
 * @returns {{ data, error }}
 */
export const safeUpdate = async (tableName, id, updates, fallbackUpdates = null) => {
  const { data, error } = await supabase.from(tableName).update(updates).eq('id', id)

  if (error) {
    const msg = error.message ?? ''
    if (fallbackUpdates && (msg.includes('column') || msg.includes('schema cache') || msg.includes('could not find'))) {
      console.warn(`[safeUpdate] Column error on ${tableName} id=${id} — retrying without optional fields: ${msg}`)
      const { data: fbData, error: fbErr } = await supabase.from(tableName).update(fallbackUpdates).eq('id', id)
      if (fbErr) console.error(`[safeUpdate] Fallback also failed on ${tableName} id=${id}`, fbErr)
      return { data: fbData, error: fbErr }
    }
    console.error(`[safeUpdate] Update failed on ${tableName} id=${id}`, error)
  }

  return { data, error }
}
