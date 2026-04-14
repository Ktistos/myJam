import { test, expect, type Page } from '@playwright/test';
import { defaultMockData, mockGuestApi, setMockLocation } from './helpers/mockApi';

async function openGuestJamList(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /browse public jams near me/i }).click();
  await expect(page.getByRole('button', { name: /discover/i })).toBeVisible();
}

test.describe('JamList — guest browser flows', () => {
  test('renders the mocked public jams', async ({ page }) => {
    await mockGuestApi(page);
    await openGuestJamList(page);
    await expect(page.getByText('Downtown Blues Session')).toBeVisible();
    await expect(page.getByText('Mountain Jam')).toBeVisible();
  });

  test('shows state badges only for non-initial jams', async ({ page }) => {
    await mockGuestApi(page);
    await openGuestJamList(page);
    await expect(page.getByText('Tuning')).toBeVisible();
    await expect(page.getByText('Initial')).not.toBeVisible();
  });

  test('opens jam detail when a jam card is clicked', async ({ page }) => {
    await mockGuestApi(page);
    await openGuestJamList(page);
    await page.getByText('Downtown Blues Session').click();
    await expect(page.getByRole('button', { name: /back to jams/i })).toBeVisible();
    await expect(page.getByText('123 Main St')).toBeVisible();
  });

  test('enables location filtering after the location button is clicked', async ({ page, context }) => {
    await mockGuestApi(page);
    await setMockLocation(context);
    await openGuestJamList(page);

    await page.getByRole('button', { name: /enable location for radius filter/i }).click();
    await expect(page.getByText(/location active/i)).toBeVisible();
    await expect(page.locator('select')).toBeEnabled();
  });

  test('filters out far-away jams when a short radius is selected', async ({ page, context }) => {
    await mockGuestApi(page);
    await setMockLocation(context);
    await openGuestJamList(page);

    await page.getByRole('button', { name: /enable location for radius filter/i }).click();
    await page.locator('select').selectOption('10');

    await expect(page.getByText('Downtown Blues Session')).toBeVisible();
    await expect(page.getByText('Mountain Jam')).not.toBeVisible();
  });

  test('restores the full list when radius returns to Any distance', async ({ page, context }) => {
    await mockGuestApi(page);
    await setMockLocation(context);
    await openGuestJamList(page);

    await page.getByRole('button', { name: /enable location for radius filter/i }).click();
    await page.locator('select').selectOption('10');
    await expect(page.getByText('Mountain Jam')).not.toBeVisible();

    await page.locator('select').selectOption('');
    await expect(page.getByText('Mountain Jam')).toBeVisible();
  });

  test('shows the empty-state message when the radius filter excludes all jams', async ({ page, context }) => {
    await mockGuestApi(page, {
      ...defaultMockData,
      jams: [defaultMockData.jams[1]],
    });
    await setMockLocation(context);
    await openGuestJamList(page);

    await page.getByRole('button', { name: /enable location for radius filter/i }).click();
    await page.locator('select').selectOption('10');

    await expect(page.getByText(/no public jams found/i)).toBeVisible();
    await expect(page.getByText(/no jams within 10 km/i)).toBeVisible();
  });
});
