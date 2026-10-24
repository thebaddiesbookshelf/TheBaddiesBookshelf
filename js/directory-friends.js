
/* =====================================================
   TBB 2.0 — PHASE 6: FRIENDS™
   BADDIE DIRECTORY™ INTEGRATION

   Handles:
   - Add Bestie requests
   - Pending sent requests
   - Incoming requests
   - Accept / decline / cancel
   - Remove Bestie
   - Mutual Besties

   Friendship permissions are enforced by
   the existing Supabase friendship RPCs.
   ===================================================== */

import { db } from './auth.js';

import {
  getFriendshipStatus,
  getMutualFriends,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend
} from './friends.js';

const $ = id => document.getElementById(id);

let generation = 0;
let busy = false;
let activeMemberId = null;

/* =====================================================
   ELEMENT HELPERS
   ===================================================== */

function element(tag, className, text) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

function setStatus(text, error = false) {
  const node = $('directoryFriendStatus');

  if (!node) return;

  node.textContent = text;
  node.classList.toggle('error', error);
}

function setActions(...buttons) {
  $('directoryFriendActions')?.replaceChildren(...buttons);
}

/* =====================================================
   FRIENDSHIP ACTION BUTTON
   ===================================================== */

function actionButton(label, style, callback) {
  const button = element(
    'button',
    `btn ${style || ''}`,
    label
  );

  button.type = 'button';

  button.addEventListener('click', async () => {
    if (busy) return;

    busy = true;
    button.disabled = true;

    try {
      const changed = await callback();

      if (changed !== false) {
        await refreshFriendship();
      }

    } catch (error) {
      console.error(
        'Directory friendship action failed:',
        error
      );

      setStatus(
        error?.message ||
          'Something went wrong. Please try again.',
        true
      );

    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  return button;
}

/* =====================================================
   RENDER FRIENDSHIP RELATIONSHIP

   IMPORTANT:
   Do not query another member's private
   tbb_vanity_settings row here.

   Supabase RLS may hide that row even when
   friend_requests_enabled is true.

   The existing sendFriendRequest() RPC
   must enforce the recipient's preferences,
   blocks, and friendship permissions.
   ===================================================== */

async function renderRelationship(memberId, token) {
  const status = await getFriendshipStatus(memberId);

  if (token !== generation) return;

  /* ---------------------------------------------
     ALREADY OFFICIAL BESTIES
     --------------------------------------------- */

  if (status.status === 'friends') {
    setStatus(
      '💗 You two are officially Besties!'
    );

    setActions(
      actionButton(
        '💔 Remove Bestie',
        '',
        async () => {
          const confirmed = window.confirm(
            'Remove this Baddie from your friends?'
          );

          if (!confirmed) {
            return false;
          }

          await removeFriend(memberId);

          return true;
        }
      )
    );

    return;
  }

  /* ---------------------------------------------
     REQUEST ALREADY SENT
     --------------------------------------------- */

  if (status.status === 'sent') {
    setStatus(
      '💌 Your Bestie request is awaiting a response.'
    );

    setActions(
      actionButton(
        'Cancel Request',
        '',
        async () => {
          if (!status.requestId) {
            throw new Error(
              'The pending request could not be found.'
            );
          }

          await cancelFriendRequest(
            status.requestId
          );

          return true;
        }
      )
    );

    return;
  }

  /* ---------------------------------------------
     INCOMING BESTIE REQUEST
     --------------------------------------------- */

  if (status.status === 'received') {
    setStatus(
      '👀 This Baddie wants to be your Bestie!'
    );

    setActions(
      actionButton(
        '💗 Accept Request',
        'primary',
        async () => {
          if (!status.requestId) {
            throw new Error(
              'The incoming request could not be found.'
            );
          }

          await acceptFriendRequest(
            status.requestId
          );

          return true;
        }
      ),

      actionButton(
        'Decline',
        '',
        async () => {
          if (!status.requestId) {
            throw new Error(
              'The incoming request could not be found.'
            );
          }

          await declineFriendRequest(
            status.requestId
          );

          return true;
        }
      )
    );

    return;
  }

  /* ---------------------------------------------
     NO EXISTING FRIENDSHIP

     Display Add Bestie.

     The server validates whether the
     recipient can accept requests.
     --------------------------------------------- */

  setStatus(
    'Not Besties yet? Send a request and make it official! 💌'
  );

  setActions(
    actionButton(
      '💌 Add Bestie',
      'primary',
      async () => {
        await sendFriendRequest(memberId);

        return true;
      }
    )
  );
}

/* =====================================================
   MUTUAL BESTIES
   ===================================================== */

async function renderMutualFriends(memberId, token) {
  const container = $('directoryMutualList');

  if (!container) return;

  const mutualIds = await getMutualFriends(memberId);

  if (token !== generation) return;

  container.replaceChildren();

  if (!mutualIds.length) {
    container.append(
      element(
        'p',
        'muted',
        'No mutual Besties to show yet. 💗'
      )
    );

    return;
  }

  const { data, error } = await db
    .from('tbb_profiles')
    .select(
      'user_id,display_name,username'
    )
    .in('user_id', mutualIds);

  if (token !== generation) return;

  if (error) throw error;

  const byId = new Map(
    (data || []).map(profile => [
      profile.user_id,
      profile
    ])
  );

  for (const id of mutualIds) {
    const profile = byId.get(id);

    const card = element(
      'div',
      'directory-mutual-card'
    );

    const icon = element(
      'div',
      'directory-mutual-icon',
      '👯🏾‍♀️'
    );

    const details = element('div');

    details.append(
      element(
        'div',
        'directory-mutual-name',
        profile?.display_name ||
          'TBB Baddie'
      ),

      element(
        'div',
        'directory-mutual-handle',
        profile?.username
          ? `@${profile.username}`
          : 'TBB Member'
      )
    );

    card.append(
      icon,
      details
    );

    container.append(card);
  }
}

/* =====================================================
   REFRESH FRIENDSHIP STATUS
   ===================================================== */

async function refreshFriendship() {
  const memberId = activeMemberId;

  if (!memberId) return;

  const token = ++generation;

  setStatus(
    'Checking your friendship... 💗'
  );

  setActions();

  try {
    await renderRelationship(
      memberId,
      token
    );

  } catch (error) {
    if (token !== generation) return;

    console.error(
      'Friendship refresh failed:',
      error
    );

    setStatus(
      `Friendship information unavailable: ${
        error?.message ||
        'Please try again.'
      }`,
      true
    );

    setActions();
  }
}

/* =====================================================
   LOAD DIRECTORY FRIENDSHIP

   Called when viewing another Baddie's
   profile in the Baddie Directory™.
   ===================================================== */

export async function loadDirectoryFriendship(memberId) {
  activeMemberId = memberId;

  const token = ++generation;

  setStatus(
    'Checking your friendship... 💗'
  );

  setActions();

  const mutualContainer = $(
    'directoryMutualList'
  );

  if (mutualContainer) {
    mutualContainer.textContent =
      'Finding your mutual Besties...';
  }

  /* Relationship and mutual Besties load
     independently so one failure does
     not break the other. */

  void renderRelationship(
    memberId,
    token
  ).catch(error => {
    if (token !== generation) return;

    console.error(
      'Directory relationship failed:',
      error
    );

    setStatus(
      error?.message ||
        'Friendship information unavailable.',
      true
    );

    setActions();
  });

  void renderMutualFriends(
    memberId,
    token
  ).catch(error => {
    if (token !== generation) return;

    console.warn(
      'Mutual Besties unavailable:',
      error?.message
    );

    if (mutualContainer) {
      mutualContainer.textContent =
        'Mutual Besties could not be loaded.';
    }
  });
}

/* =====================================================
   CLEAR DIRECTORY FRIENDSHIP

   Called when leaving or switching
   another Baddie's profile.
   ===================================================== */

export function clearDirectoryFriendship() {
  activeMemberId = null;

  ++generation;

  setStatus('');
  setActions();

  const mutualContainer = $(
    'directoryMutualList'
  );

  if (mutualContainer) {
    mutualContainer.replaceChildren();
  }
}

/* =====================================================
   END — DIRECTORY FRIENDS™
   ===================================================== */
