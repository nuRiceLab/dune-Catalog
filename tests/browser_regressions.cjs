// Run against tests/browser_server.py and the frontend on localhost:3002.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { chromium } = require('playwright');

const api = 'http://localhost:8082';
const site = 'http://localhost:3002/dunecatalog';
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function openPage(t, path) {
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.request.get(`${api}/__test__/login`);
  const page = await context.newPage();
  await page.goto(site + path);
  return page;
}

async function configure(page, settings) {
  const response = await page.request.post(`${api}/__test__/state`, {
    headers: { Origin: 'http://localhost:3002' }, data: settings,
  });
  assert.equal(response.status(), 200);
}

test('repeating the search retries a temporary size-service failure', async t => {
  const page = await openPage(t, '/');
  await configure(page, { fail_sizes: true, size_requests: 0, queries: 0 });
  await page.goto(`${site}/?tab=Far+Detectors&category=FD-HD`);
  await page.locator('tbody tr').nth(1).getByText('n/a', { exact: true }).waitFor();
  await configure(page, { fail_sizes: false });
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/queryDatasets')),
    page.getByRole('button', { name: 'Search', exact: true }).click(),
  ]);
  await page.locator('tbody tr').nth(1).getByText('1 KB', { exact: true }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator('tbody tr').first().locator('td').last().innerText(), '0 Bytes');
});

test('50-row pages load sizes without saturating the service and sort globally', async t => {
  const page = await openPage(t, '/');
  await configure(page, { fail_sizes: false, delay: 0.2, max_active: 0, clear_sizes: true });
  const failures = [];
  page.on('response', response => {
    if (response.url().endsWith('/datasetSizes') && response.status() !== 200) failures.push(response.status());
  });
  await page.goto(`${site}/?tab=Far+Detectors&category=FD-HD`);
  await page.locator('tbody tr').nth(9).getByText('9 KB', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Size', exact: true }).isDisabled(), true);
  await page.getByRole('combobox').last().click();
  await page.getByRole('option', { name: '50', exact: true }).click();
  await page.locator('tbody tr').last().getByText('49 KB', { exact: true }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 50);
  assert.deepEqual(failures, []);
  const state = await (await page.request.get(`${api}/__test__/state`)).json();
  assert.ok(state.max_active <= 5, `Expected at most five active aggregates, got ${state.max_active}`);
  const size = page.getByRole('button', { name: 'Size', exact: true });
  assert.equal(await size.isEnabled(), true);
  await size.click();
  await size.click();
  await page.locator('tbody tr').first().getByText('dataset-49', { exact: true }).waitFor();
});

test('invalid admin JSON stays editable and email strings can be saved', async t => {
  const page = await openPage(t, '/admin/users/');
  const errors = [];
  page.on('pageerror', error => {
    // Monaco can reject background work when Form View disposes the editor.
    if (error.message === 'Canceled' && error.stack?.includes('/monaco-editor@')
      && error.stack.includes('at dispose')) return;
    errors.push(error.message);
  });
  await page.getByText('browser@example.invalid', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'JSON View' }).click();
  const editor = page.getByRole('textbox', { name: /Editor content/ });
  await editor.waitFor({ timeout: 30000 });
  async function edit(content) {
    await page.locator('.monaco-editor .view-lines').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(content);
  }
  let saves = 0;
  page.on('request', request => {
    if (request.url().includes('/admin/config') && request.method() === 'POST') saves++;
  });
  for (const content of [
    '',
    '{"admins":[null]}',
    '{"admins":["not-an-email"]}',
    '{"admins":[{"issuer":"https://cilogon.org","sub":{}}]}',
    '{"admins":[{"issuer":"https://wrong.example.invalid","sub":"test"}]}',
    '{"admins":[]}',
    '{"admins":',
  ]) {
    await edit(content);
    await page.getByRole('button', { name: 'Form View' }).click();
    try {
      await page.getByRole('alert').filter({ hasText: 'administrator' }).waitFor({ timeout: 5000 });
    } catch (error) {
      assert.deepEqual(errors, [], 'The admin editor must not crash');
      throw error;
    }
    assert.equal(await editor.isVisible(), true);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    assert.equal(saves, 0);
    assert.deepEqual(errors, []);
  }
  const admins = ['browser@example.invalid', 'test@example.invalid'];
  await edit(JSON.stringify({ admins }));
  await page.getByRole('button', { name: 'Form View' }).click();
  await page.getByText('test@example.invalid', { exact: true }).waitFor();
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/admin/config') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save Changes' }).click(),
  ]);
  const saved = await page.request.get(`${api}/admin/config?file=admins.json`);
  assert.deepEqual((await saved.json()).data.admins, admins);
  await page.reload();
  await page.getByText('test@example.invalid', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test('an admin can add an email before that person signs in', async t => {
  const page = await openPage(t, '/admin/users/');
  await page.getByText('browser@example.invalid', { exact: true }).waitFor();
  const input = page.getByRole('textbox', { name: 'Add New Admin' });
  await input.fill('New-Admin@Example.Invalid');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByText('new-admin@example.invalid', { exact: true }).waitFor();
  await input.fill('NEW-ADMIN@example.invalid');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  assert.equal(await page.getByText('new-admin@example.invalid', { exact: true }).count(), 1);
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/admin/config') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save Changes' }).click(),
  ]);
  await page.reload();
  await page.getByText('new-admin@example.invalid', { exact: true }).waitFor();
  await page.request.get(`${api}/__test__/login?email=new-admin@example.invalid&subject=never-enrolled`);
  const session = await (await page.request.get(`${api}/auth/me`)).json();
  assert.equal(session.user.sub, 'never-enrolled');
  assert.equal(session.user.is_admin, true);
  await page.reload();
  await page.getByText('Current Admins', { exact: true }).waitFor();
});

test('leaving a search cancels sizes without starting the next batch', async t => {
  const page = await openPage(t, '/');
  await configure(page, { fail_sizes: false, delay: 1, clear_sizes: true, size_requests: 0 });
  await page.goto(`${site}/?tab=Far+Detectors&category=FD-HD`);
  await page.waitForFunction(async api => {
    const state = await (await fetch(`${api}/__test__/state`)).json();
    return state.active > 0;
  }, api);
  await page.getByRole('tab', { name: 'Other', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('tab') === 'Other');
  await page.locator('tbody tr').first().waitFor({ state: 'detached' });
  await page.waitForFunction(async api => {
    const state = await (await fetch(`${api}/__test__/state`)).json();
    return state.active === 0;
  }, api);
  const state = await (await page.request.get(`${api}/__test__/state`)).json();
  assert.equal(state.size_requests, 1);
  assert.equal(await page.locator('tbody tr').count(), 0);
});

test('logout clears the browser session while a copied cookie lasts until expiry', async t => {
  const page = await openPage(t, '/');
  await page.getByRole('button', { name: 'Logout' }).waitFor();
  const cookie = (await page.context().cookies(api)).find(cookie => cookie.name === 'dunecat_token');
  assert.ok(cookie?.httpOnly);
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/auth/logout')),
    page.getByRole('button', { name: 'Logout' }).click(),
  ]);
  await page.getByRole('button', { name: 'Login with CILogon', exact: true }).waitFor();
  const cleared = await page.request.get(`${api}/auth/me`);
  assert.equal((await cleared.json()).authenticated, false);
  const session = await page.request.get(`${api}/auth/me`, { headers: { Cookie: `dunecat_token=${cookie.value}` } });
  assert.equal((await session.json()).authenticated, true);
});
