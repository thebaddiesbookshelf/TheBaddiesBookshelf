
/* ==========================================
   TBB 2.0 — READING DIARY™
   STEP 2E — AUTOSAVE & DRAFT RECOVERY
   ========================================== */

import { db, requireAccess } from "./auth.js";

import {
  initializeDiaryMedia,
  openDiaryMedia,
  closeDiaryMedia,
  saveDiaryMedia,
  deleteDiaryMedia
} from "./diary-media.js";

const $ = id => document.getElementById(id);

const DIARY_TABLE = "tbb_diary_entries";
const BOOKS_TABLE = "tbb_bookshelf_entries";
const DRAFT_PREFIX = "tbb-reading-diary-draft-v1";
const DRAFT_DELAY = 800;

let diaryUser = null;
let diaryEntries = [];
let diaryBooks = [];
let diaryBusy = false;

let draftTimer = null;
let editorDirty = false;
let editorReady = false;
let activeDraftKey = null;
let editorSession = 0;

const diaryTypes = {
  dear_diary: "💗 Dear Diary™",
  between_the_pages: "📖 Between the Pages™"
};

/* ==========================================
   HELPERS
   ========================================== */

function createNode(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function diaryStatus(message, error = false) {
  const target = $("diaryEditorStatus");
  if (!target) return;

  target.textContent = message;
  target.style.color = error ? "#ffaaaa" : "var(--light)";
}

function diaryError(error) {
  console.error("Reading Diary™:", error);
  diaryStatus(
    error?.message || "Something went wrong. Please try again.",
    true
  );
}

/* ==========================================
   SAFE RICH TEXT
   ========================================== */

const allowedTags = new Set([
  "B", "STRONG", "I", "EM", "U", "S",
  "P", "DIV", "BR", "UL", "OL", "LI",
  "SPAN", "FONT"
]);

const allowedFonts = new Set([
  "Trebuchet MS",
  "Georgia",
  "Times New Roman",
  "Arial",
  "Courier New"
]);

function cleanColor(value) {
  const color = String(value || "").trim();

  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;

  if (
    /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(color)
  ) {
    return color;
  }

  return "";
}

function sanitizeDiaryHTML(html) {
  const source = new DOMParser().parseFromString(
    `<div>${html || ""}</div>`,
    "text/html"
  );

  const wrapper = source.body.firstElementChild;
  const output = document.createElement("div");

  const blockedTags = new Set([
    "SCRIPT", "STYLE", "IFRAME", "OBJECT",
    "EMBED", "SVG", "MATH", "TEMPLATE",
    "FORM", "INPUT", "BUTTON"
  ]);

  function copySafe(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(
        document.createTextNode(node.textContent || "")
      );
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName;

    if (blockedTags.has(tag)) return;

    if (!allowedTags.has(tag)) {
      for (const child of Array.from(node.childNodes)) {
        copySafe(child, parent);
      }
      return;
    }

    const element = document.createElement(
      tag === "FONT" ? "span" : tag.toLowerCase()
    );

    if (tag === "FONT") {
      const face = node.getAttribute("face");
      const color = cleanColor(node.getAttribute("color"));

      if (allowedFonts.has(face)) {
        element.style.fontFamily = face;
      }

      if (color) element.style.color = color;
    }

    if (tag === "SPAN") {
      const font = node.style.fontFamily
        .replaceAll('"', "")
        .replaceAll("'", "");

      const color = cleanColor(node.style.color);

      if (allowedFonts.has(font)) {
        element.style.fontFamily = font;
      }

      if (color) element.style.color = color;
    }

    for (const child of Array.from(node.childNodes)) {
      copySafe(child, element);
    }

    parent.appendChild(element);
  }

  for (const child of Array.from(wrapper.childNodes)) {
    copySafe(child, output);
  }

  return output.innerHTML;
}

function plainDiaryText(html) {
  const element = document.createElement("div");
  element.innerHTML = sanitizeDiaryHTML(html);
  return element.textContent || "";
}

/* ==========================================
   DRAFT STORAGE
   ========================================== */

function getDraftKey(entryId = null) {
  if (!diaryUser) return null;

  const identity = entryId || "new";

  return `${DRAFT_PREFIX}:${diaryUser.id}:${identity}`;
}

function readDraft(key) {
  if (!key) return null;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const draft = JSON.parse(raw);

    if (
      !draft ||
      draft.userId !== diaryUser?.id ||
      typeof draft.title !== "string" ||
      typeof draft.contentHtml !== "string"
    ) {
      return null;
    }

    return draft;
  } catch (error) {
    console.warn("Diary draft unavailable:", error);
    return null;
  }
}

function removeDraft(key) {
  if (!key) return;

  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("Could not clear diary draft:", error);
  }
}

function draftSnapshot() {
  return {
    version: 1,
    userId: diaryUser.id,
    entryId: $("diaryEditingId").value || null,
    type: $("diaryEntryType").value,
    bookId: $("diaryBookSelect").value || null,
    title: $("diaryEntryTitle").value,
    contentHtml: sanitizeDiaryHTML(
      $("diaryContentEditor").innerHTML
    ),
    mood: $("diaryMood").value,
    visibility: $("diaryVisibility").value,
    savedAt: new Date().toISOString()
  };
}

function writeDraft() {
  clearTimeout(draftTimer);
  draftTimer = null;

  if (
    !diaryUser ||
    !editorReady ||
    !editorDirty ||
    diaryBusy ||
    !$("diaryEditorDialog").open
  ) {
    return;
  }

  const key = activeDraftKey;
  if (!key) return;

  try {
    localStorage.setItem(
      key,
      JSON.stringify(draftSnapshot())
    );

    diaryStatus("Draft saved on this device 💌");
  } catch (error) {
    console.warn("Diary autosave failed:", error);

    diaryStatus(
      "Automatic draft saving is unavailable on this device.",
      true
    );
  }
}

function scheduleDraft() {
  if (!editorReady || diaryBusy) return;

  editorDirty = true;

  clearTimeout(draftTimer);

  diaryStatus("Unsaved changes...");

  draftTimer = setTimeout(
    writeDraft,
    DRAFT_DELAY
  );
}

function applyDraft(draft) {
  if (!draft) return;

  $("diaryEntryType").value =
    ["dear_diary", "between_the_pages"].includes(draft.type)
      ? draft.type
      : "dear_diary";

  updateDiaryBookField();

  $("diaryBookSelect").value = draft.bookId || "";
  $("diaryEntryTitle").value = draft.title || "";
  $("diaryContentEditor").innerHTML =
    sanitizeDiaryHTML(draft.contentHtml);

  $("diaryMood").value = draft.mood || "";

  $("diaryVisibility").value =
    draft.visibility === "public"
      ? "public"
      : "private";

  editorDirty = true;

  diaryStatus("Your unfinished writing was recovered! 💗");
}

function restoreDraftIfAvailable(entryId = null) {
  const key = getDraftKey(entryId);
  activeDraftKey = key;

  const draft = readDraft(key);

  if (!draft) return;

  const date = new Date(draft.savedAt);

  const dateText = Number.isNaN(date.getTime())
    ? "an earlier session"
    : date.toLocaleString();

  const restore = window.confirm(
    `💌 An unfinished diary draft was found from ${dateText}.\n\n` +
    "Press OK to restore it, or Cancel to discard that draft."
  );

  if (restore) {
    applyDraft(draft);
  } else {
    removeDraft(key);
  }
}

function clearCurrentDraft() {
  clearTimeout(draftTimer);
  draftTimer = null;

  removeDraft(activeDraftKey);

  editorDirty = false;
}

function setupDraftEvents() {
  const fields = [
    "diaryEntryTitle",
    "diaryEntryType",
    "diaryBookSelect",
    "diaryMood",
    "diaryVisibility"
  ];

  for (const id of fields) {
    $(id).addEventListener("input", scheduleDraft);
    $(id).addEventListener("change", scheduleDraft);
  }

  $("diaryContentEditor").addEventListener(
    "input",
    scheduleDraft
  );

  window.addEventListener("beforeunload", event => {
    if (!editorReady || !editorDirty || diaryBusy) {
      return;
    }

    writeDraft();

    event.preventDefault();
    event.returnValue = "";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      writeDraft();
    }
  });
}

/* ==========================================
   LOAD MY LIBRARY™
   ========================================== */

async function loadDiaryBooks() {
  const records = [];

  for (let start = 0; ; start += 500) {
    const { data, error } = await db
      .from(BOOKS_TABLE)
      .select("id,book_id,community_book_id")
      .eq("user_id", diaryUser.id)
      .order("id")
      .range(start, start + 499);

    if (error) throw error;

    records.push(...(data || []));

    if (!data || data.length < 500) break;
  }

  const officialIds = [
    ...new Set(records.map(b => b.book_id).filter(Boolean))
  ];

  const communityIds = [
    ...new Set(
      records.map(b => b.community_book_id).filter(Boolean)
    )
  ];

  async function fetchTitles(table, ids) {
    const titles = new Map();

    for (let start = 0; start < ids.length; start += 100) {
      const { data, error } = await db
        .from(table)
        .select("id,title,author")
        .in("id", ids.slice(start, start + 100));

      if (error) throw error;

      for (const book of data || []) {
        titles.set(book.id, book);
      }
    }

    return titles;
  }

  const [official, community] = await Promise.all([
    fetchTitles("tbb_books", officialIds),
    fetchTitles("tbb_community_books", communityIds)
  ]);

  diaryBooks = records.map(record => {
    const book = record.community_book_id
      ? community.get(record.community_book_id)
      : official.get(record.book_id);

    return {
      id: record.id,
      title: book?.title || "Book no longer available",
      author: book?.author || ""
    };
  });

  diaryBooks.sort((a, b) =>
    a.title.localeCompare(b.title)
  );

  const select = $("diaryBookSelect");

  select.replaceChildren(
    new Option("Select your book...", "")
  );

  for (const book of diaryBooks) {
    select.add(
      new Option(
        `${book.title}${book.author ? " — " + book.author : ""}`,
        book.id
      )
    );
  }
}

/* ==========================================
   LOAD ENTRIES
   ========================================== */

async function loadDiaryEntries() {
  const records = [];

  for (let start = 0; ; start += 500) {
    const { data, error } = await db
      .from(DIARY_TABLE)
      .select(
        "id,user_id,bookshelf_entry_id,diary_type,title,content_html,mood,visibility,created_at,updated_at"
      )
      .eq("user_id", diaryUser.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + 499);

    if (error) throw error;

    records.push(...(data || []));

    if (!data || data.length < 500) break;
  }

  diaryEntries = records;

  renderDiaryStats();
  renderDiaryEntries();
}

/* ==========================================
   STATISTICS
   ========================================== */

function renderDiaryStats() {
  const set = (id, value) => {
    if ($(id)) $(id).textContent = String(value);
  };

  set("diaryTotalEntries", diaryEntries.length);

  set(
    "diaryDearCount",
    diaryEntries.filter(
      e => e.diary_type === "dear_diary"
    ).length
  );

  set(
    "diaryPagesCount",
    diaryEntries.filter(
      e => e.diary_type === "between_the_pages"
    ).length
  );

  set(
    "diaryPrivateCount",
    diaryEntries.filter(
      e => e.visibility === "private"
    ).length
  );
}

/* ==========================================
   DIARY COLLECTION
   ========================================== */

function renderDiaryEntries() {
  const container = $("diaryEntries");

  const query = $("diarySearch")
    .value.trim()
    .toLowerCase();

  const type = $("diaryTypeFilter").value;
  const visibility = $("diaryVisibilityFilter").value;

  const filtered = diaryEntries.filter(entry => {
    if (
      type !== "all" &&
      entry.diary_type !== type
    ) return false;

    if (
      visibility !== "all" &&
      entry.visibility !== visibility
    ) return false;

    const book = diaryBooks.find(
      b => b.id === entry.bookshelf_entry_id
    );

    const searchable = [
      entry.title,
      plainDiaryText(entry.content_html),
      book?.title,
      book?.author
    ].join(" ").toLowerCase();

    return searchable.includes(query);
  });

  container.replaceChildren();

  if (!filtered.length) {
    container.appendChild(
      createNode(
        "div",
        "library-empty-message",
        diaryEntries.length
          ? "💌 No entries match your search, Baddie."
          : "💌 Your diary is waiting for its first entry. Every unforgettable story starts somewhere!"
      )
    );
    return;
  }

  for (const entry of filtered) {
    const card = createNode(
      "article",
      "diary-entry-card"
    );

    const meta = createNode(
      "div",
      "diary-entry-meta"
    );

    meta.appendChild(
      createNode(
        "span",
        "diary-entry-badge",
        diaryTypes[entry.diary_type] || "Diary Entry"
      )
    );

    meta.appendChild(
      createNode(
        "span",
        "diary-entry-badge",
        entry.visibility === "public"
          ? "🌎 Public"
          : "🔒 Private"
      )
    );

    if (entry.mood) {
      meta.appendChild(
        createNode(
          "span",
          "diary-entry-badge",
          entry.mood
        )
      );
    }

    card.appendChild(meta);

    card.appendChild(
      createNode("h4", "", entry.title)
    );

    card.appendChild(
      createNode(
        "p",
        "diary-entry-date",
        new Date(entry.created_at).toLocaleDateString(
          undefined,
          {
            year: "numeric",
            month: "long",
            day: "numeric"
          }
        )
      )
    );

    if (entry.bookshelf_entry_id) {
      const book = diaryBooks.find(
        b => b.id === entry.bookshelf_entry_id
      );

      card.appendChild(
        createNode(
          "p",
          "diary-entry-book",
          `📚 ${book?.title || "Book removed from My Library™"}`
        )
      );
    }

    const excerpt = plainDiaryText(
      entry.content_html
    );

    card.appendChild(
      createNode(
        "p",
        "diary-entry-excerpt",
        excerpt.length > 220
          ? excerpt.slice(0, 220) + "..."
          : excerpt ||
            "A little memory waiting to be revisited. 💗"
      )
    );

    const button = createNode(
      "button",
      "",
      "Open My Entry 💌"
    );

    button.type = "button";

    button.addEventListener("click", () => {
      openDiaryEditor(entry);
    });

    card.appendChild(button);
    container.appendChild(card);
  }
}

/* ==========================================
   WRITING DESK
   ========================================== */

function updateDiaryBookField() {
  const isBookEntry =
    $("diaryEntryType").value === "between_the_pages";

  $("diaryBookField").hidden = !isBookEntry;
  $("diaryBookSelect").required = isBookEntry;

  if (!isBookEntry) {
    $("diaryBookSelect").value = "";
  }
}

function openDiaryEditor(
  entry = null,
  requestedType = "dear_diary"
) {
  if (diaryBusy) return;

  editorSession++;
  const session = editorSession;

  editorReady = false;
  editorDirty = false;

  clearTimeout(draftTimer);
  draftTimer = null;

  const form = $("diaryEditorForm");
  form.reset();

  $("diaryContentEditor").replaceChildren();
  $("diaryEditingId").value = "";
  $("diaryVisibility").value = "private";
  $("diaryMood").value = "";

  diaryStatus("");

  if (entry) {
    $("diaryEditingId").value = entry.id;
    $("diaryEntryType").value = entry.diary_type;
    $("diaryEntryTitle").value = entry.title;
    $("diaryMood").value = entry.mood || "";
    $("diaryVisibility").value = entry.visibility;

    updateDiaryBookField();

    if (entry.bookshelf_entry_id) {
      $("diaryBookSelect").value =
        entry.bookshelf_entry_id;
    }

    $("diaryContentEditor").innerHTML =
      sanitizeDiaryHTML(entry.content_html);

    $("diaryEditorHeading").textContent =
      "💌 Edit My Diary Entry";

    $("deleteDiaryEntry").hidden = false;
  } else {
    $("diaryEntryType").value = requestedType;
    updateDiaryBookField();

    $("diaryEditorHeading").textContent =
      "💌 The Writing Desk™";

    $("deleteDiaryEntry").hidden = true;
  }

  $("diaryEditorDialog").showModal();

  restoreDraftIfAvailable(entry?.id || null);

  editorReady = true;

  void openDiaryMedia(entry?.id || null).then(() => {
    if (session !== editorSession) return;
  });
}

/* ==========================================
   CLOSE & DISCARD PROTECTION
   ========================================== */

function closeDiaryEditor() {
  if (diaryBusy) return;

  if (editorDirty) {
    writeDraft();

    const discard = window.confirm(
      "You have unfinished writing, Baddie! 💌\n\n" +
      "Press OK to close and keep a recovery draft " +
      "on this device.\n\n" +
      "Press Cancel to continue writing."
    );

    if (!discard) return;
  }

  editorSession++;
  editorReady = false;
  editorDirty = false;

  clearTimeout(draftTimer);
  draftTimer = null;

  closeDiaryMedia();

  $("diaryEditorDialog").close();
}

/* ==========================================
   SAVE DIARY + MEDIA
   ========================================== */

async function saveDiaryEntry(event) {
  event.preventDefault();

  if (diaryBusy || !diaryUser) return;

  const id = $("diaryEditingId").value || null;
  const type = $("diaryEntryType").value;
  const title = $("diaryEntryTitle").value.trim();
  const bookId = $("diaryBookSelect").value || null;

  if (!title || title.length > 150) {
    diaryStatus(
      "Please enter a title up to 150 characters.",
      true
    );
    return;
  }

  if (type === "between_the_pages" && !bookId) {
    diaryStatus(
      "Choose a book from My Library™ first.",
      true
    );
    return;
  }

  const content = sanitizeDiaryHTML(
    $("diaryContentEditor").innerHTML
  );

  const payload = {
    diary_type: type,
    bookshelf_entry_id:
      type === "between_the_pages" ? bookId : null,
    title,
    content_html: content,
    mood: $("diaryMood").value || null,
    visibility: $("diaryVisibility").value
  };

  clearTimeout(draftTimer);
  draftTimer = null;

  // Preserve writing before beginning network requests.
  if (editorDirty) writeDraft();

  diaryBusy = true;

  $("saveDiaryEntry").disabled = true;
  $("deleteDiaryEntry").disabled = true;

  diaryStatus("Saving your memories, Baddie... 💌");

  let savedEntryId = id;

  try {
    let result;

    if (id) {
      result = await db
        .from(DIARY_TABLE)
        .update(payload)
        .eq("id", id)
        .eq("user_id", diaryUser.id)
        .select("id")
        .single();
    } else {
      result = await db
        .from(DIARY_TABLE)
        .insert({
          ...payload,
          user_id: diaryUser.id
        })
        .select("id")
        .single();
    }

    if (result.error) throw result.error;

    savedEntryId = result.data.id;

    $("diaryEditingId").value = savedEntryId;
    $("deleteDiaryEntry").hidden = false;

    // Existing media module uploads files only after
    // the diary record exists.
    await saveDiaryMedia(savedEntryId);

    await loadDiaryEntries();

    // Clear only after the database and media steps
    // have both completed successfully.
    clearCurrentDraft();

    // A newly created entry may have had a "new" draft.
    // Ensure its temporary draft is also removed.
    if (!id) {
      removeDraft(getDraftKey(null));
    }

    editorReady = false;
    editorSession++;

    closeDiaryMedia();

    $("diaryEditorDialog").close();

  } catch (error) {
    console.error("Reading Diary™ save:", error);

    editorDirty = true;

    // Move recovery draft to the saved record's ID
    // if the database insert succeeded.
    if (savedEntryId && !id) {
      const oldKey = activeDraftKey;
      activeDraftKey = getDraftKey(savedEntryId);

      removeDraft(oldKey);
    }

    // Save recovery content even if media upload failed.
    diaryBusy = false;
    writeDraft();
    diaryBusy = true;

    diaryStatus(
      "Your entry could not be fully saved. " +
      "Your writing has been kept as a recovery draft. " +
      "Please retry. " +
      (error?.message || ""),
      true
    );

  } finally {
    diaryBusy = false;

    $("saveDiaryEntry").disabled = false;
    $("deleteDiaryEntry").disabled = false;
  }
}

/* ==========================================
   DELETE DIARY + MEDIA
   ========================================== */

async function deleteDiaryEntry() {
  const id = $("diaryEditingId").value;

  if (!id || diaryBusy || !diaryUser) return;

  const confirmed = window.confirm(
    "Delete this diary entry and its attachments permanently? This cannot be undone. 💔"
  );

  if (!confirmed) return;

  clearTimeout(draftTimer);
  draftTimer = null;

  diaryBusy = true;

  $("saveDiaryEntry").disabled = true;
  $("deleteDiaryEntry").disabled = true;

  diaryStatus("Deleting your entry...");

  try {
    await deleteDiaryMedia(id);

    const { error } = await db
      .from(DIARY_TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", diaryUser.id);

    if (error) throw error;

    await loadDiaryEntries();

    clearCurrentDraft();

    editorReady = false;
    editorSession++;

    closeDiaryMedia();
    $("diaryEditorDialog").close();

  } catch (error) {
    diaryError(error);

  } finally {
    diaryBusy = false;

    $("saveDiaryEntry").disabled = false;
    $("deleteDiaryEntry").disabled = false;
  }
}

/* ==========================================
   FORMATTING TOOLS
   ========================================== */

function formatDiary(command, value = null) {
  const editor = $("diaryContentEditor");
  editor.focus();

  document.execCommand(command, false, value);

  scheduleDraft();
}

function setupDiaryFormatting() {
  const toolbar = document.querySelector(
    ".diary-format-toolbar"
  );

  if (!toolbar) return;

  toolbar
    .querySelectorAll("[data-diary-command]")
    .forEach(button => {
      button.addEventListener("mousedown", event => {
        event.preventDefault();
      });

      button.addEventListener("click", () => {
        formatDiary(button.dataset.diaryCommand);
      });
    });

  $("diaryFontFamily").addEventListener(
    "change",
    event => {
      formatDiary("fontName", event.target.value);
    }
  );

  $("diaryInkColor").addEventListener(
    "input",
    event => {
      formatDiary("foreColor", event.target.value);
    }
  );
}

/* ==========================================
   EVENTS
   ========================================== */

function setupDiaryEvents() {
  $("createDearDiary").addEventListener("click", () => {
    openDiaryEditor(null, "dear_diary");
  });

  $("createBetweenPages").addEventListener(
    "click",
    async () => {
      try {
        await loadDiaryBooks();

        if (!diaryBooks.length) {
          window.alert(
            "Add a book to My Library™ first, Baddie! 📚💗"
          );
          return;
        }

        openDiaryEditor(null, "between_the_pages");

      } catch (error) {
        console.error(error);
        window.alert(
          "Couldn't load your books. Please try again."
        );
      }
    }
  );

  $("diaryEntryType").addEventListener(
    "change",
    updateDiaryBookField
  );

  $("diarySearch").addEventListener(
    "input",
    renderDiaryEntries
  );

  $("diaryTypeFilter").addEventListener(
    "change",
    renderDiaryEntries
  );

  $("diaryVisibilityFilter").addEventListener(
    "change",
    renderDiaryEntries
  );

  $("diaryEditorForm").addEventListener(
    "submit",
    saveDiaryEntry
  );

  $("cancelDiaryEditor").addEventListener(
    "click",
    closeDiaryEditor
  );

  $("deleteDiaryEntry").addEventListener(
    "click",
    deleteDiaryEntry
  );

  $("diaryEditorDialog").addEventListener(
    "cancel",
    event => {
      event.preventDefault();

      if (!diaryBusy) {
        closeDiaryEditor();
      }
    }
  );

  $("diaryEditorDialog").addEventListener(
    "close",
    () => {
      editorReady = false;
      editorSession++;

      clearTimeout(draftTimer);
      draftTimer = null;

      closeDiaryMedia();
    }
  );

  setupDiaryFormatting();
  setupDraftEvents();
}

/* ==========================================
   INITIALIZATION
   ========================================== */

async function initReadingDiary() {
  if (!$("readingDiary")) return;

  try {
    const access = await requireAccess();

    if (!access) return;

    diaryUser = access.user;

    initializeDiaryMedia(diaryUser.id);

    setupDiaryEvents();

    await Promise.all([
      loadDiaryBooks(),
      loadDiaryEntries()
    ]);

    console.log(
      "Reading Diary™ Step 2E ready! 💌"
    );

  } catch (error) {
    console.error(
      "Reading Diary™ initialization:",
      error
    );

    const container = $("diaryEntries");

    if (container) {
      container.replaceChildren(
        createNode(
          "div",
          "library-empty-message",
          "Reading Diary™ couldn't load. Please refresh and try again."
        )
      );
    }
  }
}

initReadingDiary();

/* ==========================================
   END — READING DIARY™ STEP 2E
   ========================================== */
