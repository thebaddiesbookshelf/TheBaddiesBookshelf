
/* ==========================================
   TBB — BADDIE PROFILES™
   PROFILE PRIVACY SETTINGS
   Step 1B.9E — Read-only preferences
   ========================================== */

import { db } from './auth.js';

const $ = id => document.getElementById(id);

const PRIVACY_FIELDS = [
  ['profileVisibility', 'profile_visibility'],
  ['bookshelfVisibility', 'bookshelf_visibility'],
  ['activityVisibility', 'activity_visibility'],
  ['favoritesVisibility', 'favorites_visibility']
];

let loadVersion = 0;

function setPrivacyStatus(message, isError = false) {
  const status = $('profilePrivacyStatus');
  if (!status) return;

  status.textContent = message;
  status.classList.toggle('error', isError);
}

function disablePrivacyControls() {
  for (const [elementId] of PRIVACY_FIELDS) {
    const select = $(elementId);

    if (select) {
      select.disabled = true;
    }
  }
}

export async function loadProfilePrivacy(userId) {
  const version = ++loadVersion;

  disablePrivacyControls();

  if (!userId) {
    setPrivacyStatus(
      'Could not identify your account.',
      true
    );
    return;
  }

  setPrivacyStatus('Loading your privacy preferences... 🔐');

  try {
    const { data, error } = await db
      .from('tbb_vanity_settings')
      .select(
        'profile_visibility,' +
        'bookshelf_visibility,' +
        'activity_visibility,' +
        'favorites_visibility'
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (version !== loadVersion) return;

    if (error) throw error;

    if (!data) {
      throw new Error(
        'Your Vanity™ settings record was not found.'
      );
    }

    for (const [elementId, columnName] of PRIVACY_FIELDS) {
      const select = $(elementId);
      if (!select) continue;

      const value = data[columnName];

      const supported = Array.from(select.options)
        .some(option => option.value === value);

      if (!supported) {
        throw new Error(
          `Unsupported privacy value for ${columnName}.`
        );
      }

      select.value = value;
    }

    // Intentionally read-only until database
    // enforcement has been fully verified.
    disablePrivacyControls();

    setPrivacyStatus(
      '🔐 Your saved privacy preferences are displayed. ' +
      'Editing will be available after the remaining ' +
      'privacy protections are connected.'
    );

  } catch (error) {
    if (version !== loadVersion) return;

    disablePrivacyControls();

    setPrivacyStatus(
      `Could not load your privacy preferences: ${error.message}`,
      true
    );
  }
}
