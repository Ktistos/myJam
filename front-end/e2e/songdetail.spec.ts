import { test, expect, type Page } from '@playwright/test';
import { mockGuestApi } from './helpers/mockApi';

async function openGuestSongDetail(page: Page) {
  await mockGuestApi(page);
  await page.goto('/');
  await page.getByRole('button', { name: /browse public jams near me/i }).click();
  await page.getByText('Downtown Blues Session').click();
  await page.getByText('Little Wing').click();
  await expect(page.getByRole('button', { name: /back to jam/i })).toBeVisible();
}

test.describe('SongDetail — guest browser flows', () => {
  test('renders the song title, artist, and role list', async ({ page }) => {
    await openGuestSongDetail(page);
    await expect(page.getByRole('heading', { name: 'Little Wing' })).toBeVisible();
    await expect(page.getByText('Jimi Hendrix')).toBeVisible();
    await expect(page.getByText('Vocals')).toBeVisible();
    await expect(page.getByText('Electric Guitar')).toBeVisible();
  });

  test('shows open and taken role badges from mocked data', async ({ page }) => {
    await openGuestSongDetail(page);
    await expect(page.getByText('Open', { exact: true })).toBeVisible();
    await expect(page.getByText('Taken', { exact: true })).toBeVisible();
  });

  test('does not show role action buttons for guest viewers', async ({ page }) => {
    await openGuestSongDetail(page);
    await expect(page.getByRole('button', { name: /i'll play/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /apply/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /leave role/i })).not.toBeVisible();
  });

  test('back button returns to the jam detail view', async ({ page }) => {
    await openGuestSongDetail(page);
    await page.getByRole('button', { name: /back to jam/i }).click();
    await expect(page.getByRole('button', { name: /back to jams/i })).toBeVisible();
    await expect(page.getByText('Downtown Blues Session')).toBeVisible();
  });
});
