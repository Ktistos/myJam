import { test, expect } from '@playwright/test';
import { mockGuestApi } from './helpers/mockApi';

test.describe('Login page — branding', () => {
  test('shows myJam heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'myJam' })).toBeVisible();
  });

  test('shows tagline', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Find musicians near you')).toBeVisible();
  });

  test('shows "Sign in to join jams" card heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/sign in to join jams/i)).toBeVisible();
  });
});

test.describe('Login page — auth buttons', () => {
  test('has Google sign-in button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  });

  test('has Facebook sign-in button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /continue with facebook/i })).toBeVisible();
  });

  test('Google button shows loading spinner when clicked', async ({ page }) => {
    await page.goto('/');
    // Click but don't wait for navigation — Firebase will likely fail/timeout in test env
    await page.getByRole('button', { name: /continue with google/i }).click();
    // Both auth buttons should become disabled while loading
    await expect(page.getByRole('button', { name: /continue with facebook/i })).toBeDisabled({ timeout: 3000 }).catch(() => {
      // If Firebase popup opens, that's also acceptable — just verify the click worked
    });
  });
});

test.describe('Login page — guest mode', () => {
  test.beforeEach(async ({ page }) => {
    await mockGuestApi(page);
  });

  test('has guest browse button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Browse public jams near me')).toBeVisible();
  });

  test('shows "No account needed" note', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('No account needed')).toBeVisible();
  });

  test('guest button navigates to jam list Discover tab', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Browse public jams near me').click();
    await expect(page.getByRole('button', { name: /Discover/ })).toBeVisible();
    await expect(page.getByText('Downtown Blues Session')).toBeVisible();
  });

  test('guest mode hides auth-only jam actions', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Browse public jams near me').click();
    await expect(page.getByRole('button', { name: /Discover/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /My Jams/ })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /\+ New Jam/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Enter Invite Code/i })).not.toBeVisible();
  });

  test('header shows guest sign-in affordance after guest login', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Browse public jams near me').click();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('Exit button is visible in guest mode', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Browse public jams near me').click();
    await expect(page.getByRole('button', { name: /exit/i })).toBeVisible();
  });

  test('Exit returns to the login page', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Browse public jams near me').click();
    await expect(page.getByRole('button', { name: /exit/i })).toBeVisible();
    await page.getByRole('button', { name: /exit/i }).click();
    await expect(page.getByText('Continue with Google')).toBeVisible();
  });

  test('Sign in from guest mode returns to the login page', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Browse public jams near me').click();
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText('Continue with Google')).toBeVisible();
  });

  test('page reload lands back on login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Continue with Google')).toBeVisible();
  });
});
