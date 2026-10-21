import { PythonRunner } from '../runtime/runner';
import type { Compilation } from '../language/compiler';
import type { CheckStep } from '../runtime/protocol';

/** The checker: runs a program on a list of inputs and compares what it printed
 * with the answers wanted, as a competitive-programming judge does. All inputs
 * run in one worker (Python starts once), each with its own input and printed
 * output; a test that never ends is found by the run's time limit. Puzzles in
 * lessons use it, and Track C's practice problems will too. */
export interface PuzzleTest { input: string; output: string; name?: string; tip?: string }
export interface TestResult { index: number; ok: boolean; output: string; expected: string; error?: string; errorLine?: number; timedOut?: boolean }

/** Printed lines as compared: spaces at line ends and blank lines at the end do not count. */
export const answerLines = (text: string) => { const lines = text.replace(/\r\n?/g, '\n').split('\n').map(line => line.trimEnd()); while (lines.length && !lines[lines.length - 1]) lines.pop(); return lines; };
export const sameAnswer = (printed: string, wanted: string) => { const a = answerLines(printed), b = answerLines(wanted); return a.length === b.length && a.every((line, i) => line === b[i]); };

/** Why a program cannot be checked at all, or null. */
export function uncheckable(compilation: Compilation) {
  if (compilation.source === null || compilation.diagnostics.some(d => d.severity === 'error')) return 'Some blocks have a problem. Fix the blocks marked with a warning, then check again.';
  if (!compilation.hasEntry) return 'There is no program to check yet. Put your blocks inside the Program block.';
  if (compilation.executionMode === 'events') return 'Puzzles run from top to bottom in the Program block. Move your blocks out of “when …” blocks into Program.';
  return null;
}

let runner: PythonRunner | null = null;
/** Run `compilation` once per test; results arrive in order through `progress`, and all of them at the end. */
export function checkProgram(compilation: Compilation, tests: PuzzleTest[], progress: (result: TestResult) => void = () => {}): Promise<TestResult[]> {
  runner?.dispose();
  return new Promise(resolve => {
    const results: TestResult[] = [];
    const finish = (failure?: string) => {
      // A run that stopped early (too long, or Python failed): the test it was on, and any after it, did not finish.
      for (let index = results.length; index < tests.length; index++) {
        const timedOut = !!failure && /too long|10 seconds/.test(failure);
        const result: TestResult = { index, ok: false, output: '', expected: tests[index].output, error: index === results.length ? (timedOut ? 'Your program took too long. Is there a loop that never ends?' : failure ?? 'The check stopped.') : 'Not checked: an earlier test did not finish.', timedOut: timedOut && index === results.length };
        results.push(result); progress(result);
      }
      resolve(results);
    };
    const own = new PythonRunner(event => {
      if (runner !== own) return;
      if (event.type === 'test-result') {
        const test = tests[event.index]; if (!test || event.index !== results.length) return;
        const line = event.error?.frames?.filter(frame => frame.file === 'program.py').at(-1)?.line;
        const result: TestResult = { index: event.index, ok: !event.error && sameAnswer(event.output, test.output), output: event.output, expected: test.output, ...(event.error ? { error: event.error.message, ...(line ? { errorLine: line } : {}) } : {}) };
        results.push(result); progress(result);
      } else if (event.type === 'done') { runner = null; finish(); }
      else if (event.type === 'error') { runner = null; finish(event.message); }
    });
    runner = own;
    own.run(compilation.source!, 'sequential', compilation.files, compilation.scene, undefined, undefined, { tests: tests.map(test => test.input) });
  });
}
export function stopChecking() { runner?.dispose(); runner = null; }

/** A game check's expectation, as the script gives it, and how it went. */
export interface GameResult { index: number; ok: boolean; got: unknown }
export type GameStep = CheckStep & { label?: string };
/** Why a game cannot be checked at all, or null. */
export function gameUncheckable(compilation: Compilation) {
  if (compilation.source === null || compilation.diagnostics.some(d => d.severity === 'error')) return 'Some blocks have a problem. Fix the blocks marked with a warning, then check again.';
  return null;
}
let gameRunner: PythonRunner | null = null;
/** Play the game with a scripted player (src/runtime/checks.py): taps, keys and waits, then each expectation judged
 * on what the game shows. Results arrive through `progress`; the run's error, if it stopped with one, comes with them. */
export function checkGame(compilation: Compilation, steps: GameStep[], progress: (result: GameResult) => void = () => {}): Promise<{ results: GameResult[]; error?: string; errorLine?: number }> {
  gameRunner?.dispose();
  // The script's own waits, and time for Python to start and the game to settle.
  const limit = 20_000 + steps.reduce((sum, step) => sum + ('wait' in step ? step.wait * 1000 : 'hold' in step ? (step.hold ?? 0) * 1000 : 100), 0);
  return new Promise(resolve => {
    const results: GameResult[] = [];
    let timer = 0;
    const end = (error?: string, errorLine?: number) => { clearTimeout(timer); if (gameRunner === own) { gameRunner = null; own.dispose(); } resolve({ results, ...(error ? { error } : {}), ...(errorLine ? { errorLine } : {}) }); };
    const own = new PythonRunner(event => {
      if (gameRunner !== own) return;
      if (event.type === 'check-result') { const result = { index: event.index, ok: event.ok, got: event.got }; results.push(result); progress(result); }
      else if (event.type === 'done') end();
      else if (event.type === 'error') end(event.message, event.frames?.filter(frame => frame.file === 'program.py').at(-1)?.line);
    });
    gameRunner = own;
    timer = window.setTimeout(() => end('The check took too long. Is there a loop that never waits?'), limit);
    own.run(compilation.source!, 'events', compilation.files, compilation.scene, undefined, undefined, { check: steps.map(({ label: _label, ...step }) => step as CheckStep) });
  });
}
export function stopGameCheck() { gameRunner?.dispose(); gameRunner = null; }
