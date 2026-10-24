
/* =====================================================
   TBB 2.0 — PHASE 6: FRIENDS™
   MY BESTIES™ — FRIENDS PAGE

   Existing architecture:
   - js/auth.js
   - js/friends.js
   - tbb_profiles
   - Supabase friendship RPCs
   ===================================================== */

import {
  db,
  requireAccess,
  logout
} from './auth.js';

import {
  getFriendshipSummary,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  markFriendNotificationRead
} from './friends.js';

const $ = id => document.getElementById(id);

let currentUser = null;
let summary = null;
let profiles = new Map();
let busy = false;

/* ==========================================
   MESSAGES
   ========================================== */

function showMessage(text, error = false) {
  const element = $('friendsMessage');
  element.textContent = text;
  element.className = error
    ? 'friends-message error'
    : 'friends-message';
}

/* ==========================================
   DATE FORMATTING
   ========================================== */

function formatDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/* ==========================================
   PROFILE LOOKUP
   ========================================== */

async function loadProfiles(ids) {
  const uniqueIds = [
    ...new Set(ids.filter(Boolean))
  ];

  profiles = new Map();

  if (!uniqueIds.length) return;

  const { data, error } = await db
    .from('tbb_profiles')
    .select('user_id,display_name,username')
    .in('user_id', uniqueIds);

  if (error) {
    console.warn(
      'Friend profile lookup unavailable:',
      error.message
    );
    return;
  }

  for (const profile of data || []) {
    profiles.set(profile.user_id, profile);
  }
}

function getProfile(userId) {
  return profiles.get(userId) || {
    user_id: userId,
    display_name: 'TBB Baddie',
    username: null
  };
}

/* ==========================================
   SAFE ELEMENT HELPERS
   ========================================== */

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function createButton(label, className, action) {
  const button = createElement(
    'button',
    `friends-btn ${className || ''}`,
    label
  );

  button.type = 'button';

  button.addEventListener('click', async () => {
    if (busy) return;

    busy = true;
    button.disabled = true;

    try {
      await action();
      await refreshPage();
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  return button;
}

function createEmpty(text) {
  return createElement(
    'p',
    'friends-empty',
    text
  );
}

/* ==========================================
   FRIEND CARD
   ========================================== */

function createFriendCard(userId, type, record) {
  const profile = getProfile(userId);

  const card = createElement(
    'article',
    'friend-card'
  );

  const top = createElement(
    'div',
    'friend-card-top'
  );

  const avatar = createElement(
    'div',
    'friend-avatar',
    '💗'
  );

  const identity = createElement(
    'div',
    'friend-identity'
  );

  const name = createElement(
    'h3',
    'friend-name',
    profile.display_name || 'TBB Baddie'
  );

  const handle = createElement(
    'p',
    'friend-handle',
    profile.username
      ? `@${profile.username}`
      : 'TBB Member'
  );

  identity.append(name, handle);
  top.append(avatar, identity);
  card.append(top);

  const meta = createElement(
    'div',
    'friend-meta'
  );

  if (type === 'friend') {
    meta.textContent = record.friendsSince
      ? `👯🏾‍♀️ Besties since ${formatDate(record.friendsSince)}`
      : '👯🏾‍♀️ Official Besties';
  }

  if (type === 'incoming') {
    meta.textContent =
      `💌 Requested ${formatDate(record.created_at)}`;
  }

  if (type === 'outgoing') {
    meta.textContent =
      `⏳ Sent ${formatDate(record.created_at)}`;
  }

  card.append(meta);

  const actions = createElement(
    'div',
    'friend-actions'
  );

  if (type === 'friend') {
    actions.append(
      createButton(
        '💔 Remove Bestie',
        'danger',
        async () => {
          const confirmed = window.confirm(
            'Remove this Baddie from your friends?'
          );

          if (!confirmed) {
            throw new Error('Friend removal canceled.');
            }

          await removeFriend(userId);

          showMessage(
            'Friendship removed successfully.'
          );
        }
      )
    );
  }

  if (type === 'incoming') {
    actions.append(
      createButton(
        '💗 Accept',
        'primary',
        async () => {
          await acceptFriendRequest(record.id);

          showMessage(
            'You have a new Bestie! 👯🏾‍♀️💗'
          );
        }
      ),

      createButton(
        'Decline',
        '',
        async () => {
          await declineFriendRequest(record.id);

          showMessage(
            'Friend request declined.'
          );
        }
      )
    );
  }

  if (type === 'outgoing') {
    actions.append(
      createButton(
        'Cancel Request',
        'danger',
        async () => {
          await cancelFriendRequest(record.id);

          showMessage(
            'Your friend request was canceled.'
          );
        }
      )
    );
  }

  card.append(actions);

  return card;
}

/* ==========================================
   MY FRIENDS
   ========================================== */

function renderFriends() {
  const container = $('friendsList');
  const query = $('friendsSearch')
    .value.trim().toLowerCase();

  container.replaceChildren();

  const filtered = summary.friends.filter(friend => {
    const profile = getProfile(friend.userId);

    const searchText = [
      profile.display_name,
      profile.username
    ].filter(Boolean).join(' ').toLowerCase();

    return searchText.includes(query);
  });

  if (!filtered.length) {
    container.append(
      createEmpty(
        query
          ? 'No Besties match that search. 💗'
          : 'Your Bestie circle is waiting! Visit the Baddie Directory™ to make your first connection. 💌'
      )
    );
    return;
  }

  for (const friend of filtered) {
    container.append(
      createFriendCard(
        friend.userId,
        'friend',
        friend
      )
    );
  }
}

/* ==========================================
   INCOMING REQUESTS
   ========================================== */

function renderIncoming() {
  const container = $('incomingList');
  container.replaceChildren();

  $('incomingBadge').textContent =
    `${summary.receivedCount} Pending`;

  if (!summary.received.length) {
    container.append(
      createEmpty(
        'No incoming friend requests right now. 💌'
      )
    );
    return;
  }

  for (const request of summary.received) {
    container.append(
      createFriendCard(
        request.sender_id,
        'incoming',
        request
      )
    );
  }
}

/* ==========================================
   SENT REQUESTS
   ========================================== */

function renderOutgoing() {
  const container = $('outgoingList');
  container.replaceChildren();

  $('outgoingBadge').textContent =
    `${summary.sentCount} Pending`;

  if (!summary.sent.length) {
    container.append(
      createEmpty(
        'No pending sent requests. Find a Baddie to connect with! 💗'
      )
    );
    return;
  }

  for (const request of summary.sent) {
    container.append(
      createFriendCard(
        request.receiver_id,
        'outgoing',
        request
      )
    );
  }
}

/* ==========================================
   NOTIFICATIONS
   ========================================== */

function renderNotifications() {
  const container = $('notificationList');
  container.replaceChildren();

  $('notificationBadge').textContent =
    `${summary.unreadCount} Unread`;

  if (!summary.notifications.length) {
    container.append(
      createEmpty(
        'No friendship notifications yet. The bestie tea will appear here! 💌'
      )
    );
    return;
  }

  for (const notification of summary.notifications) {
    const actor = getProfile(
      notification.actor_id
    );

    const item = createElement(
      'article',
      'friend-notification'
    );

    if (!notification.is_read) {
      item.classList.add('unread');
    }

    const icon = createElement(
      'div',
      'friend-notification-icon',
      notification.notification_type === 'friend_request'
        ? '💌'
        : '💗'
    );

    const body = createElement(
      'div',
      'friend-notification-body'
    );

    const heading = createElement(
      'strong',
      '',
      notification.notification_type === 'friend_request'
        ? 'New Bestie Request!'
        : 'Friendship Official!'
    );

    const description = createElement(
      'p',
      '',
      notification.notification_type === 'friend_request'
        ? `${actor.display_name || 'A Baddie'} sent you a friend request!`
        : `${actor.display_name || 'A Baddie'} accepted your friend request!`
    );

    const time = createElement(
      'time',
      '',
      formatDate(notification.created_at)
    );

    time.dateTime = notification.created_at;

    body.append(heading, description, time);

    item.append(icon, body);

    if (notification.notification_type === 'friend_request') {
      const link = createElement(
        'a',
        'friends-btn',
        'View Requests'
      );

      link.href = '#incoming';
      item.append(link);
    }

    if (!notification.is_read) {
      item.append(
        createButton(
          'Mark Read',
          '',
          async () => {
            await markFriendNotificationRead(
              notification.id
            );

            showMessage(
              'Notification marked as read. 💗'
            );
          }
        )
      );
    }

    container.append(item);
  }
}

/* ==========================================
   STATISTICS
   ========================================== */

function renderStats() {
  $('friendCount').textContent =
    summary.friendCount;

  $('receivedCount').textContent =
    summary.receivedCount;

  $('sentCount').textContent =
    summary.sentCount;

  $('unreadCount').textContent =
    summary.unreadCount;
}

/* ==========================================
   REFRESH DATA
   ========================================== */

async function refreshPage() {
  summary = await getFriendshipSummary();

  const userIds = [
    ...summary.friends.map(x => x.userId),
    ...summary.received.map(x => x.sender_id),
    ...summary.sent.map(x => x.receiver_id),
    ...summary.notifications.map(x => x.actor_id)
  ];

  await loadProfiles(userIds);

  renderStats();
  renderFriends();
  renderIncoming();
  renderOutgoing();
  renderNotifications();
}

/* ==========================================
   INITIALIZE
   ========================================== */

async function init() {
  try {
    const access = await requireAccess();

    if (!access) return;

    currentUser = access.user;

    await refreshPage();

  } catch (error) {
    console.error(
      'My Besties™ initialization failed:',
      error
    );

    showMessage(
      `Could not load My Besties™: ${error.message}`,
      true
    );
  }
}

/* ==========================================
   EVENT LISTENERS
   ========================================== */

$('friendsLogout').addEventListener(
  'click',
  logout
);

$('friendsSearch').addEventListener(
  'input',
  () => {
    if (summary) renderFriends();
  }
);

init();
