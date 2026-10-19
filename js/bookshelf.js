
/* ==========================================
   TBB 2.0 — THE BOOKSHELF™
   PHASE 5 | STEP 4F.3
   MY LIBRARY™ — LIVE SUPABASE
   ========================================== */

import {
  db,
  requireAccess,
  logout
} from "./auth.js";

const $ = id => document.getElementById(id);

const themes = {
  romi: {
    accent: "#ff4da6",
    light: "#ffb5da",
    bg: "#130d17",
    surface: "#241727",
    alt: "#332036",
    border: "#65415d",
    label: "💗 Romi Era"
  },
  nyx: {
    accent: "#ff319d",
    light: "#ffa0d5",
    bg: "#09090d",
    surface: "#1b1520",
    alt: "#302034",
    border: "#63365e",
    label: "🖤 Nyx Era"
  },
  nova: {
    accent: "#b77cff",
    light: "#ddbdff",
    bg: "#120d23",
    surface: "#241a3c",
    alt: "#362650",
    border: "#665087",
    label: "🔮 Nova Era"
  },
  sage: {
    accent: "#c99b69",
    light: "#f1cba0",
    bg: "#17120e",
    surface: "#30251e",
    alt: "#46362a",
    border: "#79604a",
    label: "🍂 Sage Era"
  },
  scarlet: {
    accent: "#f34a65",
    light: "#ffabb7",
    bg: "#180c12",
    surface: "#30171f",
    alt: "#47232c",
    border: "#85414e",
    label: "❤️ Scarlett Era"
  }
};

const statusLabels = {
  want_to_read: "💗 Want to Read",
  currently_reading: "📖 Currently Reading",
  finished: "✨ Finished",
  on_hold: "⏸️ On Hold",
  dnf: "💔 DNF"
};

const ENTRY_COLUMNS = [
  "id",
  "user_id",
  "book_id",
  "reading_status",
  "book_format",
  "total_pages",
  "current_page",
  "rating",
  "started_at",
  "finished_at"
].join(",");

const BOOK_COLUMNS = [
  "id",
  "title",
  "author",
  "cover_url",
  "cover_storage_path",
  "is_archived"
].join(",");

let currentUser = null;
let myEntries = [];
let catalogBooks = new Map();
let activeSearchResults = [];
let searchBusy = false;
let editorBusy = false;
let addBusy = false;

function notify(text, error = false) {
  const element = $("message");
  if (!element) return;

  element.textContent = text;
  element.className = error
    ? "bookshelf-notice error"
    : "bookshelf-notice";
}

function applyTheme(name) {
  const normalized =
    name === "scarlett" ? "scarlet" : name;

  const theme = themes[normalized] || themes.romi;

  for (const key of [
    "accent",
    "light",
    "bg",
    "surface",
    "alt",
    "border"
  ]) {
    document.documentElement.style.setProperty(
      `--${key}`,
      theme[key]
    );
  }

  $("bookshelfTheme").textContent = theme.label;
}

async function loadOwnerProfile() {
  const { data, error } = await db
    .from("tbb_profiles")
    .select("display_name,username,vanity_theme")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("Your Library Card was not found.");
  }

  const name =
    data.display_name || data.username || "Baddie";

  $("bookshelfOwner").textContent =
    `📚 ${name}'s Bookshelf`;

  applyTheme(data.vanity_theme);
}

async function countRows(table, filters = []) {
  let query = db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", currentUser.id);

  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }

  const { count, error } = await query;

  if (error) throw error;

  return count ?? 0;
}

async function loadReadingStats() {
  const [
    total,
    reading,
    finished,
    shelves
  ] = await Promise.all([
    countRows("tbb_bookshelf_entries"),
    countRows("tbb_bookshelf_entries", [
      ["reading_status", "currently_reading"]
    ]),
    countRows("tbb_bookshelf_entries", [
      ["reading_status", "finished"]
    ]),
    countRows("tbb_custom_shelves")
  ]);

  $("totalBooks").textContent = total;
  $("currentlyReading").textContent = reading;
  $("finishedBooks").textContent = finished;
  $("customShelfCount").textContent = shelves;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

function showEmpty(container, text) {
  container.replaceChildren(
    createElement("div", "library-empty-message", text)
  );
}

function safeCoverUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value, window.location.href);

    if (!["https:", "http:"].includes(url.protocol)) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function createCover(book) {
  const wrapper = createElement(
    "div",
    "library-book-cover"
  );

  const fallback = createElement(
    "div",
    "library-cover-fallback",
    `📚 ${book.title || "Untitled"}`
  );

  const url = safeCoverUrl(book.cover_url);

  if (!url) {
    wrapper.append(fallback);
    return wrapper;
  }

  const img = document.createElement("img");
  img.src = url;
  img.alt = `Cover of ${book.title}`;
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";

  img.addEventListener("error", () => {
    img.replaceWith(fallback);
  });

  wrapper.append(img);
  return wrapper;
}

function createBookCard(book, entry = null) {
  const card = createElement(
    "article",
    "library-book-card"
  );

  card.append(createCover(book));

  const info = createElement(
    "div",
    "library-book-info"
  );

  info.append(
    createElement(
      "h4",
      "",
      book.title || "Untitled Book"
    )
  );

  info.append(
    createElement(
      "p",
      "library-book-author",
      book.author || "Unknown Author"
    )
  );

  if (entry) {
    info.append(
      createElement(
        "span",
        "library-book-status",
        statusLabels[entry.reading_status] ||
          entry.reading_status
      )
    );

    if (entry.total_pages) {
      const current = entry.current_page ?? 0;
      const percent = Math.round(
        (current / entry.total_pages) * 100
      );

      info.append(
        createElement(
          "p",
          "library-book-progress",
          `📖 ${current}/${entry.total_pages} pages (${percent}%)`
        )
      );
    }

    if (entry.rating !== null &&
        entry.rating !== undefined) {
      info.append(
        createElement(
          "p",
          "library-book-rating",
          `⭐ ${entry.rating}/5`
        )
      );
    }
  }

  const button = createElement(
    "button",
    "",
    entry ? "Edit My Book 💋" : "Add to Library 💗"
  );

  button.type = "button";
  button.dataset.bookId = book.id;
  button.dataset.action = entry ? "edit" : "add";

  if (!entry && myEntries.some(
    item => item.book_id === book.id
  )) {
    button.textContent = "Already in My Library ✓";
    button.disabled = true;
  }

  info.append(button);
  card.append(info);

  return card;
}

async function fetchCatalogBooks(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const missing = uniqueIds.filter(
    id => !catalogBooks.has(id)
  );

  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);

    const { data, error } = await db
      .from("tbb_books")
      .select(BOOK_COLUMNS)
      .in("id", batch);

    if (error) throw error;

    for (const book of data || []) {
      catalogBooks.set(book.id, book);
    }
  }
}

async function loadMyCollection() {
  const allEntries = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("tbb_bookshelf_entries")
      .select(ENTRY_COLUMNS)
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    allEntries.push(...(data || []));

    if (!data || data.length < pageSize) break;
  }

  myEntries = allEntries;

  await fetchCatalogBooks(
    myEntries.map(entry => entry.book_id)
  );

  renderMyCollection();
}

function renderMyCollection() {
  const container = $("myBookCollection");
  const filter = $("libraryStatusFilter").value;

  container.replaceChildren();

  const entries = myEntries.filter(entry =>
    filter === "all" ||
    entry.reading_status === filter
  );

  if (!entries.length) {
    showEmpty(
      container,
      filter === "all"
        ? "Your Library is waiting for its first book! 💗"
        : "No books match this reading status yet."
    );
    return;
  }

  for (const entry of entries) {
    const book = catalogBooks.get(entry.book_id);

    if (!book) {
      const missingBook = {
        id: entry.book_id,
        title: "Catalog Book Unavailable",
        author: "Reading record retained",
        cover_url: null
      };

      container.append(
        createBookCard(missingBook, entry)
      );
      continue;
    }

    container.append(
      createBookCard(book, entry)
    );
  }
}

async function searchCatalog() {
  if (!currentUser || searchBusy) return;

  const term = $("bookSearch").value.trim();
  const container = $("catalogResults");
  const button = $("searchCatalog");

  if (term.length < 2) {
    showEmpty(
      container,
      "Enter at least two characters to search."
    );
    return;
  }

  searchBusy = true;
  button.disabled = true;
  button.textContent = "Searching...";

  try {
    // Escape PostgREST filter punctuation before
    // constructing the title/author OR expression.
    const escaped = term
      .replace(/[\\%_(),.*"]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (escaped.length < 2) {
      throw new Error(
        "Please search using at least two letters or numbers."
      );
    }

    const { data, error } = await db
      .from("tbb_books")
      .select(BOOK_COLUMNS)
      .eq("is_archived", false)
      .or(
        `title.ilike.%${escaped}%,author.ilike.%${escaped}%`
      )
      .order("title", { ascending: true })
      .limit(40);

    if (error) throw error;

    activeSearchResults = data || [];

    container.replaceChildren();

    if (!activeSearchResults.length) {
      showEmpty(
        container,
        "No matching books found in the TBB catalog."
      );
      return;
    }

    for (const book of activeSearchResults) {
      catalogBooks.set(book.id, book);
      container.append(createBookCard(book));
    }

    if (activeSearchResults.length === 40) {
      container.append(
        createElement(
          "p",
          "library-helper",
          "Showing up to 40 results. Refine your search for more specific matches."
        )
      );
    }

  } catch (error) {
    console.error("Catalog search failed:", error);
    showEmpty(
      container,
      "Catalog search couldn't be completed."
    );
    notify(error.message, true);

  } finally {
    searchBusy = false;
    button.disabled = false;
    button.textContent = "Search Catalog 💗";
  }
}

async function addBook(bookId, button) {
  if (!currentUser || addBusy) return;

  const book = catalogBooks.get(bookId);

  if (!book || book.is_archived === true) {
    notify(
      "This book isn't available for new additions.",
      true
    );
    return;
  }

  if (myEntries.some(
    entry => entry.book_id === bookId
  )) {
    notify(
      "This book is already in your Library! 💗"
    );
    return;
  }

  addBusy = true;
  button.disabled = true;
  button.textContent = "Adding...";

  try {
    const { error } = await db
      .from("tbb_bookshelf_entries")
      .insert({
        user_id: currentUser.id,
        book_id: bookId,
        reading_status: "want_to_read",
        current_page: 0
      });

    if (error) throw error;

    await Promise.all([
      loadMyCollection(),
      loadReadingStats()
    ]);

    renderSearchResults();

    notify(
      `"${book.title}" was added to your Library! 💗`
    );

  } catch (error) {
    console.error("Add book failed:", error);

    if (error.code === "23505") {
      notify(
        "That book is already in your Library.",
        true
      );

      await loadMyCollection().catch(console.error);
    } else {
      notify(error.message, true);
    }

  } finally {
    addBusy = false;
    button.disabled = false;
    button.textContent = "Add to Library 💗";
    renderSearchResults();
  }
}

function renderSearchResults() {
  const container = $("catalogResults");

  if (!activeSearchResults.length) return;

  container.replaceChildren();

  for (const book of activeSearchResults) {
    container.append(createBookCard(book));
  }
}

function openBookEditor(bookId) {
  const entry = myEntries.find(
    item => item.book_id === bookId
  );

  if (!entry) {
    notify("That reading record couldn't be found.", true);
    return;
  }

  const book = catalogBooks.get(bookId);

  $("editingEntryId").value = entry.id;

  $("bookEditorTitle").textContent =
    "Edit My Reading Record 💋";

  $("bookEditorSubtitle").textContent =
    book
      ? `${book.title} — ${book.author || "Unknown Author"}`
      : "Update your reading details.";

  $("editReadingStatus").value =
    entry.reading_status;

  $("editBookFormat").value =
    entry.book_format || "";

  $("editTotalPages").value =
    entry.total_pages ?? "";

  $("editCurrentPage").value =
    entry.current_page ?? 0;

  $("editRating").value =
    entry.rating ?? "";

  $("editStartedAt").value =
    entry.started_at || "";

  $("editFinishedAt").value =
    entry.finished_at || "";

  $("bookEditor").showModal();
}

function optionalPositiveInteger(value, field) {
  if (value === "") return null;

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(
      `${field} must be a positive whole number.`
    );
  }

  return number;
}

function nonnegativeInteger(value, field) {
  if (value === "") return 0;

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(
      `${field} must be zero or a positive whole number.`
    );
  }

  return number;
}

function getEditorUpdates() {
  const readingStatus = $("editReadingStatus").value;
  const bookFormat = $("editBookFormat").value || null;

  if (!Object.hasOwn(statusLabels, readingStatus)) {
    throw new Error("Choose a valid reading status.");
  }

  if (
    bookFormat &&
    !["physical", "ebook", "audiobook"].includes(bookFormat)
  ) {
    throw new Error("Choose a valid book format.");
  }

  const totalPages = optionalPositiveInteger(
    $("editTotalPages").value,
    "Total pages"
  );

  const currentPage = nonnegativeInteger(
    $("editCurrentPage").value,
    "Current page"
  );

  if (
    totalPages !== null &&
    currentPage > totalPages
  ) {
    throw new Error(
      "Current page cannot exceed total pages."
    );
  }

  const ratingValue = $("editRating").value;
  const rating = ratingValue === ""
    ? null
    : Number(ratingValue);

  if (
    rating !== null &&
    (
      rating < 0.5 ||
      rating > 5 ||
      !Number.isInteger(rating * 2)
    )
  ) {
    throw new Error(
      "Rating must be between 0.5 and 5 stars."
    );
  }

  const startedAt =
    $("editStartedAt").value || null;

  const finishedAt =
    $("editFinishedAt").value || null;

  if (
    startedAt &&
    finishedAt &&
    finishedAt < startedAt
  ) {
    throw new Error(
      "Finish date cannot be earlier than start date."
    );
  }

  return {
    reading_status: readingStatus,
    book_format: bookFormat,
    total_pages: totalPages,
    current_page: currentPage,
    rating,
    started_at: startedAt,
    finished_at: finishedAt
  };
}

async function saveBookEditor(event) {
  event.preventDefault();

  if (!currentUser || editorBusy) return;

  const entryId = $("editingEntryId").value;
  const entry = myEntries.find(
    item => item.id === entryId
  );

  if (!entry) {
    notify("Reading record not found.", true);
    return;
  }

  editorBusy = true;
  const button = $("saveBookEditor");
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const updates = getEditorUpdates();

    const { data, error } = await db
      .from("tbb_bookshelf_entries")
      .update(updates)
      .eq("id", entryId)
      .eq("user_id", currentUser.id)
      .select("id");

    if (error) throw error;

    if (!data?.length) {
      throw new Error(
        "Your reading record wasn't updated. Check your permissions."
      );
    }

    $("bookEditor").close();

    await Promise.all([
      loadMyCollection(),
      loadReadingStats()
    ]);

    notify("Your reading record was saved! 💗");

  } catch (error) {
    console.error("Save reading record failed:", error);
    notify(error.message, true);

  } finally {
    editorBusy = false;
    button.disabled = false;
    button.textContent = "Save Reading Record 💗";
  }
}

function handleBookAction(event) {
  const button = event.target.closest(
    "button[data-action][data-book-id]"
  );

  if (!button) return;

  const bookId = button.dataset.bookId;

  if (button.dataset.action === "add") {
    addBook(bookId, button);
  }

  if (button.dataset.action === "edit") {
    openBookEditor(bookId);
  }
}

async function init() {
  try {
    const access = await requireAccess();

    if (!access) return;

    currentUser = access.user;

    await loadOwnerProfile();

    await Promise.all([
      loadReadingStats(),
      loadMyCollection()
    ]);

    notify("Your Bookshelf is ready, Baddie! 💗");

  } catch (error) {
    console.error(
      "Bookshelf initialization failed:",
      error
    );

    notify(
      error.message ||
      "Your Bookshelf couldn't be loaded.",
      true
    );
  }
}

/* ==========================================
   EVENT LISTENERS
   ========================================== */

$("logout").addEventListener("click", logout);

$("searchCatalog").addEventListener(
  "click",
  searchCatalog
);

$("bookSearch").addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchCatalog();
    }
  }
);

$("catalogResults").addEventListener(
  "click",
  handleBookAction
);

$("myBookCollection").addEventListener(
  "click",
  handleBookAction
);

$("libraryStatusFilter").addEventListener(
  "change",
  renderMyCollection
);

$("bookEditorForm").addEventListener(
  "submit",
  saveBookEditor
);

$("cancelBookEditor").addEventListener(
  "click",
  () => {
    if (!editorBusy) {
      $("bookEditor").close();
    }
  }
);

$("bookEditor").addEventListener(
  "cancel",
  event => {
    if (editorBusy) {
      event.preventDefault();
    }
  }
);

init();
