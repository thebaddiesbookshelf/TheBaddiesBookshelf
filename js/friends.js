
/* =====================================================
   TBB 2.0 — PHASE 6: FRIENDS™
   MY BESTIES™ — FRIENDSHIP ENGINE

   Uses:
   - Existing Supabase client from auth.js
   - Existing friendship RPC functions
   - Existing friend requests and friendships
   - Angel's mutual-friends-only privacy rule
   ===================================================== */

import { db, getAccess } from './auth.js';

/* ==========================================
   AUTHENTICATED MEMBER
   ========================================== */

export async function getCurrentBestie() {
  const access = await getAccess();

  if (!access.user || access.status !== 'approved') {
    throw new Error('Approved member access required.');
  }

  return access.user;
}

/* ==========================================
   FRIENDSHIP ACTIONS
   ========================================== */

async function callFriendRPC(functionName, params) {
  await getCurrentBestie();

  const { data, error } = await db.rpc(
    functionName,
    params
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

// Send a friend request.
export async function sendFriendRequest(recipientId) {
  if (!recipientId) {
    throw new Error('Recipient is required.');
  }

  return callFriendRPC('tbb_friend_send', {
    p_recipient: recipientId
  });
}

// Accept an incoming request.
export async function acceptFriendRequest(requestId) {
  if (!requestId) {
    throw new Error('Request ID is required.');
  }

  return callFriendRPC('tbb_friend_accept', {
    p_request_id: requestId
  });
}

// Decline an incoming request.
export async function declineFriendRequest(requestId) {
  if (!requestId) {
    throw new Error('Request ID is required.');
  }

  return callFriendRPC('tbb_friend_decline', {
    p_request_id: requestId
  });
}

// Cancel an outgoing request.
export async function cancelFriendRequest(requestId) {
  if (!requestId) {
    throw new Error('Request ID is required.');
  }

  return callFriendRPC('tbb_friend_cancel', {
    p_request_id: requestId
  });
}

// Remove an existing friendship.
export async function removeFriend(otherUserId) {
  if (!otherUserId) {
    throw new Error('Member ID is required.');
  }

  return callFriendRPC('tbb_friend_remove', {
    p_other_user: otherUserId
  });
}

/* ==========================================
   REQUEST RETRIEVAL
   ========================================== */

export async function getReceivedFriendRequests() {
  const user = await getCurrentBestie();

  const { data, error } = await db
    .from('tbb_friend_requests')
    .select(
      'id, sender_id, receiver_id, status, created_at'
    )
    .eq('receiver_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function getSentFriendRequests() {
  const user = await getCurrentBestie();

  const { data, error } = await db
    .from('tbb_friend_requests')
    .select(
      'id, sender_id, receiver_id, status, created_at'
    )
    .eq('sender_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/* ==========================================
   MY FRIENDS
   ========================================== */

export async function getMyFriends() {
  const user = await getCurrentBestie();

  const { data, error } = await db
    .from('tbb_friendships')
    .select('user_a, user_b, created_at')
    .or(
      `user_a.eq.${user.id},user_b.eq.${user.id}`
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(friendship => ({
    userId:
      friendship.user_a === user.id
        ? friendship.user_b
        : friendship.user_a,
    friendsSince: friendship.created_at
  }));
}

/* ==========================================
   MUTUAL FRIENDS — ANGEL'S OPTION B
   ========================================== */

export async function getMutualFriends(profileUserId) {
  await getCurrentBestie();

  if (!profileUserId) {
    return [];
  }

  const { data, error } = await db.rpc(
    'tbb_mutual_friends',
    {
      p_profile_user: profileUserId
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(row => row.friend_id);
}

/* ==========================================
   RELATIONSHIP STATUS
   ========================================== */

export async function getFriendshipStatus(otherUserId) {
  const user = await getCurrentBestie();

  if (!otherUserId) {
    return { status: 'none' };
  }

  if (otherUserId === user.id) {
    return { status: 'self' };
  }

  const [friendResult, requestResult] =
    await Promise.all([
      db.from('tbb_friendships')
        .select('user_a, user_b')
        .or(
          `and(user_a.eq.${user.id},user_b.eq.${otherUserId}),and(user_a.eq.${otherUserId},user_b.eq.${user.id})`
        )
        .maybeSingle(),

      db.from('tbb_friend_requests')
        .select(
          'id, sender_id, receiver_id, status'
        )
        .eq('status', 'pending')
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`
        )
        .maybeSingle()
    ]);

  if (friendResult.error) {
    throw new Error(friendResult.error.message);
  }

  if (requestResult.error) {
    throw new Error(requestResult.error.message);
  }

  if (friendResult.data) {
    return { status: 'friends' };
  }

  if (requestResult.data) {
    return {
      status:
        requestResult.data.sender_id === user.id
          ? 'sent'
          : 'received',
      requestId: requestResult.data.id
    };
  }

  return { status: 'none' };
}

/* ==========================================
   FRIENDSHIP NOTIFICATIONS
   ========================================== */

export async function getFriendNotifications() {
  const user = await getCurrentBestie();

  const { data, error } = await db
    .from('tbb_friend_notifications')
    .select(
      'id, actor_id, request_id, notification_type, is_read, created_at'
    )
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function markFriendNotificationRead(
  notificationId
) {
  if (!notificationId) {
    throw new Error('Notification ID is required.');
  }

  return callFriendRPC(
    'tbb_friend_notification_read',
    {
      p_notification_id: notificationId
    }
  );
}

/* ==========================================
   FRIENDSHIP SUMMARY
   ========================================== */

export async function getFriendshipSummary() {
  const [
    friends,
    received,
    sent,
    notifications
  ] = await Promise.all([
    getMyFriends(),
    getReceivedFriendRequests(),
    getSentFriendRequests(),
    getFriendNotifications()
  ]);

  return {
    friends,
    received,
    sent,
    notifications,
    friendCount: friends.length,
    receivedCount: received.length,
    sentCount: sent.length,
    unreadCount: notifications.filter(
      notification => !notification.is_read
    ).length
  };
}
