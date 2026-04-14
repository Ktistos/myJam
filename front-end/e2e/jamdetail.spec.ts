import { test, expect, type Page } from '@playwright/test';
import { mockGuestApi } from './helpers/mockApi';

async function openGuestJamDetail(page: Page) {
  await mockGuestApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: /browse public jams near me/i }).click();
  await page.getByText('Downtown Blues Session').click();
  await expect(page.getByRole('button', { name: /back to jams/i })).toBeVisible();
}

test.describe('JamDetail — guest browser flows', () => {
  test('shows the jam header, location, and sign-in prompt', async ({ page }) => {
    await openGuestJamDetail(page);
    await expect(page.getByRole('heading', { name: 'Downtown Blues Session' })).toBeVisible();
    await expect(page.getByText('123 Main St')).toBeVisible();
    await expect(page.getByText(/sign in to join this jam/i)).toBeVisible();
  });

  test('back button returns to the jam list', async ({ page }) => {
    await openGuestJamDetail(page);
    await page.getByRole('button', { name: /back to jams/i }).click();
    await expect(page.getByRole('button', { name: /discover/i })).toBeVisible();
    await expect(page.getByText('Downtown Blues Session')).toBeVisible();
  });

  test('opens the participant profile modal and closes it', async ({ page }) => {
    await openGuestJamDetail(page);
    await page.getByText('Alex Rivera').click();

    await expect(page.getByText('Lead guitarist')).toBeVisible();
    await page.getByRole('button', { name: '×' }).click();
    await expect(page.getByText('Lead guitarist')).not.toBeVisible();
  });

  test('shows pending participant instruments on the participant cards', async ({ page }) => {
    await openGuestJamDetail(page);
    await expect(page.getByText('Electric Guitar')).toBeVisible();
    await expect(page.getByText('Vocals')).toBeVisible();
  });

  test('opens song detail when a song in the setlist is clicked', async ({ page }) => {
    await openGuestJamDetail(page);
    await page.getByText('Little Wing').click();

    await expect(page.getByRole('button', { name: /back to jam/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Little Wing' })).toBeVisible();
  });
});
