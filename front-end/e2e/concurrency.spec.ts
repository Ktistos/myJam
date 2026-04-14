import { test, expect, type Browser, type Page, type BrowserContext } from '@playwright/test';
import {
  createSharedAuthenticatedState,
  defaultAuthenticatedData,
  mockAuthenticatedApiWithState,
  mockAuthenticatedSession,
} from './helpers/mockApi';

async function openSignedInPage(
  browser: Browser,
  state = createSharedAuthenticatedState(defaultAuthenticatedData)
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await mockAuthenticatedSession(page);
  await mockAuthenticatedApiWithState(page, state);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /\+ new jam/i })).toBeVisible();
  return { context, page };
}

async function openJam(page: Page, jamName: string) {
  await page.getByText(jamName).click();
  await expect(page.getByRole('button', { name: /back to jams/i })).toBeVisible();
}

test.describe('Two-browser same-account flows', () => {
  test('reconciles a stale join in the second browser', async ({ browser }) => {
    const state = createSharedAuthenticatedState(defaultAuthenticatedData);
    const first = await openSignedInPage(browser, state);
    const second = await openSignedInPage(browser, state);

    try {
      await openJam(first.page, 'Downtown Open Jam');
      await openJam(second.page, 'Downtown Open Jam');

      await first.page.getByRole('button', { name: /join this jam/i }).click();
      await expect(first.page.getByRole('heading', { name: /join downtown open jam/i })).toBeVisible();
      await first.page.getByRole('button', { name: /join without adding instruments/i }).click();
      await expect(first.page.getByRole('heading', { name: /joined!/i })).toBeVisible();
      await first.page.getByRole('button', { name: /close/i }).click();
      await expect(first.page.getByRole('button', { name: /leave jam/i })).toBeVisible();

      await second.page.getByRole('button', { name: /join this jam/i }).click();
      await expect(second.page.getByRole('heading', { name: /join downtown open jam/i })).toBeVisible();
      await second.page.getByRole('button', { name: /join without adding instruments/i }).click();

      await expect(second.page.getByRole('heading', { name: /already joined/i })).toBeVisible();
      await expect(second.page.getByText(/another browser/i)).toBeVisible();
      await second.page.getByRole('button', { name: /close/i }).click();
      await expect(second.page.getByRole('button', { name: /leave jam/i })).toBeVisible();
    } finally {
      await first.context.close();
      await second.context.close();
    }
  });

  test('reconciles a stale leave-and-delete in the second browser', async ({ browser }) => {
    const state = createSharedAuthenticatedState(defaultAuthenticatedData);
    const first = await openSignedInPage(browser, state);
    const second = await openSignedInPage(browser, state);

    try {
      await openJam(first.page, 'House Band Rehearsal');
      await openJam(second.page, 'House Band Rehearsal');

      await expect(first.page.getByRole('button', { name: /leave and delete jam/i })).toBeVisible();
      await expect(second.page.getByRole('button', { name: /leave and delete jam/i })).toBeVisible();

      await first.page.getByRole('button', { name: /leave and delete jam/i }).click();
      await expect(first.page.getByRole('heading', { name: /jam deleted/i })).toBeVisible();
      await first.page.getByRole('button', { name: /close/i }).click();
      await expect(first.page.getByRole('button', { name: /discover/i })).toBeVisible();
      await expect(first.page.getByText('House Band Rehearsal')).toHaveCount(0);

      await second.page.getByRole('button', { name: /leave and delete jam/i }).click();
      await expect(second.page.getByRole('button', { name: /discover/i })).toBeVisible();
      await expect(second.page.getByText('House Band Rehearsal')).toHaveCount(0);
      await expect(second.page.getByRole('heading', { name: /^error$/i })).toHaveCount(0);
    } finally {
      await first.context.close();
      await second.context.close();
    }
  });
});
