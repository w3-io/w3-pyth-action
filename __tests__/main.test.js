/**
 * Integration tests for the action entry point.
 *
 * The entry point (src/index.js) calls the command router on import,
 * which makes it difficult to test with ESM module mocking.
 * The client logic is covered by pyth.test.js.
 *
 * TODO: Refactor index.js to export a run() function for testability.
 */

test.todo('get-feeds returns feeds array')
