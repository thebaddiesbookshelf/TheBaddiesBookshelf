
/* =====================================================
   TBB 2.0 — PHASE 6: FRIENDS™
   BADDIE DIRECTORY™ INTEGRATION
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

function element(tag, className, text) {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;

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
      setStatus(error.message, true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  return button;
}

async function recipientAllowsRequests(userId) {
  const { data, error } = await db
    .from('tbb_vanity_settings')
    .select('friend_requests_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // Fail closed if settings cannot be checked.
    console.warn(
      'Friend request preference unavailable:',
      error.message
    );
    return false;
  }

  return data?.friend_requests_enabled === true;
}

async function renderRelationship(memberId, token) {
  const status = await getFriendshipStatus(memberId);

  if (token !== generation) return;

  if (status.status === 'friends') {
    setStatus('💗 You two are officially Besties!');

    setActions(
      actionButton(
        '💔 Remove Bestie',
        '',
        async () => {
          const confirmed = window.confirm(
            'Remove this Baddie from your friends?'
          );

          if (!confirmed) return false;

          await removeFriend(memberId);
          return true;
        }
      )
    );
    return;
  }

  if (status.status === 'sent') {
    setStatus('💌 Your friend request is awaiting a response.');

    setActions(
      actionButton(
        'Cancel Request',
        '',
        async () => {
          await cancelFriendRequest(status.requestId);
          return true;
        }
      )
    );
    return;
  }

  if (status.status === 'received') {
    setStatus('👀 This Baddie wants to be your Bestie!');

    setActions(
      actionButton(
        '💗 Accept Request',
        'primary',
        async () => {
          await acceptFriendRequest(status.requestId);
          return true;
        }
      ),
      actionButton(
        'Decline',
        '',
        async () => {
          await declineFriendRequest(status.requestId);
          return true;
        }
      )
    );
    return;
  }

  const enabled = await recipientAllowsRequests(memberId);

  if (token !== generation) return;

  if (!enabled) {
    setStatus(
      '💗 This Baddie is not accepting friend requests right now.'
    );
    setActions();
    return;
  }

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
    .select('user_id,display_name,username')
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
        profile?.display_name || 'TBB Baddie'
      ),
      element(
        'div',
        'directory-mutual-handle',
        profile?.username
          ? `@${profile.username}`
          : 'TBB Member'
      )
    );

    card.append(icon, details);
    container.append(card);
  }
}

async function refreshFriendship() {
  const memberId = activeMemberId;
  if (!memberId) return;

  const token = ++generation;

  setStatus('Checking your friendship... 💗');
  setActions();

  try {
    await renderRelationship(memberId, token);
  } catch (error) {
    if (token !== generation) return;

    setStatus(
      `Friendship information unavailable: ${error.message}`,
      true
    );
    setActions();
  }
}

let activeMemberId = null;

export async function loadDirectoryFriendship(memberId) {
  activeMemberId = memberId;

  const token = ++generation;

  setStatus('Checking your friendship... 💗');
  setActions();

  const mutualContainer = $('directoryMutualList');

  if (mutualContainer) {
    mutualContainer.textContent =
      'Finding your mutual Besties...';
  }

  // Keep relationship actions and mutual connections
  // independent so one error cannot break both sections.
  void renderRelationship(memberId, token).catch(error => {
    if (token !== generation) return;
    setStatus(error.message, true);
    setActions();
  });

  void renderMutualFriends(memberId, token).catch(error => {
    if (token !== generation) return;

    if (mutualContainer) {
      mutualContainer.textContent =
        'Mutual Besties could not be loaded.';
    }

    console.warn('Mutual friends:', error.message);
  });
}

export function clearDirectoryFriendship() {
  activeMemberId = null;
  ++generation;
  setActions();
}
