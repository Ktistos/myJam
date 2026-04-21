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

test.describe('Admin and invite browser flows', () => {
  test('joins a private jam via invite code and shows it in My Jams', async ({ page }) => {
    await openSignedInApp(page);

    await page.getByRole('button', { name: /enter invite code/i }).click();
    await page.getByPlaceholder(/rock42/i).fill('FUNK42');
    await page.getByRole('button', { name: /^join$/i }).click();

    await expect(page.getByRole('heading', { name: /join invite only funk lab/i })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Vocals' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Electric Guitar' }).check();
    await page.getByRole('button', { name: /join & add 1 instrument/i }).click();

    await expect(page.getByText(/you are now a participant/i)).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();

    await page.getByRole('button', { name: /my jams/i }).click();
    await expect(page.getByText('Invite Only Funk Lab')).toBeVisible();

    await page.getByText('Invite Only Funk Lab').click();
    await expect(page.getByText(/\(you\)/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Electric Guitar' }).first()).toBeVisible();
  });

  test('approves a pending song submission from the admin panel', async ({ page }) => {
    const data = clone(defaultAuthenticatedData);
    const adminJam = data.jams.find((jam) => jam.id === 'jam-admin');
    if (!adminJam) throw new Error('Missing jam-admin fixture');
    adminJam.require_song_approval = true;

    data.participantsByJamId['jam-admin'].push({
      user: {
        id: 'uid-submitter',
        name: 'Morgan Keys',
        bio: 'Keys player.',
        recording_link: '',
        avatar_url: '',
        instruments: [{ instrument: 'Keyboard', skill_level: 'advanced' }],
      },
      joined_at: '2026-06-12T18:50:00.000Z',
    });

    data.songsByJamId['jam-admin'].push({
      id: 'song-pending-1',
      jam_id: 'jam-admin',
      title: 'Midnight Rider',
      artist: 'The Allman Brothers Band',
      status: 'pending',
      submitted_by: 'uid-submitter',
      submitted_by_name: 'Morgan Keys',
      created_at: '2026-06-12T18:55:00.000Z',
    });

    await openSignedInApp(page, data);

    await page.getByText('House Band Rehearsal').click();
    const pendingSongText = page.getByText(/morgan keys wants to add .*midnight rider/i);
    await expect(pendingSongText).toBeVisible();
    const pendingSongCard = pendingSongText.locator('..').locator('..');

    await pendingSongCard.getByRole('button', { name: '✓' }).click();

    await expect(pendingSongText).toHaveCount(0);
    await expect(page.getByText('Midnight Rider')).toBeVisible();
  });

  test('approves a pending role application from the admin panel', async ({ page }) => {
    const data = clone(defaultAuthenticatedData);
    const adminJam = data.jams.find((jam) => jam.id === 'jam-admin');
    if (!adminJam) throw new Error('Missing jam-admin fixture');
    adminJam.require_role_approval = true;

    data.participantsByJamId['jam-admin'].push({
      user: {
        id: 'uid-singer',
        name: 'Jamie Cross',
        bio: 'Soul vocalist.',
        recording_link: '',
        avatar_url: '',
        instruments: [{ instrument: 'Vocals', skill_level: 'advanced' }],
      },
      joined_at: '2026-06-12T18:45:00.000Z',
    });

    const role = data.rolesBySongId['song-admin-1'].find((item) => item.id === 'role-admin-open');
    if (!role) throw new Error('Missing role-admin-open fixture');
    role.pending_user = 'uid-singer';
    role.pending_user_name = 'Jamie Cross';

    await openSignedInApp(page, data);

    await page.getByText('House Band Rehearsal').click();
    const pendingRoleText = page.getByText(/jamie cross wants to play vocals on .*crossroads/i);
    await expect(pendingRoleText).toBeVisible();
    const pendingRoleCard = pendingRoleText.locator('..').locator('..');

    await pendingRoleCard.getByRole('button', { name: '✓' }).click();

    await expect(pendingRoleText).toHaveCount(0);

    await page.getByText('Crossroads').click();
    await expect(page.getByText(/playing:\s*jamie cross/i)).toBeVisible();
  });

  test('removes a participant and clears their hardware and pending role claims', async ({ page }) => {
    const data = clone(defaultAuthenticatedData);
    const adminJam = data.jams.find((jam) => jam.id === 'jam-admin');
    if (!adminJam) throw new Error('Missing jam-admin fixture');
    adminJam.require_role_approval = true;
    adminJam.participant_count = 2;

    data.participantsByJamId['jam-admin'].push({
      user: {
        id: 'uid-removable',
        name: 'Jamie Cross',
        bio: 'Soul vocalist.',
        recording_link: '',
        avatar_url: '',
        instruments: [
          { instrument: 'Vocals', skill_level: 'advanced' },
          { instrument: 'Drums', skill_level: 'intermediate' },
        ],
      },
      joined_at: '2026-06-12T18:45:00.000Z',
    });
    data.hardwareByJamId = {
      ...data.hardwareByJamId,
      'jam-admin': [
        {
          id: 'hw-removable-drums',
          instrument: 'Drums',
          owner_id: 'uid-removable',
          owner_name: 'Jamie Cross',
          status: 'approved',
        },
      ],
    };
    data.rolesBySongId['song-admin-1'].push({
      id: 'role-removable-drums',
      song_id: 'song-admin-1',
      instrument: 'Drums',
      owner_id: 'uid-removable',
      owner_name: 'Jamie Cross',
      joined_by: null,
      joined_by_name: null,
      pending_user: null,
      pending_user_name: null,
    });
    const vocalsRole = data.rolesBySongId['song-admin-1'].find((item) => item.id === 'role-admin-open');
    if (!vocalsRole) throw new Error('Missing role-admin-open fixture');
    vocalsRole.pending_user = 'uid-removable';
    vocalsRole.pending_user_name = 'Jamie Cross';

    await openSignedInApp(page, data);

    await page.getByText('House Band Rehearsal').click();
    await expect(page.getByText(/jamie cross wants to play vocals on .*crossroads/i)).toBeVisible();
    await expect(page.locator('div').filter({ hasText: /Drums\s*from\s*Jamie Cross/ }).first()).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Remove Jamie Cross from this jam?');
      await dialog.accept();
    });
    await page.getByRole('button', { name: /remove jamie cross from jam/i }).click();

    await expect(page.getByRole('heading', { name: /participant removed/i })).toBeVisible();
    await page.getByRole('button', { name: /close/i }).click();

    await expect(page.getByText(/jamie cross wants to play vocals/i)).toHaveCount(0);
    await expect(page.locator('div').filter({ hasText: /Drums\s*from\s*Jamie Cross/ })).toHaveCount(0);

    await page.getByText('Crossroads').click();
    await expect(page.getByRole('heading', { name: 'Drums' })).toHaveCount(0);
    await expect(page.getByText(/pending:\s*jamie cross/i)).toHaveCount(0);
  });

  test('advances the jam state and sets the current song in progress', async ({ page }) => {
    const data = clone(defaultAuthenticatedData);
    data.songsByJamId['jam-admin'].push({
      id: 'song-admin-2',
      jam_id: 'jam-admin',
      title: 'Sunshine of Your Love',
      artist: 'Cream',
      status: 'approved',
      submitted_by: 'uid-auth',
      submitted_by_name: 'Taylor Stone',
      created_at: '2026-06-12T18:45:00.000Z',
    });

    await openSignedInApp(page, data);

    await page.getByText('House Band Rehearsal').click();
    await page.getByRole('button', { name: /tuning/i }).click();
    await expect(page.getByRole('button', { name: /start/i })).toBeVisible();

    await page.getByRole('button', { name: /in progress/i }).click();
    await expect(page.getByRole('heading', { name: /current song/i })).toBeVisible();
    await expect(page.getByText(/no song playing/i)).toBeVisible();

    await page.getByRole('button', { name: '»»' }).click();

    await expect(page.getByText(/no song playing/i)).toHaveCount(0);
    await expect(page.getByText('NOW PLAYING', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /switch to sunshine of your love/i }).click();

    await expect(page.getByRole('button', { name: /switch to crossroads/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /switch to sunshine of your love/i })).toHaveCount(0);
  });
});
