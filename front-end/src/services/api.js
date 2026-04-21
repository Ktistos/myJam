import { auth } from './firebase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
export const API_BASE = BASE;

async function request(path, options = {}) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    const detail = err.detail;
    let message;
    if (Array.isArray(detail)) {
      message = detail.map((d) => `${d.loc?.slice(-1)[0] ?? 'field'}: ${d.msg}`).join(', ');
    } else if (detail && typeof detail === 'object') {
      message = detail.message ?? JSON.stringify(detail);
    } else {
      message = detail ?? 'Request failed';
    }
    const error = new Error(message);
    error.status = res.status;
    error.detail = detail;
    throw error;
  }
  if (res.status === 204) return null;
  const contentType = res.headers?.get?.('Content-Type') ?? '';
  if (!contentType.includes('application/json')) return null;
  return res.json();
}

// ── Users ─────────────────────────────────────────────────────────────────────

export const createUser = (data)        => request('/users',    { method: 'POST', body: JSON.stringify(data) });
export const getMe      = ()            => request('/users/me');
export const getUser    = (id)          => request(`/users/${id}`);
export const updateMe   = (data)        => request('/users/me', { method: 'PATCH', body: JSON.stringify(data) });

// ── Spotify ──────────────────────────────────────────────────────────────────

export const getSpotifyStatus     = () => request('/spotify/status');
export const createSpotifyLoginUrl = () => request('/spotify/login');
export const disconnectSpotify    = () => request('/spotify/disconnect', { method: 'POST' });

// ── Jams ──────────────────────────────────────────────────────────────────────

export const listJams         = ()            => request('/jams');
export const getJam           = (id)          => request(`/jams/${id}`);
export const createJam        = (data)        => request('/jams',                 { method: 'POST',   body: JSON.stringify(data) });
export const updateJam        = (id, data)    => request(`/jams/${id}`,           { method: 'PATCH',  body: JSON.stringify(data) });
export const deleteJam        = (id)          => request(`/jams/${id}`,           { method: 'DELETE' });
export const getJamByCode     = (code)        => request(`/jams/invite/${encodeURIComponent(code)}`);
export const regenerateInviteCode = (id)      => request(`/jams/${id}/invite-code`, { method: 'POST' });
export const listParticipants = (id)          => request(`/jams/${id}/participants`);
export const joinJam          = (id, code)    => request(
  `/jams/${id}/join${code ? `?invite_code=${encodeURIComponent(code)}` : ''}`,
  { method: 'POST' }
);
export const leaveJam         = (id)          => request(`/jams/${id}/leave`,     { method: 'POST' });
export const removeParticipant = (jamId, uid) => request(`/jams/${jamId}/participants/${uid}`, { method: 'DELETE' });
export const listHardware     = (id)             => request(`/jams/${id}/hardware`);
export const submitHardware   = (id, instrument) => request(`/jams/${id}/hardware?instrument=${encodeURIComponent(instrument)}`, { method: 'POST' });
export const updateHardware   = (jamId, hwId, data) => request(`/jams/${jamId}/hardware/${hwId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const removeHardware   = (jamId, hwId)    => request(`/jams/${jamId}/hardware/${hwId}`, { method: 'DELETE' });
export const approveHardware  = (jamId, hwId)    => request(`/jams/${jamId}/hardware/${hwId}/approve`, { method: 'PATCH' });
export const rejectHardware   = (jamId, hwId)    => request(`/jams/${jamId}/hardware/${hwId}/reject`, { method: 'PATCH' });
export const addAdmin         = (jamId, uid)  => request(`/jams/${jamId}/admins/${uid}`, { method: 'POST' });
export const removeAdmin      = (jamId, uid)  => request(`/jams/${jamId}/admins/${uid}`, { method: 'DELETE' });
export const createJamEventToken = (jamId)    => request(`/events/jam/${jamId}/token`,   { method: 'POST' });

// ── Songs ─────────────────────────────────────────────────────────────────────

export const listSongs   = (jamId)           => request(`/songs/jam/${jamId}`);
export const importSongMetadata = (url)      => request('/songs/import/metadata', { method: 'POST', body: JSON.stringify({ url }) });
export const importPlaylistMetadata = (url)  => request('/songs/import/playlist', { method: 'POST', body: JSON.stringify({ url }) });
export const submitSong  = (jamId, data)     => request(`/songs/jam/${jamId}`,  { method: 'POST',   body: JSON.stringify(data) });
export const updateSong  = (id, data)        => request(`/songs/${id}`,         { method: 'PATCH',  body: JSON.stringify(data) });
export const deleteSong  = (id)              => request(`/songs/${id}`,         { method: 'DELETE' });

// ── Roles ─────────────────────────────────────────────────────────────────────

export const listRoles   = (songId)  => request(`/songs/${songId}/roles`);
export const claimRole   = (roleId)  => request(`/songs/roles/${roleId}/claim`,   { method: 'POST' });
export const leaveRole   = (roleId)  => request(`/songs/roles/${roleId}/leave`,   { method: 'POST' });
export const approveRole = (roleId)  => request(`/songs/roles/${roleId}/approve`, { method: 'PATCH' });
export const rejectRole  = (roleId)  => request(`/songs/roles/${roleId}/reject`,  { method: 'PATCH' });

// ── Uploads ───────────────────────────────────────────────────────────────────

export async function uploadAvatar(file) {
  const token = await auth.currentUser?.getIdToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/uploads/avatar`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json(); // { url }
}
