/**
 * Client API for audio/video calls.
 * Communicates with the backend callRoutes.
 */

import { backendAuthFetch } from './backendAuthApi';

/** Initiate a call to a user. */
export async function callsInitiate(calleeId) {
  const data = await backendAuthFetch('POST', '/api/calls/initiate', { callee_id: calleeId });
  return data;
}

/** Get a LiveKit token to join an existing call room. */
export async function callsJoinToken(callId) {
  const data = await backendAuthFetch('POST', `/api/calls/${encodeURIComponent(callId)}/join`);
  return data;
}

/** Accept an incoming call (callee). Returns the join token. */
export async function callsAccept(callId) {
  const data = await backendAuthFetch(
    'POST',
    `/api/calls/${encodeURIComponent(callId)}/accept`,
  );
  return data;
}

/** End an ongoing call. Either participant can end. */
export async function callsEnd(callId) {
  const data = await backendAuthFetch(
    'POST',
    `/api/calls/${encodeURIComponent(callId)}/end`,
  );
  return data;
}

/** Decline an incoming call (callee only). */
export async function callsDecline(callId) {
  await backendAuthFetch(
    'POST',
    `/api/calls/${encodeURIComponent(callId)}/decline`,
  );
}

/** Poll for pending incoming calls. */
export async function callsListPending() {
  const data = await backendAuthFetch('GET', '/api/calls/pending');
  return data;
}

/** Get a single call by ID (for status polling). */
export async function callsGetStatus(callId) {
  const data = await backendAuthFetch(
    'GET',
    `/api/calls/${encodeURIComponent(callId)}`,
  );
  return data;
}

/** Get call history. */
export async function callsHistory(limit = 50) {
  const data = await backendAuthFetch(
    'GET',
    `/api/calls/history?limit=${Math.min(100, Math.max(1, limit))}`,
  );
  return data;
}
