import { test, expect, type Page } from '@playwright/test';
import { mockAuthenticatedApi, mockAuthenticatedSession } from './helpers/mockApi';

async function openSignedInApp(page: Page) {
  await mockAuthenticatedSession(page);
  await mockAuthenticatedApi(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /\+ new jam/i })).toBeVisible();
}

test.describe('Authenticated browser flows', () => {
  test('signs in with Google, loads member-only navigation, and signs out again', async ({ page }) => {
    await mockAuthenticatedSession(page, { initialUser: null });
    await mockAuthenticatedApi(page);

    await page.goto('/');
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();

    await page.getByRole('button', { name: /continue with google/i }).click();

    await expect(page.getByRole('button', { name: /\+ new jam/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /enter invite code/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /my jams/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /taylor stone/i })).toBeVisible();
    await expect(page.getByText('House Band Rehearsal')).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  });

  test('creates a private jam and shows it under My Jams', async ({ page }) => {
    await openSignedInApp(page);

    await page.getByRole('button', { name: /\+ new jam/i }).click();
    await expect(page.getByRole('heading', { name: /create a new jam/i })).toBeVisible();

    await page.getByLabel(/jam name/i).fill('Midnight Funk Lab');
    await page.getByLabel(/date and time/i).fill('2026-07-01T20:30');
    await page.getByLabel(/location/i).fill('Studio A');
    await page.getByLabel(/private \(invite only\)/i).check();
    await page.getByRole('button', { name: /create jam/i }).click();

    await expect(page.getByRole('heading', { name: /success/i })).toBeVisible();
    await expect(page.getByText(/private jam created! invite code:/i)).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();

    await page.getByRole('button', { name: /my jams/i }).click();
    await expect(page.getByText('Midnight Funk Lab')).toBeVisible();
  });

  test('joins a public jam with selected instruments and claims an open role', async ({ page }) => {
    await openSignedInApp(page);

    await page.getByText('Downtown Open Jam').click();
    await expect(page.getByRole('button', { name: /join this jam/i })).toBeVisible();

    await page.getByRole('button', { name: /join this jam/i }).click();
    await expect(page.getByRole('heading', { name: /join downtown open jam/i })).toBeVisible();
    await expect(page.getByText(/vocals are always available as a role/i)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Vocals' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Electric Guitar' }).check();
    await page.getByRole('button', { name: /join & add 1 instrument/i }).click();

    await expect(page.getByRole('heading', { name: /joined!/i })).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    await expect(page.getByText(/\(you\)/i)).toBeVisible();
    await expect(
      page.locator('div').filter({ hasText: /Electric Guitar\s*from\s*Taylor Stone/ }).first()
    ).toBeVisible();

    await page.getByText('Little Wing').click();
    await expect(page.getByRole('heading', { name: 'Vocals' })).toBeVisible();
    await expect(page.getByRole('button', { name: /i'll play/i }).first()).toBeVisible();
    await page.getByRole('button', { name: /i'll play/i }).first().click();
    await expect(page.getByRole('button', { name: /leave role/i })).toBeVisible();
  });

  test('updates the profile and reflects the new name in the header', async ({ page }) => {
    await openSignedInApp(page);

    await page.getByRole('button', { name: /taylor stone/i }).click();
    await expect(page.getByRole('heading', { name: /your profile/i })).toBeVisible();

    await page.getByLabel(/display name/i).fill('Taylor Storm');
    await page.getByRole('button', { name: /save profile/i }).click();

    await expect(page.getByRole('heading', { name: /saved/i })).toBeVisible();
    await expect(page.getByText(/profile updated/i)).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();

    await expect(page.getByRole('button', { name: /taylor storm/i })).toBeVisible();
  });
});
