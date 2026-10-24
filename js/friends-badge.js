
/* ==========================================
   TBB 2.0 — PHASE 6: FRIENDS™
   BESTIE NOTIFICATION BADGE
   ========================================== */

import { db } from './auth.js';

let subscription = null;
let badgeElements = [];
let activeUserId = null;

async function refreshBadge() {
  if (!activeUserId) return;

  const { count, error } = await db
    .from('tbb_friend_notifications')
    .select('id', {
      count: 'exact',
      head: true
    })
    .eq('recipient_id', activeUserId)
    .eq('is_read', false);

  if (error) {
    console.warn(
      'Friend notification count unavailable:',
      error.message
    );
    return;
  }

  const unread = count || 0;

  for (const badge of badgeElements) {
    badge.textContent =
      unread > 99 ? '99+' : String(unread);

    badge.hidden = unread === 0;

    badge.setAttribute(
      'aria-label',
      `${unread} unread friendship notifications`
    );
  }
}

export async function initializeFriendBadge(userId) {
  if (!userId) return;

  if (activeUserId && activeUserId !== userId) {
    stopFriendBadge();
  }

  activeUserId = userId;

  badgeElements = [
    ...document.querySelectorAll(
      '[data-friend-notification-badge]'
    )
  ];

  await refreshBadge();

  // Supabase Realtime requires the notifications table
  // to be included in the realtime publication.
  // The badge also works without Realtime and refreshes
  // whenever the page becomes visible.

  if (!subscription) {
    subscription = db
      .channel(`tbb-friend-badge-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tbb_friend_notifications',
          filter: `recipient_id=eq.${userId}`
        },
        () => {
          void refreshBadge();
        }
      )
      .subscribe();
  }

  document.removeEventListener(
    'visibilitychange',
    handleVisibility
  );

  document.addEventListener(
    'visibilitychange',
    handleVisibility
  );
}

function handleVisibility() {
  if (!document.hidden) {
    void refreshBadge();
  }
}

export function stopFriendBadge() {
  document.removeEventListener(
    'visibilitychange',
    handleVisibility
  );

  if (subscription) {
    void db.removeChannel(subscription);
    subscription = null;
  }

  activeUserId = null;
  badgeElements = [];
}

export { refreshBadge };
