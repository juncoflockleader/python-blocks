import { test, expect, type Browser, type Page } from '@playwright/test';
import { openHelp, openTab } from './shell';

// The app as the Python Blocks server serves it (server/): playwright.config.ts starts the server on
// its own port with a fresh database and an admin. Nothing but the sign-in page is served before
// signing in; an admin makes accounts; a learner's work, programs and coins follow them.
const base = process.env.ACCOUNTS_URL ?? 'http://127.0.0.1:4174';
const admin = { username: process.env.ACCOUNTS_ADMIN ?? 'teacher', password: process.env.ACCOUNTS_ADMIN_PASSWORD ?? 'teacher-pass' };
test.use({ baseURL: base, storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 860 } });

async function computer(browser: Browser) { return (await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 860 } })).newPage(); }
async function signIn(page: Page, username: string, password: string) {
  await page.goto('/'); await expect(page).toHaveURL(/\/login$/);
  await page.fill('#login-username', username); await page.fill('#login-password', password); await page.click('#login-submit');
  await expect(page).toHaveURL(`${base}/`); await expect(page.locator('#run')).toBeEnabled();
  await expect(page.locator('#account-coin-count')).toBeVisible();
  // A browser that has never chosen a level offers one, once.
  if (await page.locator('#level-dialog').isVisible()) await page.locator('#level-keep').click();
}
async function menu(page: Page, item: string) { await page.locator('#account-button').click(); await page.locator(item).click(); }

test('before signing in there is only the sign-in page, and a wrong password says so', async ({ page }) => {
  await page.goto('/'); await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('#login-submit')).toHaveText('Sign in');
  expect((await page.request.get('/api/me')).status()).toBe(401);
  expect((await page.request.get('/admin', { maxRedirects: 0 })).status()).toBe(302);
  await page.fill('#login-username', admin.username); await page.fill('#login-password', 'not the password'); await page.click('#login-submit');
  await expect(page.locator('#login-error')).toHaveText('That username and password do not match.');
  await expect(page).toHaveURL(/\/login$/);
});

test('an admin adds a learner, whose programs, work and coins follow them to another computer', async ({ browser }) => {
  test.setTimeout(240_000);
  const username = `learner${Date.now() % 100000}`, password = 'bananas';
  // The admin adds a learner on the admin page.
  const teacher = await computer(browser);
  await signIn(teacher, admin.username, admin.password);
  await menu(teacher, '#account-admin'); await expect(teacher).toHaveURL(`${base}/admin`);
  await teacher.fill('#add-name', 'Ada'); await teacher.fill('#add-username', username); await teacher.fill('#add-password', password);
  await teacher.locator('#add-form button[type=submit]').click();
  await expect(teacher.locator('#add-status')).toHaveText(`Added Ada. Give them: username ${username}, password ${password}`);
  await expect(teacher.locator(`[data-user="${username}"]`)).toBeVisible();

  // The learner opens an example and changes it: it is saved in My projects as they work.
  const page = await computer(browser);
  await signIn(page, username, password);
  await expect(page.locator('#account-coin-count')).toHaveText('0'); await expect(page.locator('.account-avatar')).toHaveText('A');
  await page.locator('#examples-open').click(); await page.locator('#snake').click();
  if (await page.locator('#level-dialog').isVisible()) await page.locator('#level-switch').click();
  await page.waitForTimeout(2500);
  await openTab(page, 'sprite'); await page.fill('#scene-x', '-90'); await page.press('#scene-x', 'Enter');
  await expect(page.locator('#save-state')).toHaveText('Saved to My projects', { timeout: 10_000 });
  await menu(page, '#account-projects');
  await expect(page.locator('.account-project strong')).toHaveText(['Snake']);
  await expect(page.locator('.account-project')).toContainText('Open now');
  await page.locator('#projects-close').click();

  // Finishing a guided build earns coins, once.
  await openHelp(page, 'builds'); await page.locator('#guide-start-catch-the-star').click(); await page.locator('#guide-confirm-start').click();
  await page.locator('#scene-stock').click(); await page.locator('#stock-dialog .stock-card[data-stock-id="star"]').click();
  await openTab(page, 'help'); await expect(page.locator('#guide-check')).toHaveText(/Done/); await page.locator('#guide-next').click();
  const insertShown = async (recipe: string) => {
    await openTab(page, 'help'); await page.locator('#guide-show').click();
    await page.locator(`#ideas-results [data-recipe="${recipe}"] .recipe-insert`).click();
    await expect(page.locator('#guide-check')).toHaveText(/Done/); await page.locator('#guide-next').click();
  };
  await insertShown('arrow-keys');
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); await page.locator('#stop').click();
  await openTab(page, 'help'); await expect(page.locator('#guide-check')).toHaveText(/Done/); await page.locator('#guide-next').click();
  for (const recipe of ['collect-coin', 'keep-score', 'win-screen']) await insertShown(recipe);
  const target = page.getByRole('button', { name: 'Edit text: 5', exact: true }); await target.scrollIntoViewIfNeeded(); await target.click();
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('0'); await page.keyboard.press('Enter');
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('You win!', { timeout: 60_000 });
  await openTab(page, 'help'); await expect(page.locator('#guide-check')).toHaveText(/Done/); await page.locator('#guide-next').click();
  await expect(page.locator('#coin-toast')).toContainText('+30 coins!');
  await expect(page.locator('#coin-toast')).toContainText('Guided build: Catch the star');
  await expect(page.locator('#account-coin-count')).toHaveText('30');
  // Everything here has reached the account before the learner moves to another computer.
  await expect.poll(() => page.evaluate(async () => {
    const { values } = await (await fetch('/api/data')).json() as { values: Record<string, string> };
    return ['python-blocks.guide.v1', 'python-blocks.project.v1'].every(key => (values[key] ?? null) === localStorage.getItem(key));
  }), { timeout: 10_000 }).toBe(true);

  // On another computer the same learner finds their work, their program and their coins.
  const other = await computer(browser);
  await signIn(other, username, password);
  await expect(other.locator('#account-coin-count')).toHaveText('30');
  await expect(other.locator('#project-title')).toHaveText('Catch the star');
  // The finished build is theirs too: once the build is over, it is saved like any program.
  await menu(other, '#account-projects'); await expect(other.locator('.account-project strong')).toHaveText(['Catch the star', 'Snake']);
  await other.locator('.account-project', { hasText: 'Snake' }).locator('button', { hasText: 'Open' }).click();
  await expect(other.locator('#project-title')).toHaveText('Snake');
  await expect.poll(() => other.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!).workspace.pythonScene.sprites.find((s: { id: string }) => s.id === 'head').x)).toBe(-90);
  await other.locator('#account-coins').click(); await expect(other.locator('#profile-balance')).toHaveText('30');
  await expect(other.locator('#profile-history li').first()).toContainText('Guided build: Catch the star');
  await other.locator('#profile-close').click();

  // Signing out leaves nothing of theirs in the browser.
  await menu(other, '#account-signout'); await expect(other).toHaveURL(/\/login$/);
  expect(await other.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('python-blocks')))).toEqual([]);

  // The admin turns the account off: the learner cannot sign in.
  await teacher.reload(); await teacher.locator(`[data-user="${username}"]`).click();
  await teacher.locator('#detail button', { hasText: 'Turn the account off' }).click();
  await expect(teacher.locator('#detail .admin-status')).toHaveText('Turned off: they cannot sign in.');
  await other.fill('#login-username', username); await other.fill('#login-password', password); await other.click('#login-submit');
  await expect(other.locator('#login-error')).toHaveText('This account is turned off. Ask your teacher.');
});
