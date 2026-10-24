
/* ==========================================
   TBB 2.0 — READING DIARY™
   VANITY™ PUBLIC DIARY TIMELINE
   PUBLIC BOOK TITLES + MEDIA GALLERY
   ========================================== */

import { db } from "./auth.js";

import {
  getPublicDiaryMedia
} from "./diary-media.js";

const DIARY_TABLE = "tbb_diary_entries";

const $ = id => document.getElementById(id);

const activeLoads = new WeakMap();

const typeLabels = {
  dear_diary: "💗 Dear Diary™",
  between_the_pages: "📖 Between the Pages™"
};

/* ==========================================
   ELEMENT HELPERS
   ========================================== */

function element(
  tag,
  className = "",
  value = ""
) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  node.textContent = value;

  return node;
}

/* ==========================================
   SAFE CONTENT RENDERING
   ========================================== */

const allowedTags = new Set([
  "P", "DIV", "BR",
  "B", "STRONG",
  "I", "EM", "U", "S",
  "UL", "OL", "LI",
  "SPAN", "FONT"
]);

const allowedFonts = new Set([
  "Georgia",
  "Arial",
  "Trebuchet MS",
  "Times New Roman",
  "Courier New"
]);

const blockedTags = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "SVG",
  "MATH",
  "TEMPLATE",
  "FORM",
  "INPUT",
  "BUTTON"
]);

function safeColor(value) {
  const color = String(value || "").trim();

  if (/^#[0-9a-f]{3,8}$/i.test(color)) {
    return color;
  }

  if (
    /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i
      .test(color)
  ) {
    return color;
  }

  return "";
}

function sanitizeContent(html) {
  const source = new DOMParser().parseFromString(
    `<div>${html || ""}</div>`,
    "text/html"
  );

  const output = document.createElement("div");
  const wrapper = source.body.firstElementChild;

  if (!wrapper) return output;

  function copy(node, parent) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(
        document.createTextNode(
          node.textContent || ""
        )
      );

      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tag = node.tagName;

    if (blockedTags.has(tag)) {
      return;
    }

    if (!allowedTags.has(tag)) {
      for (
        const child of Array.from(node.childNodes)
      ) {
        copy(child, parent);
      }

      return;
    }

    const clean = document.createElement(
      tag === "FONT"
        ? "span"
        : tag.toLowerCase()
    );

    if (tag === "SPAN" || tag === "FONT") {
      const rawColor =
        tag === "FONT"
          ? node.getAttribute("color")
          : node.style.color;

      const color = safeColor(rawColor);

      if (color) {
        clean.style.color = color;
      }

      const rawFont =
        tag === "FONT"
          ? node.getAttribute("face") || ""
          : node.style.fontFamily || "";

      const font = rawFont
        .replaceAll('"', "")
        .replaceAll("'", "")
        .trim();

      if (allowedFonts.has(font)) {
        clean.style.fontFamily = font;
      }
    }

    for (
      const child of Array.from(node.childNodes)
    ) {
      copy(child, clean);
    }

    parent.appendChild(clean);
  }

  for (
    const child of Array.from(wrapper.childNodes)
  ) {
    copy(child, output);
  }

  return output;
}

/* ==========================================
   FETCH PUBLIC ENTRIES
   ========================================== */

async function getPublicEntries(profileUserId) {
  const entries = [];

  for (
    let offset = 0;
    ;
    offset += 100
  ) {
    const { data, error } = await db
      .from(DIARY_TABLE)
      .select(
        "id,user_id,bookshelf_entry_id," +
        "diary_type,title,content_html," +
        "mood,created_at"
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

    entries.push(...(data || []));

    if (!data || data.length < 100) {
      break;
    }
  }

  return entries;
}

/* ==========================================
   PUBLIC BOOK TITLE LOOKUP
   ========================================== */

async function getBookTitles(entries) {
  const titles = new Map();

  const bookEntries = entries.filter(
    entry =>
      entry.diary_type === "between_the_pages" &&
      entry.bookshelf_entry_id
  );

  if (!bookEntries.length) {
    return titles;
  }

  const results = await Promise.allSettled(
    bookEntries.map(async entry => {
      const { data, error } = await db.rpc(
        "tbb_public_diary_book",
        {
          p_diary_entry_id: entry.id
        }
      );

      if (error) throw error;

      const book = Array.isArray(data)
        ? data[0]
        : data;

      if (!book?.book_title) {
        return null;
      }

      return {
        bookshelfEntryId:
          book.bookshelf_entry_id,
        title: book.book_title,
        author: book.book_author || ""
      };
    })
  );

  for (const result of results) {
    if (
      result.status !== "fulfilled" ||
      !result.value
    ) {
      continue;
    }

    const book = result.value;

    titles.set(
      book.bookshelfEntryId,
      book
    );
  }

  const failed = results.filter(
    result => result.status === "rejected"
  );

  if (failed.length) {
    console.warn(
      "Some public diary book titles could not load.",
      failed[0].reason
    );
  }

  return titles;
}

/* ==========================================
   RENDER PUBLIC ENTRY
   ========================================== */

function renderEntry(entry, bookTitles) {
  const card = element(
    "article",
    "vanity-diary-entry"
  );

  const header = element(
    "div",
    "vanity-diary-entry-header"
  );

  header.appendChild(
    element(
      "span",
      "vanity-diary-type",
      typeLabels[entry.diary_type] ||
        "Diary Entry"
    )
  );

  if (entry.mood) {
    header.appendChild(
      element(
        "span",
        "vanity-diary-mood",
        entry.mood
      )
    );
  }

  card.appendChild(header);

  card.appendChild(
    element(
      "h4",
      "vanity-diary-entry-title",
      entry.title
    )
  );

  const date = new Date(entry.created_at);

  if (!Number.isNaN(date.getTime())) {
    card.appendChild(
      element(
        "p",
        "vanity-diary-entry-date",
        date.toLocaleDateString(
          undefined,
          {
            month: "long",
            day: "numeric",
            year: "numeric"
          }
        )
      )
    );
  }

  if (entry.bookshelf_entry_id) {
    const book = bookTitles.get(
      entry.bookshelf_entry_id
    );

    const bookLabel = book
      ? `${book.title}${
          book.author
            ? " — " + book.author
            : ""
        }`
      : "Between the Pages™";

    card.appendChild(
      element(
        "p",
        "vanity-diary-book",
        `📚 ${bookLabel}`
      )
    );
  }

  const content = element(
    "div",
    "vanity-diary-entry-content"
  );

  content.appendChild(
    sanitizeContent(entry.content_html)
  );

  card.appendChild(content);

  return card;
}

/* ==========================================
   PUBLIC MEDIA GALLERY
   ========================================== */

async function appendPublicDiaryMedia(
  card,
  entry,
  profileUserId,
  container,
  loadToken
) {
  const gallery = element(
    "div",
    "vanity-diary-gallery"
  );

  card.appendChild(gallery);

  try {
    const images = await getPublicDiaryMedia(
      profileUserId,
      entry.id
    );

    // Ignore outdated profile requests.
    if (
      activeLoads.get(container) !== loadToken ||
      !card.isConnected
    ) {
      return;
    }

    if (!images.length) {
      gallery.remove();
      return;
    }

    for (const imageData of images) {
      const image = document.createElement("img");

      image.src = imageData.url;
      image.alt = imageData.alt;
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";

      gallery.appendChild(image);
    }

  } catch (error) {
    console.warn(
      "Public diary attachments unavailable:",
      error
    );

    gallery.remove();
  }
}

/* ==========================================
   LOAD VANITY™ DIARY TIMELINE
   ========================================== */

export async function loadVanityDiary(
  profileUserId
) {
  const container = $("vanityDiaryEntries");

  if (!container) return;

  const loadToken = Symbol("vanity-diary-load");

  activeLoads.set(
    container,
    loadToken
  );

  if (!profileUserId) {
    container.replaceChildren();
    return;
  }

  container.replaceChildren(
    element(
      "p",
      "vanity-diary-loading",
      "Opening this Baddie's diary... 💌"
    )
  );

  try {
    const entries = await getPublicEntries(
      profileUserId
    );

    if (
      activeLoads.get(container) !== loadToken
    ) {
      return;
    }

    if (!entries.length) {
      container.replaceChildren(
        element(
          "p",
          "vanity-diary-empty",
          "No public diary entries just yet. 💗"
        )
      );

      return;
    }

    const bookTitles = await getBookTitles(
      entries
    );

    if (
      activeLoads.get(container) !== loadToken
    ) {
      return;
    }

    container.replaceChildren();

    for (const entry of entries) {
      const card = renderEntry(
        entry,
        bookTitles
      );

      container.appendChild(card);

      void appendPublicDiaryMedia(
        card,
        entry,
        profileUserId,
        container,
        loadToken
      );
    }

  } catch (error) {
    if (
      activeLoads.get(container) !== loadToken
    ) {
      return;
    }

    console.error(
      "Vanity™ diary:",
      error
    );

    container.replaceChildren(
      element(
        "p",
        "vanity-diary-empty",
        "Couldn't open this diary right now. 💌"
      )
    );
  }
}

/* ==========================================
   END — VANITY™ PUBLIC DIARY TIMELINE
   ========================================== */
