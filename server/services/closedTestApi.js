import fs from 'fs';
import path from 'path';
import { getSettings } from '../db/store.js';

export const CLOSED_TEST_API_DEFAULT = 'https://p01--backend-rs--7tlh8kl746cq.code.run';
export const R2_WORKER_URL = 'https://r2-image-worker.neerajsec.workers.dev';

const CRED_PATH = () =>
  path.resolve(process.cwd(), 'data', 'credentials', 'closed-test.json');

export function loadClosedTestCredentials() {
  const settings = getSettings() || {};
  let file = {};
  try {
    if (fs.existsSync(CRED_PATH())) {
      file = JSON.parse(fs.readFileSync(CRED_PATH(), 'utf8'));
    }
  } catch {}
  return {
    clerkJwt: String(settings.closedTestClerkJwt || file.clerkJwt || process.env.CLOSED_TEST_CLERK_JWT || '').trim(),
    apiBase: String(
      settings.closedTestApiBase || file.apiBase || process.env.CLOSED_TEST_API_BASE || CLOSED_TEST_API_DEFAULT
    ).replace(/\/+$/, ''),
  };
}

export function saveClosedTestCredentials(updates = {}) {
  const dir = path.dirname(CRED_PATH());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const prev = loadClosedTestCredentials();
  const next = {
    clerkJwt: updates.clerkJwt != null ? String(updates.clerkJwt).trim() : prev.clerkJwt,
    apiBase: updates.apiBase != null ? String(updates.apiBase).replace(/\/+$/, '') : prev.apiBase,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(CRED_PATH(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

async function request(method, apiPath, { body, query, token, apiBase } = {}) {
  const creds = loadClosedTestCredentials();
  const base = apiBase || creds.apiBase;
  const jwt = token || creds.clerkJwt;
  if (!jwt) {
    const err = new Error(
      'Missing ClosedTest Clerk JWT. Paste a session token in Settings → ClosedTest JWT (from the signed-in TheClosedTest app / Clerk session).'
    );
    err.code = 'MISSING_JWT';
    throw err;
  }

  const url = new URL(apiPath.startsWith('http') ? apiPath : `${base}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers = {
    Authorization: `Bearer ${jwt}`,
    Accept: 'application/json',
  };
  let payload;
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || data?.raw || res.statusText || `HTTP ${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const closedTestApi = {
  me: () => request('GET', '/api/users/me'),
  syncUser: () => request('POST', '/api/users/sync', { body: {} }),
  confirmGroup: () => request('PATCH', '/api/users/group-confirm', { body: { confirmed: true } }),
  checkin: () => request('POST', '/api/users/checkin', { body: {} }),
  myApps: () => request('GET', '/api/apps/my'),
  listApps: (params = {}) => request('GET', '/api/apps', { query: params }),
  createApp: (body) => request('POST', '/api/apps', { body }),
  requestMatch: (body) => request('POST', '/api/matches/request', { body }),
  listMatches: (status) => request('GET', '/api/matches', { query: status ? { status } : {} }),
  acceptMatch: (id) => request('POST', `/api/matches/${id}/accept`, { body: {} }),
  rejectMatch: (id) => request('POST', `/api/matches/${id}/reject`, { body: {} }),
  submitProof: (body) => request('POST', '/api/proofs', { body }),
  listProofs: (matchId) => request('GET', `/api/proofs/match/${matchId}`),
  reviewProof: (id, body) => request('POST', `/api/proofs/${id}/review`, { body }),
  presignedUrl: (body) => request('POST', '/api/storage/presigned-url', { body }),
};

/** Match day 1–14 using IST calendar (same as TheClosedTest app). */
export function getMatchCurrentDay(startDate, createdAt, highestProofDay = 1) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const istDay = (d) => {
    if (!d) return 0;
    const ms = new Date(d).getTime();
    if (Number.isNaN(ms)) return 0;
    return Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
  };
  const start = startDate || createdAt;
  if (!start) return Math.min(14, Math.max(1, highestProofDay));
  const elapsed = Math.max(0, istDay(Date.now()) - istDay(start));
  return Math.min(14, Math.max(elapsed + 1, highestProofDay, 1));
}

export async function uploadFileToR2(localPath, { folder = 'proofs', contentType } = {}) {
  const buf = fs.readFileSync(localPath);
  const ext = path.extname(localPath).toLowerCase() || '.png';
  const mime =
    contentType ||
    (ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png');
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
  const key = `${folder}/${name}`;

  // Prefer direct worker PUT (same as mobile app)
  const directUrl = `${R2_WORKER_URL}/${key}`;
  try {
    const put = await fetch(directUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mime },
      body: buf,
    });
    if (put.ok) return directUrl;
  } catch {}

  // Fallback: API presigned URL
  try {
    const signed = await closedTestApi.presignedUrl({
      folder,
      contentType: mime,
      filename: name,
    });
    const uploadUrl = signed?.uploadUrl || signed?.url;
    const publicUrl = signed?.publicUrl || signed?.url || directUrl;
    if (uploadUrl) {
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: buf,
      });
      if (put.ok) return publicUrl;
    }
  } catch {}

  throw new Error(`Failed to upload ${path.basename(localPath)} to ClosedTest R2 storage`);
}

export function resolvePartnerApp(match, myAppIds = [], meId = null) {
  if (match?.partnerApp) return match.partnerApp;
  if (typeof match?.isUser1 === 'boolean') return match.isUser1 ? match.app2 : match.app1;
  if (myAppIds.includes(match.app1Id)) return match.app2 || match.partnerApp;
  if (myAppIds.includes(match.app2Id)) return match.app1 || match.partnerApp;
  if (meId && match.user1Id === meId) return match.app2;
  if (meId && match.user2Id === meId) return match.app1;
  return match.app2 || match.app1;
}

export function resolveMyApp(match, myAppIds = [], meId = null) {
  if (match?.myApp) return match.myApp;
  if (typeof match?.isUser1 === 'boolean') return match.isUser1 ? match.app1 : match.app2;
  if (myAppIds.includes(match.app1Id)) return match.app1;
  if (myAppIds.includes(match.app2Id)) return match.app2;
  if (meId && match.user1Id === meId) return match.app1;
  if (meId && match.user2Id === meId) return match.app2;
  return match.app1 || match.app2;
}
