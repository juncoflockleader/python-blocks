import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import type { RunnerEvent } from '../../src/runtime/protocol';
import type { PythonRunner } from '../../src/runtime/runner';

// Serve the real runner source through test-only routes, plus the built worker.
// This exercises its actual watchdog without adding test exports to the app.
const asset = readdirSync(path.resolve('dist/assets')).find(file => /^python\.worker-.*\.js$/.test(file));
if (!asset) throw new Error('Build the app before running event runtime tests.');
const harnessFiles: Record<string, string> = {
  'runner.js': stripTypeScriptTypes(readFileSync('src/runtime/runner.ts', 'utf8')),
  protocol: stripTypeScriptTypes(readFileSync('src/runtime/protocol.ts', 'utf8')),
  'event-limits.json': `export default ${readFileSync('src/runtime/event-limits.json', 'utf8')};`,
  'python.worker.ts': readFileSync(path.resolve('dist/assets', asset), 'utf8'),
};
declare global { interface Window { eventRunner: PythonRunner; eventMessages: RunnerEvent[] } }
test.beforeEach(async ({ page }) => {
  await page.route('**/__event_test/*', route => {
    const source = harnessFiles[new URL(route.request().url()).pathname.split('/').at(-1)!];
    return source ? route.fulfill({ contentType: 'text/javascript', body: source }) : route.abort();
  });
});
async function start(page: Page, code: string) {
  await page.goto('/');
  await launch(page, code);
}
async function launch(page: Page, code: string) {
  await page.evaluate(async code => {
    const moduleUrl = '/__event_test/runner.js';
    const { PythonRunner } = await import(moduleUrl);
    const host = window; host.eventRunner?.dispose();
    const messages: RunnerEvent[] = []; host.eventMessages = messages;
    host.eventRunner = new PythonRunner((event: RunnerEvent) => messages.push(event));
    host.eventRunner.run(code, 'events');
  }, code);
}
const messages = (page: Page) => page.evaluate(() => (window).eventMessages);
const output = async (page: Page) => (await messages(page)).filter((event): event is Extract<RunnerEvent, { type: 'stdout' }> => event.type === 'stdout').map(event => event.text);
test.afterEach(async ({ page }) => { await page.evaluate(() => window.eventRunner?.dispose()); });

test('the real Pyodide event loop runs two activities and awaited value-returning helpers', async ({ page }) => {
  await start(page, readFileSync(path.resolve('tests/fixtures/events/cooperative.py'), 'utf8'));
  await expect.poll(() => output(page), { timeout: 60_000 }).toEqual(['first starts 1', 'second starts 2', 'double 42', 'first ends 2']);
  expect((await messages(page)).some(event => event.type === 'ready')).toBe(true);
  expect((await messages(page)).filter(event => event.type === 'error' || event.type === 'done')).toEqual([]);
});

test('idle sessions remain responsive beyond ten seconds and snapshot each host-event receiver', async ({ page }) => {
  await start(page, `from playground import events
async def first(payload):
    payload["items"].append(7)
    print("first", payload)
async def second(payload):
    print("second", payload)
events.on("message", first)
events.on("message", second)
`);
  await expect.poll(async () => (await messages(page)).some(event => event.type === 'ready'), { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(11_000);
  expect(await page.evaluate(() => window.eventRunner.emit('message', { items: [1] }))).toBe(true);
  await expect.poll(() => output(page)).toEqual(["first {'items': [1, 7]}", "second {'items': [1]}"]);
  expect((await messages(page)).filter(event => event.type === 'error' || event.type === 'done')).toEqual([]);
});

test('an asynchronous handler failure retains its program line and cancels a waiting peer', async ({ page }) => {
  await start(page, `from playground import events
async def waiting(payload):
    await events.wait(0.5)
    print("must not resume")
async def broken(payload):
    await events.wait(0)
    return 1 / 0
events.on("start", waiting)
events.on("start", broken)
`);
  await expect.poll(async () => (await messages(page)).find(event => event.type === 'error'), { timeout: 60_000 }).toMatchObject({ exceptionType: 'ZeroDivisionError', frames: expect.arrayContaining([{ file: 'program.py', line: 7, name: 'broken' }]) });
  await page.waitForTimeout(700);
  expect(await output(page)).toEqual([]);
});

for (const kind of ['queued events', 'active handlers'] as const) test(`${kind} overload fails the real runtime explicitly`, async ({ page }) => {
  await start(page, `from playground import events
async def receiver(payload):
    await events.wait(100)
async def flood(payload):
    for number in range(${kind === 'queued events' ? 129 : 33}):
        events.emit("tick", number)
events.on("tick", receiver)
events.on("start", flood)
`);
  await expect.poll(async () => (await messages(page)).find(event => event.type === 'error'), { timeout: 60_000 }).toMatchObject({ exceptionType: 'EventOverloadError', message: expect.stringContaining(kind) });
  if (kind === 'active handlers') expect((await messages(page)).find(event => event.type === 'error')).toMatchObject({ originFrames: expect.arrayContaining([{ file: 'program.py', line: 6, name: 'flood' }]) });
});

test('the real runner watchdog terminates a non-yielding event worker and restart receives only new input', async ({ page }) => {
  await start(page, `from playground import events
async def blocked(payload):
    print("blocking")
    while True:
        pass
events.on("start", blocked)
`);
  await expect.poll(() => output(page), { timeout: 60_000 }).toEqual(['blocking']);
  await expect.poll(async () => (await messages(page)).find(event => event.type === 'error'), { timeout: 10_000 }).toMatchObject({ message: expect.stringContaining('stopped responding') });
  expect(await page.evaluate(() => window.eventRunner.emit('message', 'old'))).toBe(false);
  await launch(page, `from playground import events
count = 0
async def receiver(payload):
    global count
    count += 1
    print(count, payload)
events.on("message", receiver)
`);
  await expect.poll(async () => (await messages(page)).some(event => event.type === 'ready'), { timeout: 60_000 }).toBe(true);
  expect(await page.evaluate(() => window.eventRunner.emit('message', 'new'))).toBe(true);
  await expect.poll(() => output(page)).toEqual(['1 new']);
  await page.evaluate(() => window.eventRunner.stop());
  expect((await messages(page)).at(-1)).toEqual({ type: 'status', message: 'Stopped' });
  expect(await page.evaluate(() => window.eventRunner.emit('message', 'after stop'))).toBe(false);
});
