
/* ==========================================
   TBB 2.0 — READING DIARY™
   STEP 2C — THE WRITING DESK™
   ========================================== */

import { db, requireAccess } from "./auth.js";

const $ = id => document.getElementById(id);

const DIARY_TABLE = "tbb_diary_entries";
const BOOKS_TABLE = "tbb_bookshelf_entries";

let diaryUser = null;
let diaryEntries = [];
let diaryBooks = [];
let diaryBusy = false;

const diaryTypes = {
  dear_diary: "💗 Dear Diary™",
  between_the_pages: "📖 Between the Pages™"
};

const safeText = value => String(value ?? "");

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

function createNode(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

/* ------------------------------------------
   SAFE RICH-TEXT CONTENT
   ------------------------------------------ */

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
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(color)) {
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

  function copySafe(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(
        document.createTextNode(node.textContent || "")
      );
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName;

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
      const font = node.style.fontFamily.replaceAll('"', "").replaceAll("'", "");
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

/* ------------------------------------------
   LOAD MY LIBRARY™
   ------------------------------------------ */

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
    ...new Set(records.map(b => b.community_book_id).filter(Boolean))
  ];

  async function fetchTitles(table, ids) {
    const titles = new Map();

    for (let start = 0; start < ids.length; start += 100) {
      const batch = ids.slice(start, start + 100);

      const { data, error } = await db
        .from(table)
        .select("id,title,author")
        .in("id", batch);

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

  diaryBooks.sort((a, b) => a.title.localeCompare(b.title));

  const select = $("diaryBookSelect");
  select.replaceChildren(new Option("Select your book...", ""));

  for (const book of diaryBooks) {
    select.add(new Option(
      `${book.title}${book.author ? " — " + book.author : ""}`,
      book.id
    ));
  }
}

/* ------------------------------------------
   LOAD DIARY ENTRIES
   ------------------------------------------ */

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

function renderDiaryStats() {
  const set = (id, count) => {
    if ($(id)) $(id).textContent = String(count);
  };

  set("diaryTotalEntries", diaryEntries.length);

  set(
    "diaryDearCount",
    diaryEntries.filter(e => e.diary_type === "dear_diary").length
  );

  set(
    "diaryPagesCount",
    diaryEntries.filter(e => e.diary_type === "between_the_pages").length
  );

  set(
    "diaryPrivateCount",
    diaryEntries.filter(e => e.visibility === "private").length
  );
}

/* ------------------------------------------
   RENDER MY DIARY COLLECTION
   ------------------------------------------ */

function renderDiaryEntries() {
  const container = $("diaryEntries");

  const query = $("diarySearch").value.trim().toLowerCase();
  const type = $("diaryTypeFilter").value;
  const visibility = $("diaryVisibilityFilter").value;

  const filtered = diaryEntries.filter(entry => {
    if (type !== "all" && entry.diary_type !== type) return false;

    if (visibility !== "all" && entry.visibility !== visibility) {
      return false;
    }

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
    const empty = createNode(
      "div",
      "library-empty-message",
      diaryEntries.length
        ? "💌 No entries match your search, Baddie."
        : "💌 Your diary is waiting for its first entry. Every unforgettable story starts somewhere!"
    );

    container.appendChild(empty);
    return;
  }

  for (const entry of filtered) {
    const card = createNode("article", "diary-entry-card");

    const meta = createNode("div", "diary-entry-meta");

    meta.appendChild(createNode(
      "span",
      "diary-entry-badge",
      diaryTypes[entry.diary_type] || "Diary Entry"
    ));

    meta.appendChild(createNode(
      "span",
      "diary-entry-badge",
      entry.visibility === "public" ? "🌎 Public" : "🔒 Private"
    ));

    if (entry.mood) {
      meta.appendChild(createNode(
        "span",
        "diary-entry-badge",
        entry.mood
      ));
    }

    card.appendChild(meta);

    card.appendChild(createNode(
      "h4",
      "",
      entry.title
    ));

    card.appendChild(createNode(
      "p",
      "diary-entry-date",
      new Date(entry.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    ));

    if (entry.bookshelf_entry_id) {
      const book = diaryBooks.find(
        b => b.id === entry.bookshelf_entry_id
      );

      card.appendChild(createNode(
        "p",
        "diary-entry-book",
        `📚 ${book?.title || "Book removed from My Library™"}`
      ));
    }

    const excerpt = plainDiaryText(entry.content_html);

    card.appendChild(createNode(
      "p",
      "diary-entry-excerpt",
      excerpt.length > 220
        ? excerpt.slice(0, 220) + "..."
        : excerpt || "A little memory waiting to be revisited. 💗"
    ));

    const button = createNode(
      "button",
      "",
      "Open My Entry 💌"
    );

    button.type = "button";
    button.addEventListener("click", () => openDiaryEditor(entry));

    card.appendChild(button);
    container.appendChild(card);
  }
}

/* ------------------------------------------
   THE WRITING DESK™
   ------------------------------------------ */

function updateDiaryBookField() {
  const isBookEntry =
    $("diaryEntryType").value === "between_the_pages";

  $("diaryBookField").hidden = !isBookEntry;
  $("diaryBookSelect").required = isBookEntry;

  if (!isBookEntry) {
    $("diaryBookSelect").value = "";
  }
}

function openDiaryEditor(entry = null, requestedType = "dear_diary") {
  const form = $("diaryEditorForm");
  form.reset();

  $("diaryContentEditor").replaceChildren();
  $("diaryEditingId").value = "";
  $("diaryVisibility").value = "private";
  $("diaryMood").value = "";

  diaryStatus("");

  // Media controls are reserved for the upload integration step.
  $("diaryMediaFile").value = "";
  $("diaryMediaPreview").replaceChildren();

  if (entry) {
    $("diaryEditingId").value = entry.id;
    $("diaryEntryType").value = entry.diary_type;
    $("diaryEntryTitle").value = entry.title;
    $("diaryMood").value = entry.mood || "";
    $("diaryVisibility").value = entry.visibility;

    updateDiaryBookField();

    if (entry.bookshelf_entry_id) {
      $("diaryBookSelect").value = entry.bookshelf_entry_id;
    }

    $("diaryContentEditor").innerHTML =
      sanitizeDiaryHTML(entry.content_html);

    $("diaryEditorHeading").textContent = "💌 Edit My Diary Entry";
    $("deleteDiaryEntry").hidden = false;
  } else {
    $("diaryEntryType").value = requestedType;
    updateDiaryBookField();

    $("diaryEditorHeading").textContent = "💌 The Writing Desk™";
    $("deleteDiaryEntry").hidden = true;
  }

  $("diaryEditorDialog").showModal();
}

function closeDiaryEditor() {
  if (diaryBusy) return;

  $("diaryEditorDialog").close();
}

/* ------------------------------------------
   SAVE ENTRY TO SUPABASE
   ------------------------------------------ */

async function saveDiaryEntry(event) {
  event.preventDefault();

  if (diaryBusy || !diaryUser) return;

  const id = $("diaryEditingId").value || null;
  const type = $("diaryEntryType").value;
  const title = $("diaryEntryTitle").value.trim();
  const bookId = $("diaryBookSelect").value || null;

  if (!title || title.length > 150) {
    diaryStatus("Please enter a title up to 150 characters.", true);
    return;
  }

  if (type === "between_the_pages" && !bookId) {
    diaryStatus("Choose a book from My Library™ first.", true);
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

  diaryBusy = true;
  $("saveDiaryEntry").disabled = true;
  $("deleteDiaryEntry").disabled = true;

  diaryStatus("Saving your words, Baddie... 💌");

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

    await loadDiaryEntries();

    diaryStatus("Your entry is saved! 💗");
    $("diaryEditorDialog").close();

  } catch (error) {
    diaryError(error);
  } finally {
    diaryBusy = false;
    $("saveDiaryEntry").disabled = false;
    $("deleteDiaryEntry").disabled = false;
  }
}

/* ------------------------------------------
   DELETE ENTRY
   ------------------------------------------ */

async function deleteDiaryEntry() {
  const id = $("diaryEditingId").value;

  if (!id || diaryBusy || !diaryUser) return;

  const confirmed = window.confirm(
    "Delete this diary entry permanently? This cannot be undone. 💔"
  );

  if (!confirmed) return;

  diaryBusy = true;
  $("saveDiaryEntry").disabled = true;
  $("deleteDiaryEntry").disabled = true;

  diaryStatus("Deleting your entry...");

  try {
    const { error } = await db
      .from(DIARY_TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", diaryUser.id);

    if (error) throw error;

    await loadDiaryEntries();
    $("diaryEditorDialog").close();

  } catch (error) {
    diaryError(error);
  } finally {
    diaryBusy = false;
    $("saveDiaryEntry").disabled = false;
    $("deleteDiaryEntry").disabled = false;
  }
}

/* ------------------------------------------
   RICH-TEXT FORMATTING
   ------------------------------------------ */

function formatDiary(command, value = null) {
  const editor = $("diaryContentEditor");
  editor.focus();

  // Browser editing commands support the existing toolbar.
  document.execCommand(command, false, value);
}

function setupDiaryFormatting() {
  const toolbar = document.querySelector(".diary-format-toolbar");

  // Preserve the text selection when clicking formatting buttons.
  toolbar.querySelectorAll("[data-diary-command]").forEach(button => {
    button.addEventListener("mousedown", event => {
      event.preventDefault();
    });

    button.addEventListener("click", () => {
      formatDiary(button.dataset.diaryCommand);
    });
  });

  $("diaryFontFamily").addEventListener("change", event => {
    formatDiary("fontName", event.target.value);
  });

  $("diaryInkColor").addEventListener("input", event => {
    formatDiary("foreColor", event.target.value);
  });
}

/* ------------------------------------------
   EVENTS
   ------------------------------------------ */

function setupDiaryEvents() {
  $("createDearDiary").addEventListener("click", () => {
    openDiaryEditor(null, "dear_diary");
  });

  $("createBetweenPages").addEventListener("click", async () => {
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
      window.alert("Couldn't load your books. Please try again.");
    }
  });

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

  $("diaryEditorDialog").addEventListener("cancel", event => {
    if (diaryBusy) event.preventDefault();
  });

  setupDiaryFormatting();
}

/* ------------------------------------------
   INITIALIZE READING DIARY™
   ------------------------------------------ */

async function initReadingDiary() {
  if (!$("readingDiary")) return;

  try {
    const access = await requireAccess();
    if (!access) return;

    diaryUser = access.user;

    setupDiaryEvents();

    await Promise.all([
      loadDiaryBooks(),
      loadDiaryEntries()
    ]);

    // The upload UI is disabled until the media-storage step.
    $("diaryMediaFile").disabled = true;

    const mediaHelp = $("diaryMediaFile")
      .closest(".diary-editor-field")
      .querySelector(".library-helper");

    if (mediaHelp) {
      mediaHelp.textContent =
        "Photo and GIF uploads are coming in the next step. 💗";
    }

    console.log("Reading Diary™ is ready! 💌");

  } catch (error) {
    console.error("Reading Diary™ initialization:", error);

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
