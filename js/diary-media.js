
/* ==========================================
   TBB 2.0 — READING DIARY™
   PRIVATE MEDIA STUDIO + PUBLIC DIARY MEDIA
   STEPS 2D + 2G
   ========================================== */

import { db } from "./auth.js";

const BUCKET = "tbb-diary-media";
const MAX_BYTES = 10 * 1024 * 1024;

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

const $ = id => document.getElementById(id);

let currentUserId = null;
let currentEntryId = null;
let pendingFiles = [];
let previewUrls = [];
let mediaBusy = false;
let mediaSession = 0;
let initialized = false;

/* ==========================================
   STORAGE HELPERS
   ========================================== */

function storage() {
  return db.storage.from(BUCKET);
}

function folder(userId, entryId) {
  return `${userId}/${entryId}`;
}

function validateFile(file) {
  if (!TYPES[file.type]) {
    throw new Error(
      `${file.name}: Only JPG, PNG, WebP, and GIF files are allowed.`
    );
  }

  if (file.size > MAX_BYTES) {
    throw new Error(
      `${file.name}: Images must be 10 MB or smaller.`
    );
  }

  if (file.size === 0) {
    throw new Error(
      `${file.name}: This file is empty.`
    );
  }
}

function clearObjectUrls() {
  for (const url of previewUrls) {
    URL.revokeObjectURL(url);
  }

  previewUrls = [];
}

function makeButton(label, callback) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", callback);

  return button;
}

function mediaMessage(message, error = false) {
  const status = $("diaryEditorStatus");

  if (!status) return;

  status.textContent = message;
  status.style.color = error
    ? "#ffaaaa"
    : "var(--light)";
}

/* ==========================================
   LIST ENTRY ATTACHMENTS
   ========================================== */

async function listEntryMedia(userId, entryId) {
  if (!userId || !entryId) return [];

  const files = [];
  const path = folder(userId, entryId);

  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage().list(
      path,
      {
        limit: 100,
        offset,
        sortBy: {
          column: "name",
          order: "asc"
        }
      }
    );

    if (error) throw error;

    const batch = (data || []).filter(
      item => item.name && item.id
    );

    files.push(...batch);

    if (!data || data.length < 100) {
      break;
    }
  }

  return files.map(file => ({
    name: file.name,
    path: `${path}/${file.name}`
  }));
}

/* ==========================================
   SIGNED MEDIA URL
   ========================================== */

async function signedMediaUrl(path, expiresIn = 300) {
  const { data, error } = await storage()
    .createSignedUrl(path, expiresIn);

  if (error) throw error;

  if (!data?.signedUrl) {
    throw new Error(
      "Could not create an attachment URL."
    );
  }

  return data.signedUrl;
}

/* ==========================================
   RENDER EXISTING PRIVATE MEDIA
   ========================================== */

async function renderExistingMedia(
  userId,
  entryId,
  session
) {
  const target = $("diaryMediaPreview");

  if (!target) return;

  const files = await listEntryMedia(
    userId,
    entryId
  );

  for (const file of files) {
    if (
      session !== mediaSession ||
      currentEntryId !== entryId
    ) {
      return;
    }

    const url = await signedMediaUrl(
      file.path
    );

    if (
      session !== mediaSession ||
      currentEntryId !== entryId
    ) {
      return;
    }

    const item = document.createElement("div");
    item.className = "diary-media-item";

    const image = document.createElement("img");

    image.src = url;
    image.alt = "Diary attachment";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";

    const remove = makeButton(
      "Remove 🗑️",
      async () => {
        if (mediaBusy) return;

        const confirmed = window.confirm(
          "Permanently remove this photo or GIF?"
        );

        if (!confirmed) return;

        mediaBusy = true;
        remove.disabled = true;

        try {
          const { error } = await storage()
            .remove([file.path]);

          if (error) throw error;

          item.remove();

          mediaMessage(
            "Attachment removed. 💗"
          );

        } catch (error) {
          mediaMessage(
            error.message,
            true
          );

          remove.disabled = false;

        } finally {
          mediaBusy = false;
        }
      }
    );

    item.append(image, remove);
    target.appendChild(item);
  }
}

/* ==========================================
   RENDER PENDING ATTACHMENTS
   ========================================== */

function renderPendingFiles() {
  const target = $("diaryMediaPreview");

  if (!target) return;

  target
    .querySelectorAll("[data-pending-media]")
    .forEach(item => item.remove());

  clearObjectUrls();

  pendingFiles.forEach((file, index) => {
    const item = document.createElement("div");

    item.className = "diary-media-item";
    item.dataset.pendingMedia = "true";

    const image = document.createElement("img");
    const url = URL.createObjectURL(file);

    previewUrls.push(url);

    image.src = url;
    image.alt = `New attachment: ${file.name}`;

    const remove = makeButton(
      "Remove ✕",
      () => {
        if (mediaBusy) return;

        pendingFiles.splice(index, 1);
        renderPendingFiles();
      }
    );

    item.append(image, remove);
    target.appendChild(item);
  });
}

/* ==========================================
   HANDLE FILE SELECTION
   ========================================== */

function handleFileSelection() {
  const input = $("diaryMediaFile");

  if (!input || mediaBusy) return;

  const files = Array.from(
    input.files || []
  );

  try {
    files.forEach(validateFile);

    pendingFiles.push(...files);

    renderPendingFiles();

    if (files.length) {
      mediaMessage(
        `${files.length} attachment(s) ready to save. 💌`
      );
    }

  } catch (error) {
    mediaMessage(
      error.message,
      true
    );
  }

  input.value = "";
}

/* ==========================================
   INITIALIZE PRIVATE MEDIA STUDIO
   ========================================== */

export function initializeDiaryMedia(userId) {
  currentUserId = userId;

  const input = $("diaryMediaFile");

  if (!input) return;

  input.disabled = false;

  if (!initialized) {
    input.addEventListener(
      "change",
      handleFileSelection
    );

    initialized = true;
  }

  const help = input
    .closest(".diary-editor-field")
    ?.querySelector(".library-helper");

  if (help) {
    help.textContent =
      "JPG, PNG, WebP, or GIF. Maximum 10 MB per image. " +
      "New attachments upload when you save your entry.";
  }
}

/* ==========================================
   OPEN DIARY MEDIA
   ========================================== */

export async function openDiaryMedia(
  entryId = null
) {
  const session = ++mediaSession;

  currentEntryId = entryId;
  pendingFiles = [];

  clearObjectUrls();

  const input = $("diaryMediaFile");
  const preview = $("diaryMediaPreview");

  if (input) input.value = "";
  if (preview) preview.replaceChildren();

  if (!entryId || !currentUserId) {
    return;
  }

  try {
    await renderExistingMedia(
      currentUserId,
      entryId,
      session
    );

  } catch (error) {
    if (session !== mediaSession) {
      return;
    }

    mediaMessage(
      `Couldn't load attachments: ${error.message}`,
      true
    );
  }
}

/* ==========================================
   CLOSE DIARY MEDIA
   ========================================== */

export function closeDiaryMedia() {
  ++mediaSession;

  currentEntryId = null;
  pendingFiles = [];

  clearObjectUrls();

  const input = $("diaryMediaFile");
  const preview = $("diaryMediaPreview");

  if (input) input.value = "";
  if (preview) preview.replaceChildren();
}

/* ==========================================
   SAVE DIARY ATTACHMENTS
   ========================================== */

export async function saveDiaryMedia(entryId) {
  if (!currentUserId || !entryId) {
    throw new Error(
      "Diary media session is unavailable."
    );
  }

  if (!pendingFiles.length) {
    return;
  }

  if (mediaBusy) {
    throw new Error(
      "Please wait for media operations to finish."
    );
  }

  mediaBusy = true;

  const input = $("diaryMediaFile");

  if (input) input.disabled = true;

  try {
    // The diary record must exist before uploading.
    // Storage policies validate ownership.

    while (pendingFiles.length) {
      const file = pendingFiles[0];

      validateFile(file);

      const extension = TYPES[file.type];

      const filename =
        `${crypto.randomUUID()}.${extension}`;

      const path =
        `${folder(currentUserId, entryId)}/${filename}`;

      const { error } = await storage()
        .upload(path, file, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false
        });

      if (error) throw error;

      // Remove only successfully uploaded files.
      // This avoids duplicate uploads on retry.
      pendingFiles.shift();
    }

    clearObjectUrls();

    const preview = $("diaryMediaPreview");

    if (preview) {
      preview
        .querySelectorAll("[data-pending-media]")
        .forEach(item => item.remove());
    }

    mediaMessage(
      "Your photos and GIFs are saved! 💗"
    );

  } catch (error) {
    // Keep files that have not uploaded.
    renderPendingFiles();

    throw error;

  } finally {
    mediaBusy = false;

    if (input) input.disabled = false;
  }
}

/* ==========================================
   DELETE DIARY ATTACHMENTS
   ========================================== */

export async function deleteDiaryMedia(entryId) {
  if (!currentUserId || !entryId) {
    return;
  }

  if (mediaBusy) {
    throw new Error(
      "Please wait for media operations to finish."
    );
  }

  const files = await listEntryMedia(
    currentUserId,
    entryId
  );

  if (!files.length) return;

  for (
    let start = 0;
    start < files.length;
    start += 100
  ) {
    const batch = files
      .slice(start, start + 100)
      .map(file => file.path);

    const { error } = await storage()
      .remove(batch);

    if (error) throw error;
  }
}

/* ==========================================
   STEP 2G — PUBLIC DIARY MEDIA
   Read-only attachments for Vanity™
   ========================================== */

export async function getPublicDiaryMedia(
  profileUserId,
  entryId
) {
  if (!profileUserId || !entryId) {
    return [];
  }

  // Verify the diary entry is public.
  // Supabase RLS must independently enforce
  // access to the diary and its attachments.

  const {
    data: entry,
    error: entryError
  } = await db
    .from("tbb_diary_entries")
    .select("id")
    .eq("id", entryId)
    .eq("user_id", profileUserId)
    .eq("visibility", "public")
    .maybeSingle();

  if (entryError) throw entryError;

  if (!entry) return [];

  // Read the public entry's attachments.
  // This function does not allow deletion.

  const files = await listEntryMedia(
    profileUserId,
    entryId
  );

  const images = files.filter(file =>
    /\.(jpg|jpeg|png|webp|gif)$/i.test(
      file.name
    )
  );

  const results = await Promise.allSettled(
    images.slice(0, 12).map(
      async file => ({
        url: await signedMediaUrl(
          file.path,
          300
        ),
        alt: "Public Reading Diary attachment"
      })
    )
  );

  return results
    .filter(
      result =>
        result.status === "fulfilled"
    )
    .map(result => result.value);
}

/* ==========================================
   END — READING DIARY™ MEDIA STUDIO
   ========================================== */
