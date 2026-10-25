
/* ==========================================
   TBB — BADDIE PROFILES™
   PROFILE PRIVACY SETTINGS
   Step 1B.9I — Privacy Preferences
   ========================================== */

import { db } from './auth.js';

const $ = id => document.getElementById(id);

const PRIVACY_FIELDS = [
  ['profileVisibility', 'profile_visibility'],
  ['bookshelfVisibility', 'bookshelf_visibility'],
  ['activityVisibility', 'activity_visibility'],
  ['favoritesVisibility', 'favorites_visibility']
];

const ALLOWED_VALUES = new Set(['members', 'friends']);

let loadVersion = 0;
let privacyReady = false;
let privacySaving = false;
let loadedUserId = null;

function setPrivacyStatus(message, isError = false) {
  const status = $('profilePrivacyStatus');
  if (!status) return;

  status.textContent = message;
  status.classList.toggle('error', isError);
}

function setPrivacyControlsDisabled(disabled) {
  for (const [elementId] of PRIVACY_FIELDS) {
    const select = $(elementId);

    if (select) {
      select.disabled = disabled;
    }
  }

  // Keep the Save button synchronized with
  // the privacy dropdowns.
  const saveButton = $('saveProfilePrivacy');

  if (saveButton) {
    saveButton.disabled = disabled;
  }
}

function readPrivacyValues() {
  const updates = {};

  for (const [elementId, columnName] of PRIVACY_FIELDS) {
    const select = $(elementId);

    if (!select) {
      throw new Error(
        `Missing privacy control: ${elementId}.`
      );
    }

    if (!ALLOWED_VALUES.has(select.value)) {
      throw new Error(
        `Unsupported privacy value for ${columnName}.`
      );
    }

    updates[columnName] = select.value;
  }

  return updates;
}

export async function loadProfilePrivacy(userId) {
  const version = ++loadVersion;

  privacyReady = false;
  loadedUserId = null;

  setPrivacyControlsDisabled(true);

  if (!userId) {
    setPrivacyStatus(
      'Could not identify your account.',
      true
    );
    return;
  }

  setPrivacyStatus(
    'Loading your privacy preferences... 🔐'
  );

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

      if (!select) {
        throw new Error(
          `Missing privacy control: ${elementId}.`
        );
      }

      const value = data[columnName];

      if (!ALLOWED_VALUES.has(value)) {
        throw new Error(
          `Unsupported privacy value for ${columnName}.`
        );
      }

      const supported = Array.from(select.options)
        .some(option => option.value === value);

      if (!supported) {
        throw new Error(
          `Privacy option unavailable: ${columnName}.`
        );
      }

      select.value = value;
    }

    loadedUserId = userId;
    privacyReady = true;

    // Privacy preferences are ready for the
// authenticated profile owner to edit.
setPrivacyControlsDisabled(false);

const saveButton = $('saveProfilePrivacy');

if (saveButton) {
  saveButton.disabled = false;
}

setPrivacyStatus(
  '🔐 Your privacy preferences are ready to customize, Baddie! 💗'
);
  } catch (error) {
    if (version !== loadVersion) return;

    privacyReady = false;
    loadedUserId = null;

    setPrivacyControlsDisabled(true);

    setPrivacyStatus(
      `Could not load your privacy preferences: ${error.message}`,
      true
    );
  }
}

export async function saveProfilePrivacy() {
  if (!privacyReady || privacySaving || !loadedUserId) {
    throw new Error(
      'Privacy preferences are not ready to save.'
    );
  }

  const { data: authData, error: authError } =
    await db.auth.getUser();

  if (authError) throw authError;

  if (authData?.user?.id !== loadedUserId) {
    throw new Error(
      'You can only update your own privacy preferences.'
    );
  }

  const updates = readPrivacyValues();

  privacySaving = true;
  setPrivacyControlsDisabled(true);

  setPrivacyStatus(
    'Saving your privacy preferences... 🔐'
  );

  try {
    const { data, error } = await db
      .from('tbb_vanity_settings')
      .update(updates)
      .eq('user_id', loadedUserId)
      .select(
        'profile_visibility,' +
        'bookshelf_visibility,' +
        'activity_visibility,' +
        'favorites_visibility'
      )
      .single();

    if (error) throw error;

    if (!data) {
      throw new Error(
        'Supabase did not confirm your privacy update.'
      );
    }

    for (const [columnName, expectedValue] of
      Object.entries(updates)) {
      if (data[columnName] !== expectedValue) {
        throw new Error(
          `Privacy save verification failed: ${columnName}.`
        );
      }
    }

    setPrivacyStatus(
      '💗 Your privacy preferences were saved successfully!'
    );

    return data;

  } catch (error) {
    setPrivacyStatus(
      `Could not save privacy preferences: ${error.message}`,
      true
    );

    throw error;

  } finally {
  privacySaving = false;

  const canEdit =
    privacyReady &&
    Boolean(loadedUserId);

  setPrivacyControlsDisabled(!canEdit);

  // Explicitly restore the Save button after
  // the save operation finishes.
  const saveButton = $('saveProfilePrivacy');

  if (saveButton) {
    saveButton.disabled = !canEdit;
  }
}
}
