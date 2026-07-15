/**
 * Shared formatting helpers.
 *
 * Save as: src/lib/format.ts
 */

/**
 * Formats a byte count as a human-readable size using decimal units
 * (k = 1000), matching the metacat CLI convention.
 *
 * - undefined  -> '…'  (value still loading)
 * - 0 / null   -> '—'  (unknown or empty)
 */
export function formatSize(bytes: number | undefined | null): string {
  if (bytes === undefined) return '…';
  if (!bytes) return '—';
  const k = 1000; // decimal units, matching the metacat CLI
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
