
/* ==========================================
   TBB 2.0 — QUOTE VAULT™
   STEP 3E — PUBLIC VANITY™ QUOTES
   ========================================== */

import { db } from "./auth.js";

const QUOTE_TABLE = "tbb_quote_entries";
const $ = id => document.getElementById(id);

const activeLoads = new WeakMap();

function element(tag, className = "", value = "") {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  node.textContent = value;
  return node;
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

/* ==========================================
   FETCH PUBLIC QUOTES ONLY
   ========================================== */

async function getPublicQuotes(profileUserId) {
  const quotes = [];

  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db
      .from(QUOTE_TABLE)
      .select(
        "id,user_id,bookshelf_entry_id," +
        "quote_text,page_number,personal_note," +
        "created_at"
      )
      .eq("user_id", profileUserId)
      .eq("visibility", "public")
      .order("created_at", {
        ascending: false
      })
      .order("id", {
        ascending: false
      })
      .range(offset, offset + 99);

    if (error) throw error;

    quotes.push(...(data || []));

    if (!data || data.length < 100) break;
  }

  return quotes;
}

/* ==========================================
   PRIVACY-SAFE BOOK LOOKUP
   ========================================== */

async function getPublicBookDetails(quotes) {
  const books = new Map();

  const results = await Promise.allSettled(
    quotes.map(async quote => {
      const { data, error } = await db.rpc(
        "tbb_public_quote_book",
        {
          p_quote_id: quote.id
        }
      );

      if (error) throw error;

      const book = Array.isArray(data)
        ? data[0]
        : data;

      return {
        quoteId: quote.id,
        book
      };
    })
  );

  for (const result of results) {
    if (result.status !== "fulfilled") {
      console.warn(
        "Public quote book lookup failed:",
        result.reason
      );
      continue;
    }

    const { quoteId, book } = result.value;

    if (book?.book_title) {
      books.set(quoteId, book);
    }
  }

  return books;
}

/* ==========================================
   RENDER PUBLIC QUOTE CARD
   ========================================== */

function renderPublicQuote(quote, bookDetails) {
  const card = element(
    "article",
    "quote-vault-card vanity-quote-card"
  );

  const top = element(
    "div",
    "quote-vault-card-top"
  );

  top.appendChild(
    element(
      "span",
      "quote-vault-card-icon",
      "“"
    )
  );

  top.appendChild(
    element(
      "span",
      "quote-vault-visibility",
      "💗 Shared Quote"
    )
  );

  card.appendChild(top);

  card.appendChild(
    element(
      "blockquote",
      "quote-vault-text",
      quote.quote_text
    )
  );

  const book = bookDetails.get(quote.id);

  if (book) {
    const label = book.book_author
      ? `${book.book_title} — ${book.book_author}`
      : book.book_title;

    card.appendChild(
      element(
        "p",
        "quote-vault-book",
        `📚 ${label}`
      )
    );
  }

  if (quote.page_number) {
    card.appendChild(
      element(
        "p",
        "quote-vault-page",
        `Page ${quote.page_number}`
      )
    );
  }

  if (quote.personal_note) {
    card.appendChild(
      element(
        "p",
        "quote-vault-note",
        `💗 ${quote.personal_note}`
      )
    );
  }

  card.appendChild(
    element(
      "p",
      "quote-vault-date",
      formatDate(quote.created_at)
    )
  );

  return card;
}

/* ==========================================
   LOAD PUBLIC QUOTE VAULT™
   ========================================== */

export async function loadVanityQuotes(profileUserId) {
  const container = $("vanityQuoteEntries");

  if (!container) return;

  const loadToken = Symbol("vanity-quote-load");
  activeLoads.set(container, loadToken);

  if (!profileUserId) {
    container.replaceChildren();
    return;
  }

  container.replaceChildren(
    element(
      "p",
      "library-empty-message",
      "Opening this Baddie's favorite lines... 💌"
    )
  );

  try {
    const quotes = await getPublicQuotes(profileUserId);

    if (activeLoads.get(container) !== loadToken) {
      return;
    }

    if (!quotes.length) {
      container.replaceChildren(
        element(
          "p",
          "library-empty-message",
          "No public quotes shared just yet. 💗"
        )
      );
      return;
    }

    const books = await getPublicBookDetails(quotes);

    if (activeLoads.get(container) !== loadToken) {
      return;
    }

    container.replaceChildren();

    for (const quote of quotes) {
      container.appendChild(
        renderPublicQuote(quote, books)
      );
    }

  } catch (error) {
    if (activeLoads.get(container) !== loadToken) {
      return;
    }

    console.error(
      "Vanity™ Quote Vault:",
      error
    );

    container.replaceChildren(
      element(
        "p",
        "library-empty-message",
        "Couldn't open these quotes right now. 💌"
      )
    );
  }
}

/* ==========================================
   END — PUBLIC QUOTE VAULT™
   ========================================== */
