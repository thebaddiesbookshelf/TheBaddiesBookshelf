
/* ==========================================
   TBB 2.0 — QUOTE VAULT™
   STEP 3D — COMPLETE QUOTE MANAGER

   Features:
   - Save quotes from My Library™
   - Edit and delete quotes
   - Public / private visibility
   - Search and filter
   - Book title and author lookup
   - Quote statistics
   - Supabase RLS-compatible CRUD
   ========================================== */

import { db, requireAccess } from "./auth.js";

const QUOTE_TABLE = "tbb_quote_entries";
const BOOKSHELF_TABLE = "tbb_bookshelf_entries";
const CATALOG_TABLE = "tbb_books";
const COMMUNITY_TABLE = "tbb_community_books";

const $ = id => document.getElementById(id);

let currentUser = null;
let quotes = [];
let libraryBooks = [];
let bookMap = new Map();
let isSaving = false;
let isDeleting = false;
let initialized = false;

/* ==========================================
   UI HELPERS
   ========================================== */

function makeElement(tag, className = "", text = "") {
  const node = document.createElement(tag);

  if (className) node.className = className;

  node.textContent = text;
  return node;
}

function setStatus(message, isError = false) {
  const status = $("quoteEditorStatus");
  if (!status) return;

  status.textContent = message;
  status.style.color = isError
    ? "#a32b50"
    : "#793e60";
}

function setBusy(busy) {
  isSaving = busy;

  const save = $("saveQuoteButton");
  const remove = $("deleteQuoteButton");

  if (save) save.disabled = busy;
  if (remove) remove.disabled = busy;
}

function showEmpty(message) {
  const container = $("quoteVaultEntries");
  if (!container) return;

  container.replaceChildren(
    makeElement(
      "p",
      "library-empty-message",
      message
    )
  );
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/* ==========================================
   LOAD MY LIBRARY™ BOOKS
   ========================================== */

async function loadLibraryBooks() {
  if (!currentUser) return;

  const { data: shelfRows, error: shelfError } =
    await db
      .from(BOOKSHELF_TABLE)
      .select("id,book_id,community_book_id")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

  if (shelfError) throw shelfError;

  const catalogIds = [
    ...new Set(
      (shelfRows || [])
        .map(row => row.book_id)
        .filter(Boolean)
    )
  ];

  const communityIds = [
    ...new Set(
      (shelfRows || [])
        .map(row => row.community_book_id)
        .filter(Boolean)
    )
  ];

  const catalogMap = new Map();
  const communityMap = new Map();

  for (let i = 0; i < catalogIds.length; i += 100) {
    const { data, error } = await db
      .from(CATALOG_TABLE)
      .select("id,title,author")
      .in("id", catalogIds.slice(i, i + 100));

    if (error) throw error;

    for (const book of data || []) {
      catalogMap.set(book.id, book);
    }
  }

  for (let i = 0; i < communityIds.length; i += 100) {
    const { data, error } = await db
      .from(COMMUNITY_TABLE)
      .select("id,title,author")
      .in("id", communityIds.slice(i, i + 100));

    if (error) throw error;

    for (const book of data || []) {
      communityMap.set(book.id, book);
    }
  }

  libraryBooks = (shelfRows || []).map(row => {
    const book = row.community_book_id
      ? communityMap.get(row.community_book_id)
      : catalogMap.get(row.book_id);

    return {
      id: row.id,
      title: book?.title || "Untitled Book",
      author: book?.author || ""
    };
  });

  libraryBooks.sort((a, b) =>
    a.title.localeCompare(b.title)
  );

  bookMap = new Map(
    libraryBooks.map(book => [book.id, book])
  );

  populateBookSelectors();
}

/* ==========================================
   BOOK SELECTORS
   ========================================== */

function populateBookSelectors() {
  const editor = $("quoteBookSelect");
  const filter = $("quoteBookFilter");

  if (editor) {
    const selected = editor.value;

    editor.replaceChildren(
      new Option(
        "Choose from My Library™...",
        ""
      )
    );

    for (const book of libraryBooks) {
      const label = book.author
        ? `${book.title} — ${book.author}`
        : book.title;

      editor.add(new Option(label, book.id));
    }

    editor.value = selected || "";
  }

  if (filter) {
    const selected = filter.value;

    filter.replaceChildren(
      new Option("All Books", "all")
    );

    for (const book of libraryBooks) {
      filter.add(
        new Option(book.title, book.id)
      );
    }

    filter.value = selected || "all";
  }
}

/* ==========================================
   FETCH SAVED QUOTES
   ========================================== */

async function loadQuotes() {
  if (!currentUser) return;

  const results = [];

  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db
      .from(QUOTE_TABLE)
      .select(
        "id,user_id,bookshelf_entry_id," +
        "quote_text,page_number,personal_note," +
        "visibility,created_at,updated_at"
      )
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 99);

    if (error) throw error;

    results.push(...(data || []));

    if (!data || data.length < 100) break;
  }

  quotes = results;

  updateStatistics();
  renderQuotes();
}

/* ==========================================
   STATISTICS
   ========================================== */

function updateStatistics() {
  const total = quotes.length;
  const publicCount = quotes.filter(
    quote => quote.visibility === "public"
  ).length;

  const privateCount = total - publicCount;

  if ($("quoteTotalCount")) {
    $("quoteTotalCount").textContent = total;
  }

  if ($("quotePublicCount")) {
    $("quotePublicCount").textContent = publicCount;
  }

  if ($("quotePrivateCount")) {
    $("quotePrivateCount").textContent = privateCount;
  }
}

/* ==========================================
   RENDER QUOTES
   ========================================== */

function renderQuotes() {
  const container = $("quoteVaultEntries");
  if (!container) return;

  const search = (
    $("quoteSearch")?.value || ""
  ).trim().toLowerCase();

  const bookFilter =
    $("quoteBookFilter")?.value || "all";

  const visibilityFilter =
    $("quoteVisibilityFilter")?.value || "all";

  const filtered = quotes.filter(quote => {
    const book = bookMap.get(
      quote.bookshelf_entry_id
    );

    const searchable = [
      quote.quote_text,
      quote.personal_note,
      book?.title,
      book?.author
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch =
      !search || searchable.includes(search);

    const matchesBook =
      bookFilter === "all" ||
      quote.bookshelf_entry_id === bookFilter;

    const matchesVisibility =
      visibilityFilter === "all" ||
      quote.visibility === visibilityFilter;

    return (
      matchesSearch &&
      matchesBook &&
      matchesVisibility
    );
  });

  container.replaceChildren();

  if (!filtered.length) {
    showEmpty(
      quotes.length
        ? "No quotes match those filters, Baddie. 💗"
        : "Your Quote Vault™ is waiting for its first unforgettable line. 💌"
    );

    return;
  }

  for (const quote of filtered) {
    const book = bookMap.get(
      quote.bookshelf_entry_id
    );

    const card = makeElement(
      "article",
      "quote-vault-card"
    );

    const top = makeElement(
      "div",
      "quote-vault-card-top"
    );

    top.appendChild(
      makeElement(
        "span",
        "quote-vault-card-icon",
        "“"
      )
    );

    top.appendChild(
      makeElement(
        "span",
        "quote-vault-visibility",
        quote.visibility === "public"
          ? "🌎 Public"
          : "🔒 Private"
      )
    );

    card.appendChild(top);

    card.appendChild(
      makeElement(
        "blockquote",
        "quote-vault-text",
        quote.quote_text
      )
    );

    const bookLabel = book
      ? book.author
        ? `${book.title} — ${book.author}`
        : book.title
      : "Book from My Library™";

    card.appendChild(
      makeElement(
        "p",
        "quote-vault-book",
        `📚 ${bookLabel}`
      )
    );

    if (quote.page_number) {
      card.appendChild(
        makeElement(
          "p",
          "quote-vault-page",
          `Page ${quote.page_number}`
        )
      );
    }

    if (quote.personal_note) {
      card.appendChild(
        makeElement(
          "p",
          "quote-vault-note",
          `💗 ${quote.personal_note}`
        )
      );
    }

    card.appendChild(
      makeElement(
        "p",
        "quote-vault-date",
        formatDate(quote.created_at)
      )
    );

    const actions = makeElement(
      "div",
      "quote-vault-card-actions"
    );

    const edit = makeElement(
      "button",
      "",
      "✏️ Edit Quote"
    );

    edit.type = "button";
    edit.addEventListener(
      "click",
      () => openQuoteEditor(quote.id)
    );

    actions.appendChild(edit);
    card.appendChild(actions);

    container.appendChild(card);
  }
}

/* ==========================================
   EDITOR
   ========================================== */

function openQuoteEditor(quoteId = null) {
  const dialog = $("quoteEditorDialog");
  const form = $("quoteEditorForm");

  if (!dialog || !form) return;

  form.reset();
  setStatus("");

  const quote = quoteId
    ? quotes.find(item => item.id === quoteId)
    : null;

  $("quoteEditingId").value = quote?.id || "";

  $("quoteEditorHeading").textContent = quote
    ? "💌 Edit My Favorite Line"
    : "💌 Save This Moment™";

  $("deleteQuoteButton").hidden = !quote;

  if (quote) {
    $("quoteBookSelect").value =
      quote.bookshelf_entry_id;

    $("quoteText").value =
      quote.quote_text || "";

    $("quotePageNumber").value =
      quote.page_number ?? "";

    $("quotePersonalNote").value =
      quote.personal_note || "";

    $("quoteVisibility").value =
      quote.visibility || "private";
  } else {
    $("quoteVisibility").value = "private";
  }

  if (!libraryBooks.length) {
    setStatus(
      "Add a book to My Library™ before saving a quote.",
      true
    );
  }

  if (!dialog.open) {
    dialog.showModal();
  }
}

function closeQuoteEditor() {
  const dialog = $("quoteEditorDialog");

  if (dialog?.open) {
    dialog.close();
  }

  setStatus("");
}

/* ==========================================
   SAVE QUOTE
   ========================================== */

async function saveQuote(event) {
  event.preventDefault();

  if (isSaving || isDeleting || !currentUser) {
    return;
  }

  const id = $("quoteEditingId").value.trim();
  const bookshelfEntryId =
    $("quoteBookSelect").value;

  const quoteText =
    $("quoteText").value.trim();

  const personalNote =
    $("quotePersonalNote").value.trim();

  const pageValue =
    $("quotePageNumber").value.trim();

  const visibility =
    $("quoteVisibility").value;

  if (!bookshelfEntryId) {
    setStatus(
      "Choose a book from My Library™.",
      true
    );
    return;
  }

  if (!bookMap.has(bookshelfEntryId)) {
    setStatus(
      "That book is no longer in My Library™.",
      true
    );
    return;
  }

  if (!quoteText || quoteText.length > 3000) {
    setStatus(
      "Enter a quote between 1 and 3,000 characters.",
      true
    );
    return;
  }

  if (personalNote.length > 5000) {
    setStatus(
      "Your personal note must be 5,000 characters or fewer.",
      true
    );
    return;
  }

  let pageNumber = null;

  if (pageValue) {
    pageNumber = Number(pageValue);

    if (
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1
    ) {
      setStatus(
        "Enter a valid positive page number.",
        true
      );
      return;
    }
  }

  if (!["private", "public"].includes(visibility)) {
    setStatus("Choose a valid privacy setting.", true);
    return;
  }

  const payload = {
    bookshelf_entry_id: bookshelfEntryId,
    quote_text: quoteText,
    page_number: pageNumber,
    personal_note: personalNote,
    visibility
  };

  setBusy(true);
  setStatus("Saving your favorite words... 💌");

  try {
    let error;

    if (id) {
      ({ error } = await db
        .from(QUOTE_TABLE)
        .update(payload)
        .eq("id", id)
        .eq("user_id", currentUser.id));
    } else {
      ({ error } = await db
        .from(QUOTE_TABLE)
        .insert({
          ...payload,
          user_id: currentUser.id
        }));
    }

    if (error) throw error;

    closeQuoteEditor();

    try {
      await loadQuotes();
    } catch (refreshError) {
      console.error(
        "Quote saved, but refresh failed:",
        refreshError
      );

      showEmpty(
        "Quote saved! Refresh the page to see your updated Vault. 💗"
      );
    }

  } catch (error) {
    console.error("Quote save failed:", error);

    setStatus(
      error.message ||
        "Couldn't save your quote. Please try again.",
      true
    );

  } finally {
    setBusy(false);
  }
}

/* ==========================================
   DELETE QUOTE
   ========================================== */

async function deleteQuote() {
  if (isSaving || isDeleting || !currentUser) {
    return;
  }

  const id = $("quoteEditingId").value.trim();
  if (!id) return;

  const confirmed = window.confirm(
    "Delete this quote from your Vault? This cannot be undone."
  );

  if (!confirmed) return;

  isDeleting = true;
  setBusy(true);
  setStatus("Removing this quote... 💌");

  try {
    const { error } = await db
      .from(QUOTE_TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    closeQuoteEditor();

    try {
      await loadQuotes();
    } catch (refreshError) {
      console.error(
        "Quote deleted, but refresh failed:",
        refreshError
      );

      showEmpty(
        "Quote deleted. Refresh to update your Vault. 💗"
      );
    }

  } catch (error) {
    console.error("Quote deletion failed:", error);

    setStatus(
      error.message ||
        "Couldn't delete this quote.",
      true
    );

  } finally {
    isDeleting = false;
    setBusy(false);
  }
}

/* ==========================================
   EVENT LISTENERS
   ========================================== */

function attachEvents() {
  $("createQuoteButton")?.addEventListener(
    "click",
    () => openQuoteEditor()
  );

  $("cancelQuoteEditor")?.addEventListener(
    "click",
    closeQuoteEditor
  );

  $("quoteEditorForm")?.addEventListener(
    "submit",
    saveQuote
  );

  $("deleteQuoteButton")?.addEventListener(
    "click",
    deleteQuote
  );

  $("quoteSearch")?.addEventListener(
    "input",
    renderQuotes
  );

  $("quoteBookFilter")?.addEventListener(
    "change",
    renderQuotes
  );

  $("quoteVisibilityFilter")?.addEventListener(
    "change",
    renderQuotes
  );
}

/* ==========================================
   INITIALIZE QUOTE VAULT™
   ========================================== */

async function initializeQuoteVault() {
  if (initialized) return;
  initialized = true;

  if (!$("quoteVaultEntries")) return;

  attachEvents();

  showEmpty("Opening your Quote Vault™... 💌");

  try {
    const access = await requireAccess();

    if (!access) {
      throw new Error("Please sign in to use Quote Vault™.");
    }

    currentUser = access.user || access;

    if (!currentUser?.id) {
      throw new Error(
        "Could not identify your account."
      );
    }

    await loadLibraryBooks();
    await loadQuotes();

  } catch (error) {
    console.error(
      "Quote Vault™ initialization failed:",
      error
    );

    showEmpty(
      "Couldn't open your Quote Vault™ right now. 💌"
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeQuoteVault,
    { once: true }
  );
} else {
  initializeQuoteVault();
}

/* ==========================================
   END — QUOTE VAULT™
   ========================================== */
