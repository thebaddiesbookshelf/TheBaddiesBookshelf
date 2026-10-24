
/* ==========================================
   TBB 2.0 — THE BADDIE WRITING STUDIO™
   STEP 4F — SHARED WRITING ON VANITY™
   AND BADDIE DIRECTORY™
   ========================================== */

import { db } from "./auth.js";

const WRITING_TABLE = "tbb_writing_pieces";

const activeLoads = new WeakMap();

const CATEGORIES = {
  story: "📖 Original Story",
  poetry: "🌷 Poetry",
  letter: "💌 Letter",
  freewriting: "☁️ Freewriting"
};

/* ==========================================
   SAFE DOM HELPERS
   ========================================== */

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

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

/* ==========================================
   FETCH SHARED WRITING ONLY
   ========================================== */

async function getSharedWriting(profileUserId) {
  const pieces = [];

  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db
      .from(WRITING_TABLE)
      .select(
        "id,user_id,title,category,content_text," +
        "visibility,created_at,updated_at"
      )
      .eq("user_id", profileUserId)
      .eq("visibility", "shared")
      .order("created_at", {
        ascending: false
      })
      .order("id", {
        ascending: false
      })
      .range(offset, offset + 99);

    if (error) throw error;

    pieces.push(...(data || []));

    if (!data || data.length < 100) {
      break;
    }
  }

  return pieces;
}

/* ==========================================
   RENDER SHARED WRITING CARD
   ========================================== */

function renderSharedWriting(piece) {
  const card = element(
    "article",
    "writing-piece-card vanity-writing-card"
  );

  const top = element(
    "div",
    "writing-piece-top"
  );

  top.append(
    element(
      "span",
      "writing-piece-category",
      CATEGORIES[piece.category] || "🖋️ Writing"
    ),

    element(
      "span",
      "writing-piece-visibility",
      "💗 Shared Writing"
    )
  );

  const title = element(
    "h4",
    "writing-piece-title",
    piece.title || "Untitled Piece"
  );

  const content = (piece.content_text || "").trim();

  const preview = element(
    "p",
    "writing-piece-preview",
    content
      ? content.slice(0, 260) +
        (content.length > 260 ? "…" : "")
      : "A masterpiece waiting to be read. 💌"
  );

  const meta = element(
    "p",
    "writing-piece-meta",
    `Shared ${formatDate(piece.created_at)}`
  );

  const actions = element(
    "div",
    "writing-piece-actions"
  );

  const readButton = document.createElement("button");

  readButton.type = "button";
  readButton.textContent = "💌 Read & Love Notes";

  readButton.addEventListener("click", () => {
    document.dispatchEvent(
      new CustomEvent("tbb:open-writing-reader", {
        detail: {
          pieceId: piece.id
        }
      })
    );
  });

  actions.append(readButton);

  card.append(
    top,
    title,
    preview,
    meta,
    actions
  );

  return card;
}

/* ==========================================
   LOAD SHARED WRITING
   ========================================== */

export async function loadVanityWriting(profileUserId) {
  const container = document.getElementById(
    "vanityWritingEntries"
  );

  if (!container) return;

  const loadToken = Symbol("vanity-writing-load");

  activeLoads.set(container, loadToken);

  if (!profileUserId) {
    container.replaceChildren();
    return;
  }

  container.replaceChildren(
    element(
      "p",
      "library-empty-message",
      "Opening this Baddie's masterpieces... 🖋️"
    )
  );

  try {
    const pieces = await getSharedWriting(
      profileUserId
    );

    if (activeLoads.get(container) !== loadToken) {
      return;
    }

    if (!pieces.length) {
      container.replaceChildren(
        element(
          "p",
          "library-empty-message",
          "No writing shared just yet. 💌"
        )
      );

      return;
    }

    container.replaceChildren();

    for (const piece of pieces) {
      container.append(
        renderSharedWriting(piece)
      );
    }

  } catch (error) {
    if (activeLoads.get(container) !== loadToken) {
      return;
    }

    console.error(
      "Vanity™ Writing Studio:",
      error
    );

    container.replaceChildren(
      element(
        "p",
        "library-empty-message",
        "Couldn't open this Baddie's writing right now. 💗"
      )
    );
  }
}

/* ==========================================
   END — VANITY™ WRITING STUDIO™
   ========================================== */
