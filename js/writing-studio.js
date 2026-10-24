
/* ==========================================
   TBB 2.0 — THE BADDIE WRITING STUDIO™
   STEP 4D.2 — WRITING DESK & AUTOSAVE
   ========================================== */

import { db, requireAccess } from "./auth.js";

import {
  createWritingEditor,
  setWritingContent,
  getWritingContent,
  focusWritingEditor
} from "./writing-editor.js";

const TABLE = "tbb_writing_pieces";
const AUTOSAVE_DELAY = 1500;
const MAX_TEXT_LENGTH = 100000;
const MAX_JSON_BYTES = 1048576;

const EMPTY_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

const CATEGORIES = {
  story: "📖 Original Story",
  poetry: "🌷 Poetry",
  letter: "💌 Letter",
  freewriting: "☁️ Freewriting"
};

const $ = (id) => document.getElementById(id);

let currentUser = null;
let pieces = [];

let activePieceId = null;
let activeSession = 0;
let editorOpen = false;

let autosaveTimer = null;
let savePromise = null;
let revision = 0;
let savedRevision = 0;

let editorReady = false;
let loadingContent = false;
let closingEditor = false;

/* ==========================================
   UTILITIES
   ========================================== */

function setStatus(message, state = "") {
  const element = $("writingEditorStatus");

  if (!element) return;

  element.textContent = message;
  element.dataset.state = state;
}

function showNotice(message) {
  const element = $("message");

  if (element) {
    element.textContent = message;
  }
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function safeDocument(value) {
  if (
    value &&
    typeof value === "object" &&
    value.type === "doc" &&
    Array.isArray(value.content)
  ) {
    return value;
  }

  return structuredClone(EMPTY_DOCUMENT);
}

function getRecoveryKey(pieceId) {
  return `tbb-writing-recovery:${currentUser.id}:${pieceId}`;
}

function saveRecovery(pieceId, snapshot) {
  if (!currentUser || !pieceId) return;

  try {
    localStorage.setItem(
      getRecoveryKey(pieceId),
      JSON.stringify({
        ...snapshot,
        recoveredAt: Date.now()
      })
    );
  } catch (error) {
    console.warn(
      "Writing recovery storage unavailable:",
      error
    );
  }
}

function readRecovery(pieceId) {
  if (!currentUser || !pieceId) return null;

  try {
    const raw = localStorage.getItem(
      getRecoveryKey(pieceId)
    );

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearRecovery(pieceId) {
  if (!currentUser || !pieceId) return;

  try {
    localStorage.removeItem(
      getRecoveryKey(pieceId)
    );
  } catch {
    // Recovery storage may be unavailable.
  }
}

function validateSnapshot(snapshot) {
  const title = snapshot.title.trim();

  if (!title || title.length > 150) {
    throw new Error(
      "Give your writing a title of 1–150 characters."
    );
  }

  if (!(snapshot.category in CATEGORIES)) {
    throw new Error("Choose a valid writing category.");
  }

  if (
    !["private", "shared"].includes(
      snapshot.visibility
    )
  ) {
    throw new Error("Choose a valid visibility setting.");
  }

  if (snapshot.content_text.length > MAX_TEXT_LENGTH) {
    throw new Error(
      "This piece exceeds the 100,000-character limit."
    );
  }

  const jsonSize = new TextEncoder().encode(
    JSON.stringify(snapshot.content_json)
  ).length;

  if (jsonSize > MAX_JSON_BYTES) {
    throw new Error(
      "This piece exceeds the rich-text storage limit."
    );
  }

  return {
    title,
    category: snapshot.category,
    content_json: snapshot.content_json,
    content_text: snapshot.content_text,
    visibility: snapshot.visibility
  };
}

function captureSnapshot() {
  const content = getWritingContent();

  return {
    title:
      $("writingTitle").value.trim() ||
      "Untitled Piece",

    category: $("writingCategory").value,

    content_json: content.json,

    content_text: content.text,

    visibility: $("writingVisibility").value
  };
}

function markDirty() {
  if (
    !editorOpen ||
    loadingContent ||
    closingEditor ||
    !activePieceId
  ) {
    return;
  }

  revision++;

  const snapshot = captureSnapshot();

  saveRecovery(activePieceId, snapshot);

  setStatus("Unsaved changes… 💌");

  clearTimeout(autosaveTimer);

  autosaveTimer = setTimeout(() => {
    void saveCurrentPiece();
  }, AUTOSAVE_DELAY);
}

/* ==========================================
   LOAD MY WRITING
   ========================================== */

async function loadWritingPieces() {
  if (!currentUser) return;

  const allPieces = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const { data, error } = await db
      .from(TABLE)
      .select(
        "id,user_id,title,category,content_json," +
        "content_text,visibility,created_at,updated_at"
      )
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    allPieces.push(...(data || []));

    if (!data || data.length < pageSize) break;

    offset += pageSize;
  }

  pieces = allPieces;

  renderStatistics();
  renderWritingPieces();
}

/* ==========================================
   STATISTICS
   ========================================== */

function renderStatistics() {
  $("writingTotalCount").textContent =
    String(pieces.length);

  $("writingPrivateCount").textContent =
    String(
      pieces.filter(
        (piece) => piece.visibility === "private"
      ).length
    );

  $("writingSharedCount").textContent =
    String(
      pieces.filter(
        (piece) => piece.visibility === "shared"
      ).length
    );
}

/* ==========================================
   WRITING CARDS
   ========================================== */

function createTextElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  element.textContent = text;

  return element;
}

function renderWritingPieces() {
  const container = $("writingStudioEntries");

  if (!container) return;

  container.replaceChildren();

  const search = $("writingSearch")
    .value.trim()
    .toLowerCase();

  const category = $("writingCategoryFilter").value;
  const visibility = $("writingVisibilityFilter").value;

  const filtered = pieces.filter((piece) => {
    const searchable = [
      piece.title,
      piece.content_text
    ].join(" ").toLowerCase();

    const matchesSearch =
      !search || searchable.includes(search);

    const matchesCategory =
      category === "all" ||
      piece.category === category;

    const matchesVisibility =
      visibility === "all" ||
      piece.visibility === visibility;

    return (
      matchesSearch &&
      matchesCategory &&
      matchesVisibility
    );
  });

  if (!filtered.length) {
    const message = createTextElement(
      "p",
      "library-empty-message",
      pieces.length
        ? "💌 No writing matches those filters, Baddie."
        : "🖋️ Your Writing Desk™ is waiting for its first masterpiece."
    );

    container.append(message);
    return;
  }

  for (const piece of filtered) {
    const card = document.createElement("article");
    card.className = "writing-piece-card";

    const top = document.createElement("div");
    top.className = "writing-piece-top";

    top.append(
      createTextElement(
        "span",
        "writing-piece-category",
        CATEGORIES[piece.category] || "🖋️ Writing"
      ),

      createTextElement(
        "span",
        "writing-piece-visibility",
        piece.visibility === "shared"
          ? "💗 Shared"
          : "🔒 Private"
      )
    );

    const title = createTextElement(
      "h4",
      "writing-piece-title",
      piece.title || "Untitled Piece"
    );

    const previewText =
      (piece.content_text || "").trim();

    const preview = createTextElement(
      "p",
      "writing-piece-preview",
      previewText
        ? previewText.slice(0, 230) +
          (previewText.length > 230 ? "…" : "")
        : "A beautiful blank page, waiting for your words."
    );

    const meta = createTextElement(
      "p",
      "writing-piece-meta",
      `Last edited ${formatDate(piece.updated_at)}`
    );

    const actions = document.createElement("div");
    actions.className = "writing-piece-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "🖋️ Continue Writing";

    editButton.addEventListener("click", () => {
      void openExistingPiece(piece.id);
    });

    
actions.append(editButton);

if (piece.visibility === "shared") {
  const readButton = document.createElement("button");
  readButton.type = "button";
  readButton.textContent = "💌 Read & Love Notes";

  readButton.addEventListener("click", () => {
    document.dispatchEvent(
      new CustomEvent("tbb:open-writing-reader", {
        detail: { pieceId: piece.id }
      })
    );
  });

  actions.append(readButton);
}


    card.append(top, title, preview, meta, actions);

    container.append(card);
  }
}

/* ==========================================
   CREATE NEW PRIVATE PIECE
   ========================================== */

async function createNewPiece() {
  if (!currentUser) return;

  if (editorOpen) return;

  const button = $("createWritingPiece");

  button.disabled = true;

  try {
    const { data, error } = await db
      .from(TABLE)
      .insert({
        user_id: currentUser.id,
        title: "Untitled Piece",
        category: "freewriting",
        content_json: EMPTY_DOCUMENT,
        content_text: "",
        visibility: "private"
      })
      .select(
        "id,user_id,title,category,content_json," +
        "content_text,visibility,created_at,updated_at"
      )
      .single();

    if (error) throw error;

    pieces.unshift(data);

    renderStatistics();
    renderWritingPieces();

    openPieceInEditor(data);

  } catch (error) {
    console.error("Create writing failed:", error);

    showNotice(
      "💔 Couldn't create your writing piece. " +
      error.message
    );
  } finally {
    button.disabled = false;
  }
}

/* ==========================================
   OPEN EXISTING PIECE
   ========================================== */

async function openExistingPiece(pieceId) {
  if (editorOpen) return;

  let piece = pieces.find(
    (item) => item.id === pieceId
  );

  if (!piece) {
    try {
      const { data, error } = await db
        .from(TABLE)
        .select(
          "id,user_id,title,category,content_json," +
          "content_text,visibility,created_at,updated_at"
        )
        .eq("id", pieceId)
        .eq("user_id", currentUser.id)
        .single();

      if (error) throw error;

      piece = data;

    } catch (error) {
      showNotice(
        "💔 Couldn't open that writing piece."
      );

      console.error(error);
      return;
    }
  }

  openPieceInEditor(piece);
}

function openPieceInEditor(piece) {
  const dialog = $("writingEditorDialog");

  if (!dialog || !editorReady) return;

  activeSession++;
  activePieceId = piece.id;

  editorOpen = true;
  closingEditor = false;
  loadingContent = true;

  revision = 0;
  savedRevision = 0;
  savePromise = null;

  clearTimeout(autosaveTimer);

  $("writingEditingId").value = piece.id;
  $("writingTitle").value =
    piece.title || "Untitled Piece";

  $("writingCategory").value =
    CATEGORIES[piece.category]
      ? piece.category
      : "freewriting";

  $("writingVisibility").value =
    piece.visibility === "shared"
      ? "shared"
      : "private";

  setWritingContent(
    safeDocument(piece.content_json)
  );

  $("deleteWritingPiece").hidden = false;

  loadingContent = false;

  const recovery = readRecovery(piece.id);

  if (recovery) {
    const shouldRecover = window.confirm(
      "💌 Baddie, we found an unsaved version " +
      "of this writing on this browser.\n\n" +
      "Would you like to restore it?"
    );

    if (shouldRecover) {
      loadingContent = true;

      $("writingTitle").value =
        recovery.title || "Untitled Piece";

      $("writingCategory").value =
        CATEGORIES[recovery.category]
          ? recovery.category
          : "freewriting";

      $("writingVisibility").value =
        recovery.visibility === "shared"
          ? "shared"
          : "private";

      setWritingContent(
        safeDocument(recovery.content_json)
      );

      loadingContent = false;

      revision++;
      setStatus(
        "Recovered your unsaved writing. 💗"
      );

      autosaveTimer = setTimeout(() => {
        void saveCurrentPiece();
      }, AUTOSAVE_DELAY);

    } else {
      clearRecovery(piece.id);
      setStatus("All changes saved. 💗", "saved");
    }

  } else {
    setStatus("All changes saved. 💗", "saved");
  }

  dialog.showModal();

  focusWritingEditor();
}

/* ==========================================
   SEQUENTIAL AUTOSAVE
   ========================================== */

async function saveCurrentPiece() {
  if (
    !currentUser ||
    !activePieceId ||
    !editorOpen
  ) {
    return false;
  }

  clearTimeout(autosaveTimer);
  autosaveTimer = null;

  // An existing save must finish before another starts.
  if (savePromise) {
    await savePromise;

    if (
      !editorOpen ||
      !activePieceId
    ) {
      return false;
    }

    if (revision <= savedRevision) {
      return true;
    }
  }

  if (revision <= savedRevision) {
    return true;
  }

  const pieceId = activePieceId;
  const session = activeSession;
  const savingRevision = revision;

  let snapshot;

  try {
    snapshot = validateSnapshot(
      captureSnapshot()
    );
  } catch (error) {
    setStatus(error.message, "error");
    return false;
  }

  saveRecovery(pieceId, snapshot);

  setStatus("Saving your words… 💌");

  const operation = (async () => {
    try {
      const { data, error } = await db
        .from(TABLE)
        .update(snapshot)
        .eq("id", pieceId)
        .eq("user_id", currentUser.id)
        .select(
          "id,user_id,title,category,content_json," +
          "content_text,visibility,created_at,updated_at"
        )
        .single();

      if (error) throw error;

      if (
        session !== activeSession ||
        pieceId !== activePieceId
      ) {
        return false;
      }

      savedRevision = savingRevision;

      const index = pieces.findIndex(
        (piece) => piece.id === pieceId
      );

      if (index >= 0) {
        pieces[index] = data;
      } else {
        pieces.unshift(data);
      }

      pieces.sort(
        (a, b) =>
          new Date(b.updated_at) -
          new Date(a.updated_at)
      );

      renderStatistics();
      renderWritingPieces();

      if (revision === savingRevision) {
        clearRecovery(pieceId);
        setStatus(
          "Saved to your Writing Desk™ ✓",
          "saved"
        );
      } else {
        setStatus(
          "Saving your latest changes… 💌"
        );
      }

      return true;

    } catch (error) {
      console.error("Writing autosave failed:", error);

      if (
        session === activeSession &&
        pieceId === activePieceId
      ) {
        setStatus(
          "Save failed. Your changes are kept " +
          "for recovery. Try Save My Writing again.",
          "error"
        );
      }

      return false;
    }
  })();

  savePromise = operation;

  const result = await operation;

  if (savePromise === operation) {
    savePromise = null;
  }

  if (
    result &&
    editorOpen &&
    activePieceId === pieceId &&
    revision > savedRevision &&
    !closingEditor
  ) {
    clearTimeout(autosaveTimer);

    autosaveTimer = setTimeout(() => {
      void saveCurrentPiece();
    }, AUTOSAVE_DELAY);
  }

  return result;
}

/* ==========================================
   SAVE BUTTON
   ========================================== */

async function handleManualSave(event) {
  event.preventDefault();

  if (!editorOpen || closingEditor) return;

  clearTimeout(autosaveTimer);

  if (revision <= savedRevision) {
    revision++;
  }

  const button = $("saveWritingPiece");
  button.disabled = true;

  try {
    const saved = await saveCurrentPiece();

    if (saved && revision > savedRevision) {
      await saveCurrentPiece();
    }
  } finally {
    button.disabled = false;
  }
}

/* ==========================================
   CLOSE EDITOR
   ========================================== */

async function closeWritingEditor() {
  if (!editorOpen || closingEditor) return;

  closingEditor = true;

  clearTimeout(autosaveTimer);
  autosaveTimer = null;

  const button = $("cancelWritingEditor");
  button.disabled = true;

  try {
    if (savePromise) {
      await savePromise;
    }

    if (revision > savedRevision) {
      const saved = await saveCurrentPiece();

      if (!saved) {
        const closeAnyway = window.confirm(
          "💔 Your latest changes couldn't be " +
          "saved to Supabase.\n\n" +
          "A recovery copy may be available " +
          "on this browser.\n\n" +
          "Close anyway?"
        );

        if (!closeAnyway) {
          closingEditor = false;
          return;
        }
      }
    }

    activeSession++;
    activePieceId = null;
    editorOpen = false;

    $("writingEditorDialog").close();

  } finally {
    closingEditor = false;
    button.disabled = false;
  }
}

/* ==========================================
   DELETE PIECE
   ========================================== */

async function deleteWritingPiece() {
  if (!activePieceId || closingEditor) return;

  const confirmed = window.confirm(
    "🗑️ Delete this writing permanently?\n\n" +
    "Its reactions and comments will also be deleted. " +
    "This cannot be undone."
  );

  if (!confirmed) return;

  closingEditor = true;

  clearTimeout(autosaveTimer);
  autosaveTimer = null;

  const pieceId = activePieceId;
  const button = $("deleteWritingPiece");

  button.disabled = true;

  try {
    if (savePromise) {
      await savePromise;
    }

    const { error } = await db
      .from(TABLE)
      .delete()
      .eq("id", pieceId)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    clearRecovery(pieceId);

    pieces = pieces.filter(
      (piece) => piece.id !== pieceId
    );

    activeSession++;
    activePieceId = null;
    editorOpen = false;

    $("writingEditorDialog").close();

    renderStatistics();
    renderWritingPieces();

    showNotice(
      "🗑️ Your writing piece was deleted."
    );

  } catch (error) {
    console.error("Delete writing failed:", error);

    setStatus(
      "Couldn't delete this piece. " + error.message,
      "error"
    );

  } finally {
    closingEditor = false;
    button.disabled = false;
  }
}

/* ==========================================
   EVENT LISTENERS
   ========================================== */

function attachEvents() {
  $("createWritingPiece").addEventListener(
    "click",
    () => void createNewPiece()
  );

  $("writingEditorForm").addEventListener(
    "submit",
    handleManualSave
  );

  $("cancelWritingEditor").addEventListener(
    "click",
    () => void closeWritingEditor()
  );

  $("deleteWritingPiece").addEventListener(
    "click",
    () => void deleteWritingPiece()
  );

  for (const id of [
    "writingTitle",
    "writingCategory",
    "writingVisibility"
  ]) {
    $(id).addEventListener("input", markDirty);
    $(id).addEventListener("change", markDirty);
  }

  for (const id of [
    "writingSearch",
    "writingCategoryFilter",
    "writingVisibilityFilter"
  ]) {
    $(id).addEventListener(
      "input",
      renderWritingPieces
    );

    $(id).addEventListener(
      "change",
      renderWritingPieces
    );
  }

  // Prevent Esc from bypassing the save process.
  $("writingEditorDialog").addEventListener(
    "cancel",
    (event) => {
      event.preventDefault();
      void closeWritingEditor();
    }
  );

  // Warn before leaving with unsaved work.
  window.addEventListener(
    "beforeunload",
    (event) => {
      if (
        editorOpen &&
        revision > savedRevision
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
  );
}

/* ==========================================
   INITIALIZATION
   ========================================== */

async function initializeWritingStudio() {
  try {
    await requireAccess();

    const { data, error } =
      await db.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      throw new Error(
        "Please sign in to access your Writing Studio."
      );
    }

    currentUser = data.user;

    createWritingEditor(() => {
      markDirty();
    });

    editorReady = true;

    attachEvents();

    await loadWritingPieces();

    console.info(
      "🖋️ The Baddie Writing Studio™ is ready."
    );

  } catch (error) {
    console.error(
      "Writing Studio initialization failed:",
      error
    );

    showNotice(
      "💔 The Writing Studio couldn't load. " +
      error.message
    );

    const button = $("createWritingPiece");

    if (button) {
      button.disabled = true;
    }
  }
}

void initializeWritingStudio();
