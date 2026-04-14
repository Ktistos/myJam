import { test, expect, type Page } from '@playwright/test';
import {
  defaultAuthenticatedData,
  mockAuthenticatedApi,
  mockAuthenticatedSession,
} from './helpers/mockApi';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function openSignedInApp(page: Page, data = defaultAuthenticatedData) {
  await mockAuthenticatedSession(page, { initialUser: data.authUser });
  await mockAuthenticatedApi(page, data);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /\+ new jam/i })).toBeVisible();
}

test.describe('Active browser options', () => {
  test('join prompt offers a non-vocal instrument list and keeps Vocals as a claimable role', async ({ page }) => {
    const data = clone(defaultAuthenticatedData);
    data.profile.instruments = [{ instrument: 'Vocals', skill_level: 'advanced' }];

    await openSignedInApp(page, data);

    await page.getByText('Downtown Open Jam').click();
    await page.getByRole('button', { name: /join this jam/i }).click();

    await expect(page.getByText(/vocals are always available as a role/i)).toBeVisible();
    await expect(page.getByText(/no non-vocal instruments in your profile yet/i)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Vocals' })).toHaveCount(0);

    const hardwareSelect = page.getByLabel(/additional hardware instrument/i);
    await expect(hardwareSelect.locator('option', { hasText: 'Vocals' })).toHaveCount(0);
    await expect(hardwareSelect.locator('option', { hasText: 'Drums' })).toHaveCount(1);

    await hardwareSelect.selectOption('Drums');
    await page.getByRole('button', { name: /add instrument/i }).click();
    await expect(page.locator('span').filter({ hasText: /^Drums/ }).first()).toBeVisible();

    await page.getByRole('button', { name: /join & add 1 instrument/i }).click();
    await expect(page.getByRole('heading', { name: /joined!/i })).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();

    await expect(
      page.locator('div').filter({ hasText: /Drums\s*from\s*Taylor Stone/ }).first()
    ).toBeVisible();

    await page.getByText('Little Wing').click();
    await expect(page.getByRole('heading', { name: 'Vocals' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Drums' })).toBeVisible();
    await page.getByRole('button', { name: /i'll play/i }).first().click();
    await expect(page.getByRole('button', { name: /leave role/i })).toBeVisible();
  });

  test('profile still lets users persist Vocals as an instrument', async ({ page }) => {
    const data = clone(defaultAuthenticatedData);
    data.profile.instruments = [{ instrument: 'Electric Guitar', skill_level: 'advanced' }];

    await openSignedInApp(page, data);

    await page.getByRole('button', { name: /taylor stone/i }).click();
    await expect(page.getByRole('heading', { name: /your profile/i })).toBeVisible();

    await page.getByLabel(/profile instrument/i).selectOption('Vocals');
    await expect(page.getByPlaceholder(/model/i)).toHaveCount(0);
    await page.getByRole('button', { name: /\+ add instrument/i }).click();
    await expect(page.locator('span').filter({ hasText: /^Vocals$/ }).first()).toBeVisible();

    await page.getByRole('button', { name: /save profile/i }).click();
    await expect(page.getByRole('heading', { name: /saved/i })).toBeVisible();
    await expect(page.getByText(/profile updated/i)).toBeVisible();
  });

  test('available hardware dropdown excludes Vocals and supports add, edit, remove, and generated roles', async ({ page }) => {
    await openSignedInApp(page);

    await page.getByText('House Band Rehearsal').click();
    await expect(page.getByRole('heading', { name: 'House Band Rehearsal' })).toBeVisible();

    const hardwareSelect = page.getByLabel(/hardware instrument/i);
    await expect(hardwareSelect.locator('option', { hasText: 'Vocals' })).toHaveCount(0);
    await expect(hardwareSelect.locator('option', { hasText: 'Keyboard' })).toHaveCount(1);

    await hardwareSelect.selectOption('Keyboard');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(page.getByRole('heading', { name: 'Keyboard' })).toBeVisible();
    await expect(
      page.locator('div').filter({ hasText: /Keyboard\s*from\s*Taylor Stone/ }).first()
    ).toBeVisible();

    await page.getByText('Crossroads').click();
    await expect(page.getByRole('heading', { name: 'Vocals' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Keyboard' })).toBeVisible();
    await page.getByRole('button', { name: /back to jam/i }).click();

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel(/edit hardware instrument/i).fill('Piano');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByRole('heading', { name: 'Piano' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Keyboard' })).toHaveCount(0);

    await page.getByTitle('Remove hardware').click();
    await expect(page.getByText(/no hardware added yet/i)).toBeVisible();
  });

  test('last admin leave deletes the jam from the active browser list', async ({ page }) => {
    await openSignedInApp(page);

    await page.getByText('House Band Rehearsal').click();
    await expect(page.getByRole('button', { name: /leave and delete jam/i })).toBeVisible();

    await page.getByRole('button', { name: /leave and delete jam/i }).click();
    await expect(page.getByRole('heading', { name: /jam deleted/i })).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();

    await expect(page.getByRole('button', { name: /discover/i })).toBeVisible();
    await expect(page.getByText('House Band Rehearsal')).toHaveCount(0);
  });

  test('private jam admins can reveal, copy, and regenerate invite codes', async ({ page }) => {
    await openSignedInApp(page);

    await page.getByRole('button', { name: /\+ new jam/i }).click();
    await page.getByLabel(/jam name/i).fill('Invite Code Rehearsal');
    await page.getByLabel(/date and time/i).fill('2026-07-02T20:00');
    await page.getByLabel(/location/i).fill('Studio B');
    await page.getByLabel(/private \(invite only\)/i).check();
    await page.getByRole('button', { name: /create jam/i }).click();

    await expect(page.getByRole('heading', { name: /success/i })).toBeVisible();
    await expect(page.getByText(/private jam created! invite code:/i)).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();

    await page.getByRole('button', { name: /my jams/i }).click();
    await page.getByText('Invite Code Rehearsal').click();

    await page.getByRole('button', { name: /show invite code/i }).click();
    await expect(page.getByText(/CODE2/i)).toBeVisible();
    await page.getByRole('button', { name: /^copy$/i }).click();
    await expect(page.getByRole('button', { name: /copied/i })).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /regenerate code/i }).click();
    await expect(page.getByRole('heading', { name: /invite code updated/i })).toBeVisible();
    await expect(page.getByText(/new invite code: RGEN01/i)).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();

    await expect(page.getByText('RGEN01')).toBeVisible();
    await expect(page.getByText(/CODE2/i)).toHaveCount(0);
  });

  test('imports multiple songs from pasted playlist text', async ({ page }) => {
    await openSignedInApp(page);

    await page.getByText('House Band Rehearsal').click();
    await page.getByRole('button', { name: /import/i }).first().click();

    await expect(page.getByRole('heading', { name: /import songs/i })).toBeVisible();
    await page.getByRole('button', { name: /playlist text/i }).click();
    await page.getByLabel(/^playlist$/i).fill('Use Me - Bill Withers\nValerie by Amy Winehouse');
    await page.getByRole('button', { name: /preview playlist/i }).click();

    await expect(page.getByLabel(/song 1 title/i)).toHaveValue('Use Me');
    await expect(page.getByLabel(/song 2 title/i)).toHaveValue('Valerie');

    await page.getByRole('button', { name: /import 2 songs/i }).click();
    await expect(page.getByRole('heading', { name: /imported/i })).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();

    await expect(page.getByText('Use Me')).toBeVisible();
    await expect(page.getByText('Valerie')).toBeVisible();
  });

  test('imports one song from a Spotify track link', async ({ page }) => {
    await openSignedInApp(page);

    await page.getByText('House Band Rehearsal').click();
    await page.getByRole('button', { name: /import/i }).first().click();

    await expect(page.getByRole('heading', { name: /import songs/i })).toBeVisible();
    await page
      .getByPlaceholder(/spotify|youtube/i)
      .fill('https://open.spotify.com/track/mock-track-id');
    await page.getByRole('button', { name: /import song/i }).click();

    await expect(page.getByRole('heading', { name: /^added$/i })).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();
    await expect(page.getByText('Mock Spotify Song')).toBeVisible();
    await expect(page.getByText('Mock Spotify Artist')).toBeVisible();
  });

  test('imports multiple songs from a Spotify playlist link', async ({ page }) => {
    await openSignedInApp(page);

    await page.getByText('House Band Rehearsal').click();
    await page.getByRole('button', { name: /import/i }).first().click();

    await expect(page.getByRole('heading', { name: /import songs/i })).toBeVisible();
    await page.getByRole('button', { name: /playlist link/i }).click();
    await page
      .getByPlaceholder(/playlist/i)
      .fill('https://open.spotify.com/playlist/mock-playlist-id');
    await page.getByRole('button', { name: /preview playlist/i }).click();

    await expect(page.getByLabel(/song 1 title/i)).toHaveValue('Mock Playlist Song');
    await expect(page.getByLabel(/song 2 title/i)).toHaveValue('Second Playlist Song');

    await page.getByRole('button', { name: /import 2 songs/i }).click();
    await expect(page.getByRole('heading', { name: /imported/i })).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();

    await expect(page.getByText('Mock Playlist Song')).toBeVisible();
    await expect(page.getByText('Second Playlist Song')).toBeVisible();
  });
});
