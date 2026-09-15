/**
 * `server-only` throws when a module is imported outside a React Server
 * Component. That guard is exactly right in the app and exactly wrong in a unit
 * test, which imports the same module deliberately and on purpose. Aliased in
 * `vitest.config.ts` so the guard keeps protecting the app without making the
 * server-side code untestable.
 */
export {};
