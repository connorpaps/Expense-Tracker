#!/usr/bin/env node
/** Optional local-only file-save activity watcher. */
import { watch, appendFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOG = join(ROOT, 'docs', 'activity-watch.log')
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'out', 'release', '.vite', 'coverage', '.playwright-cli', 'docs'])
const DEBOUNCE_MS = 1500
const pending = new Map()
mkdirSync(dirname(LOG), { recursive: true })

function write(entry) {
  try { appendFileSync(LOG, `${entry}\n`) } catch (error) { console.error(`[memory-watcher] ${error.message}`) }
}
function ignored(rel) {
  if (!rel) return true
  return IGNORED_DIRS.has(rel.split(/[\\/]/)[0]) || rel.endsWith('activity-watch.log')
}
function handleChange(eventType, filename) {
  if (!filename) return
  const rel = relative(ROOT, filename).replaceAll('\\', '/')
  if (ignored(rel)) return
  if (pending.has(rel)) clearTimeout(pending.get(rel))
  pending.set(rel, setTimeout(() => {
    pending.delete(rel)
    write(`[${new Date().toISOString()}] ${eventType}: ${rel}`)
  }, DEBOUNCE_MS))
}

let watcher
try {
  watcher = watch(ROOT, { recursive: true }, handleChange)
} catch (error) {
  console.error(`[memory-watcher] recursive watch unavailable: ${error.message}`)
  watcher = []
  for (const dir of ['.github', '.specify', 'specs', 'scripts', 'docs']) {
    try { watcher.push(watch(join(ROOT, dir), { recursive: true }, handleChange)) } catch {}
  }
}
console.log(`[memory-watcher] watching ${ROOT}`)
console.log(`[memory-watcher] logging to ${LOG}`)
console.log('[memory-watcher] Ctrl+C to stop')
process.on('SIGINT', () => {
  for (const timer of pending.values()) clearTimeout(timer)
  if (Array.isArray(watcher)) watcher.forEach((item) => item.close())
  else watcher.close()
  process.exit(0)
})
