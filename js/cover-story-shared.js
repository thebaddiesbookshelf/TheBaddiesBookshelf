
/* ============================================
   THE BADDIES BOOKSHELF
   COVER STORY™ — SHARED PUBLISHING ENGINE

   Used by:
   - Main Cover Story™
   - Full Baddie Profiles™

   Reuses existing Supabase RPCs.
   Does not create new database tables.
   ============================================ */

const MAX_BODY_LENGTH = 5000;
const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const PHOTO_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

const POST_TYPES = new Set([
  "text",
  "poll",
  "image"
]);

const VISIBILITIES = new Set([
  "all_baddies",
  "besties_only"
]);

export const COVER_STORY_REACTIONS = Object.freeze({
  like: "👍",
  love: "💗",
  laugh: "😂",
  wow: "😮",
  support: "🥹"
});

/* ============================================
   VALIDATION
   ============================================ */

function requireDatabase(db) {
  if (!db || typeof db.rpc !== "function") {
    throw new Error(
      "Cover Story™ could not connect to Supabase."
    );
  }
}

function requireUser(user) {
  if (!user?.id) {
    throw new Error(
      "Please sign in before publishing a Cover Story™."
    );
  }
}

function validateBody(body) {
  if (body.length > MAX_BODY_LENGTH) {
    throw new Error(
      "Your Cover Story™ cannot exceed 5000 characters."
    );
  }
}

function validateVisibility(visibility) {
  if (!VISIBILITIES.has(visibility)) {
    throw new Error(
      "Please choose a valid Cover Story™ audience."
    );
  }
}

function validatePollOptions(options) {
  if (!Array.isArray(options)) {
    throw new Error("Poll options are required.");
  }

  if (options.length < 2 || options.length > 6) {
    throw new Error(
      "Polls must contain between 2 and 6 options."
    );
  }

  const cleaned = options.map(option =>
    String(option ?? "").trim()
  );

  if (cleaned.some(option =>
    !option || option.length > 200
  )) {
    throw new Error(
      "Each poll option must contain 1–200 characters."
    );
  }

  const unique = new Set(
    cleaned.map(option => option.toLowerCase())
  );

  if (unique.size !== cleaned.length) {
    throw new Error(
      "Poll options must be different."
    );
  }

  return cleaned;
}

export function validateCoverStoryPhotos(files) {
  const selected = Array.from(files || []);

  if (
    selected.length < 1 ||
    selected.length > MAX_PHOTOS
  ) {
    throw new Error(
      "Choose between 1 and 4 photos."
    );
  }

  for (const file of selected) {
    if (!PHOTO_TYPES.has(file.type)) {
      throw new Error(
        "Only JPEG, PNG, and WebP photos are supported."
      );
    }

    if (
      file.size === 0 ||
      file.size > MAX_PHOTO_BYTES
    ) {
      throw new Error(
        `${file.name} must be between 1 byte and 5 MB.`
      );
    }
  }

  return selected;
}

function normalizeClosingDate(value) {
  if (!value) return null;

  const date = value instanceof Date
    ? value
    : new Date(value);

  
if (Number.isNaN(date.getTime())) {
  throw new Error(
    "Please choose a valid poll closing date."
  );
}

if (date.getTime() <= Date.now()) {
  throw new Error(
    "Your poll closing date must be in the future, Baddie! 💗"
  );
}

return date.toISOString();

}

/* ============================================
   TEXT POSTS AND POLLS
   ============================================ */

async function publishStandardStory({
  db,
  type,
  body,
  visibility,
  pollOptions,
  pollClosesAt
}) {
  const payload = {
    p_type: type,
    p_body: body,
    p_visibility: visibility
  };

  if (type === "text" && !body) {
    throw new Error(
      "Write something before publishing, Baddie! 💗"
    );
  }

  if (type === "poll") {
    payload.p_poll_options =
      validatePollOptions(pollOptions);

    const closingDate =
      normalizeClosingDate(pollClosesAt);

    if (closingDate) {
      payload.p_poll_closes_at = closingDate;
    }
  }

  const { data, error } = await db.rpc(
    "tbb_publish_post",
    payload
  );

  if (error) throw error;

  return {
    success: true,
    type,
    postId: data ?? null
  };
}

/* ============================================
   PRIVATE PHOTO STORIES
   ============================================ */

async function publishImageStory({
  db,
  user,
  body,
  visibility,
  photos
}) {
  const files = validateCoverStoryPhotos(photos);

  const filenames = files.map(file => {
    const extension = PHOTO_TYPES.get(file.type);

    return `${crypto.randomUUID()}.${extension}`;
  });

  // Register the post and its media filenames
  // using the existing secure RPC.

  const { data: postId, error: prepareError } =
    await db.rpc("tbb_prepare_image_post", {
      p_body: body,
      p_visibility: visibility,
      p_filenames: filenames
    });

  if (prepareError) throw prepareError;

  if (!postId) {
    throw new Error(
      "Could not prepare your photo story."
    );
  }

  // Upload registered photos to the existing
  // private storage bucket.

  for (let index = 0; index < files.length; index++) {
    const file = files[index];

    const path =
      `${user.id}/${postId}/${filenames[index]}`;

    const { error: uploadError } =
      await db.storage
        .from("tbb-post-media")
        .upload(path, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false
        });

    if (uploadError) {
      throw new Error(
        `Photo ${index + 1} could not be uploaded: ` +
        uploadError.message +
        ". Your unfinished post is still pending."
      );
    }
  }

  // Publish only after every photo uploads.

  const { data: completed, error: completeError } =
    await db.rpc("tbb_complete_image_post", {
      p_post_id: postId
    });

  if (completeError) throw completeError;

  if (!completed) {
    throw new Error(
      "Your photos uploaded, but the story " +
      "could not be published."
    );
  }

  return {
    success: true,
    type: "image",
    postId
  };
}

/* ============================================
   SHARED PUBLIC PUBLISH FUNCTION
   ============================================ */

export async function publishCoverStory({
  db,
  user,
  type = "text",
  body = "",
  visibility = "all_baddies",
  pollOptions = [],
  pollClosesAt = null,
  photos = []
}) {
  requireDatabase(db);
  requireUser(user);

  if (!POST_TYPES.has(type)) {
    throw new Error(
      "That Cover Story™ post type is not supported."
    );
  }

  validateVisibility(visibility);

  const cleanedBody = String(body ?? "").trim();

  validateBody(cleanedBody);

  if (type === "image") {
    return publishImageStory({
      db,
      user,
      body: cleanedBody,
      visibility,
      photos
    });
  }

  return publishStandardStory({
    db,
    type,
    body: cleanedBody,
    visibility,
    pollOptions,
    pollClosesAt
  });
}

/* ============================================
   PROFILE DESTINATIONS
   ============================================ */

export function coverStoryProfileUrl(memberId) {
  if (!memberId) return null;

  return (
    "baddie-profile.html?user=" +
    encodeURIComponent(memberId)
  );
}

/* ============================================
   SHARED TIMELINE DATA
   ============================================ */

export async function fetchCoverStoryPosts({
  db,
  authorId = null,
  page = 0,
  limit = 12
}) {
  requireDatabase(db);

  if (!Number.isInteger(page) || page < 0) {
    throw new Error("Invalid timeline page.");
  }

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    throw new Error("Invalid timeline page size.");
  }

  const offset = page * limit;

  let query = db
    .from("tbb_posts")
    .select(
      "id,author_id,post_type,body,visibility," +
      "created_at,poll_closes_at"
    )
    .eq("moderation_status", "active")
    .eq("media_status", "ready");

  // A profile timeline contains only posts
  // authored by that Baddie.

  if (authorId) {
    query = query.eq("author_id", authorId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const posts = data || [];

  return {
    posts,
    page,
    hasMore: posts.length === limit
  };
}
