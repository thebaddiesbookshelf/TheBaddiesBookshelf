
/* ==========================================
   TBB 2.0 — PHASE 6: FRIENDS™
   FRIENDSHIP PREFERENCES
   ========================================== */

import { db } from './auth.js';

const $ = id => document.getElementById(id);

let activeUserId = null;
let savedPreference = true;
let saving = false;

function setStatus(text, error = false) {
  const status = $('friendshipPreferenceStatus');
  if (!status) return;

  status.textContent = text;
  status.classList.toggle('error', error);
}

export async function loadFriendPreferences(userId) {
  if (!userId) return;

  activeUserId = userId;

  const toggle = $('friendRequestsEnabled');
  if (!toggle) return;

  toggle.disabled = true;
  setStatus('Loading your friendship preferences...');

  try {
    const { data, error } = await db
      .from('tbb_vanity_settings')
      .select('friend_requests_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error(
        'Your Vanity™ settings record was not found.'
      );
    }

    savedPreference =
      data.friend_requests_enabled === true;

    toggle.checked = savedPreference;
    toggle.disabled = false;

    setStatus(
      savedPreference
        ? '💗 Bestie requests are currently ON.'
        : '🔒 Bestie requests are currently OFF.'
    );

  } catch (error) {
    toggle.disabled = true;
    setStatus(
      `Could not load your preferences: ${error.message}`,
      true
    );
  }
}

export async function saveFriendPreference(enabled) {
  if (!activeUserId || saving) return;

  const toggle = $('friendRequestsEnabled');
  if (!toggle) return;

  saving = true;
  toggle.disabled = true;

  setStatus('Saving your friendship preference... 💌');

  try {
    const { data, error } = await db
      .from('tbb_vanity_settings')
      .update({
        friend_requests_enabled: enabled
      })
      .eq('user_id', activeUserId)
      .select('friend_requests_enabled');

    if (error) throw error;

    if (!data?.length) {
      throw new Error(
        'Your preference was not saved. Check permissions.'
      );
    }

    savedPreference =
      data[0].friend_requests_enabled === true;

    toggle.checked = savedPreference;

    setStatus(
      savedPreference
        ? '💗 Bestie requests are now ON!'
        : '🔒 Bestie requests are now OFF!'
    );

  } catch (error) {
    toggle.checked = savedPreference;

    setStatus(
      `Could not save your preference: ${error.message}`,
      true
    );

  } finally {
    saving = false;
    toggle.disabled = false;
  }
}
