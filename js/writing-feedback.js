
/* ==========================================
   TBB 2.0 — LOVE NOTES™
   STEP 4E.4 — REACTIONS & FEEDBACK

   Shared Writing Reader
   Safe Rich-Text Rendering
   Member Reactions
   Love Notes™ Comments
   Author & Admin Moderation
   ========================================== */

import { db, requireAccess } from "./auth.js";

const PIECES_TABLE = "tbb_writing_pieces";
const REACTIONS_TABLE = "tbb_writing_reactions";
const COMMENTS_TABLE = "tbb_writing_comments";

const $ = (id) => document.getElementById(id);

const REACTION_TYPES = [
  "love",
  "felt_this",
  "ate_that",
  "beautiful"
];

const CATEGORIES = {
  story: "📖 Original Story",
  poetry: "🌷 Poetry",
  letter: "💌 Letter",
  freewriting: "☁️ Freewriting"
};

let currentUser = null;
let currentPiece = null;
let currentReaction = null;

let reactions = [];
let comments = [];

let readerSession = 0;
let reactionBusy = false;
let commentBusy = false;
let adminStatus = false;

/* ==========================================
   UTILITIES
   ========================================== */

function setFeedbackStatus(message) {
  const element = $("writingFeedbackStatus");

  if (element) {
    element.textContent = message || "";
  }
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = String(text);
  }

  return element;
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

function isCurrentSession(session, pieceId) {
  return (
    session === readerSession &&
    currentPiece?.id === pieceId
  );
}

function getReaderDialog() {
  return $("writingReaderDialog");
}

function clearReader() {
  currentPiece = null;
  currentReaction = null;
  reactions = [];
  comments = [];

  $("writingReaderContent")?.replaceChildren();
  $("writingCommentsList")?.replaceChildren();

  if ($("writingCommentText")) {
    $("writingCommentText").value = "";
  }

  setFeedbackStatus("");
}

/* ==========================================
   SAFE RICH-TEXT RENDERER

   Converts approved Tiptap JSON nodes into
   DOM elements. Never inserts user HTML.
   ========================================== */

const ALLOWED_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code"
]);

function applyMarks(element, marks) {
  let result = element;

  if (!Array.isArray(marks)) {
    return result;
  }

  for (const mark of marks) {
    if (!mark || !ALLOWED_MARKS.has(mark.type)) {
      continue;
    }

    const tags = {
      bold: "strong",
      italic: "em",
      underline: "u",
      strike: "s",
      code: "code"
    };

    const wrapper = document.createElement(
      tags[mark.type]
    );

    wrapper.append(result);
    result = wrapper;
  }

  return result;
}

function renderRichTextNode(node, depth = 0) {
  if (
    !node ||
    typeof node !== "object" ||
    depth > 35
  ) {
    return document.createDocumentFragment();
  }

  if (node.type === "text") {
    const textNode = document.createTextNode(
      typeof node.text === "string"
        ? node.text
        : ""
    );

    return applyMarks(
      textNode,
      node.marks
    );
  }

  if (node.type === "hardBreak") {
    return document.createElement("br");
  }

  const nodeTags = {
    doc: null,
    paragraph: "p",
    heading: "h2",
    bulletList: "ul",
    orderedList: "ol",
    listItem: "li",
    blockquote: "blockquote",
    horizontalRule: "hr"
  };

  if (!(node.type in nodeTags)) {
    return document.createDocumentFragment();
  }

  const tag = nodeTags[node.type];

  const element = tag
    ? document.createElement(tag)
    : document.createDocumentFragment();

  if (
    Array.isArray(node.content) &&
    node.type !== "horizontalRule"
  ) {
    for (const child of node.content) {
      element.append(
        renderRichTextNode(child, depth + 1)
      );
    }
  }

  return element;
}

export function renderWritingDocument(
  container,
  documentJSON
) {
  if (!container) return;

  container.replaceChildren();

  if (
    !documentJSON ||
    documentJSON.type !== "doc" ||
    !Array.isArray(documentJSON.content)
  ) {
    container.append(
      createElement(
        "p",
        "",
        "This piece has no writing yet. 💌"
      )
    );

    return;
  }

  const fragment = renderRichTextNode(
    documentJSON
  );

  container.append(fragment);

  if (!container.textContent.trim()) {
    container.append(
      createElement(
        "p",
        "",
        "This piece has no writing yet. 💌"
      )
    );
  }
}

/* ==========================================
   FETCH WRITING PIECE
   ========================================== */

async function fetchWritingPiece(pieceId) {
  const { data, error } = await db
    .from(PIECES_TABLE)
    .select(
      "id,user_id,title,category,content_json," +
      "content_text,visibility,created_at,updated_at"
    )
    .eq("id", pieceId)
    .eq("visibility", "shared")
    .single();

  if (error) throw error;

  return data;
}

/* ==========================================
   LOAD REACTIONS
   ========================================== */

async function loadReactions(
  pieceId,
  session = readerSession
) {
  const allReactions = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const { data, error } = await db
      .from(REACTIONS_TABLE)
      .select("id,piece_id,user_id,reaction")
      .eq("piece_id", pieceId)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    allReactions.push(...(data || []));

    if (!data || data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  if (!isCurrentSession(session, pieceId)) {
    return;
  }

  reactions = allReactions;

  currentReaction =
    reactions.find(
      (reaction) =>
        reaction.user_id === currentUser.id
    )?.reaction || null;

  renderReactions();
}

function renderReactions() {
  const counts = {
    love: 0,
    felt_this: 0,
    ate_that: 0,
    beautiful: 0
  };

  for (const reaction of reactions) {
    if (reaction.reaction in counts) {
      counts[reaction.reaction]++;
    }
  }

  for (const button of document.querySelectorAll(
    "[data-writing-reaction]"
  )) {
    const type = button.dataset.writingReaction;

    button.setAttribute(
      "aria-pressed",
      String(currentReaction === type)
    );

    button.disabled = reactionBusy;

    const count = button.querySelector(
      "[data-reaction-count]"
    );

    if (count) {
      count.textContent = String(
        counts[type] || 0
      );
    }
  }
}

/* ==========================================
   TOGGLE MY REACTION

   One reaction per member per piece.
   Clicking the selected reaction removes it.
   ========================================== */

async function toggleReaction(type) {
  if (
    !currentPiece ||
    reactionBusy ||
    !REACTION_TYPES.includes(type)
  ) {
    return;
  }

  reactionBusy = true;
  renderReactions();

  const pieceId = currentPiece.id;
  const session = readerSession;

  try {
    if (currentReaction === type) {
      const { error } = await db
        .from(REACTIONS_TABLE)
        .delete()
        .eq("piece_id", pieceId)
        .eq("user_id", currentUser.id);

      if (error) throw error;

    } else {
      const { error } = await db
        .from(REACTIONS_TABLE)
        .upsert(
          {
            piece_id: pieceId,
            user_id: currentUser.id,
            reaction: type
          },
          {
            onConflict: "piece_id,user_id"
          }
        );

      if (error) throw error;
    }

    if (!isCurrentSession(session, pieceId)) {
      return;
    }

    await loadReactions(pieceId, session);

    setFeedbackStatus(
      "💗 Your reaction has been saved!"
    );

  } catch (error) {
    console.error("Reaction failed:", error);

    if (isCurrentSession(session, pieceId)) {
      setFeedbackStatus(
        "💔 Couldn't save your reaction. " +
        error.message
      );
    }

  } finally {
    reactionBusy = false;

    if (isCurrentSession(session, pieceId)) {
      renderReactions();
    }
  }
}

/* ==========================================
   LOAD COMMENTS
   ========================================== */

async function loadComments(
  pieceId,
  session = readerSession
) {
  const allComments = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const { data, error } = await db
      .from(COMMENTS_TABLE)
      .select(
        "id,piece_id,user_id,body,created_at,updated_at"
      )
      .eq("piece_id", pieceId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    allComments.push(...(data || []));

    if (!data || data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  if (!isCurrentSession(session, pieceId)) {
    return;
  }

  comments = allComments;

  renderComments();
}

/* ==========================================
   RENDER COMMENTS
   ========================================== */

function renderComments() {
  const container = $("writingCommentsList");

  if (!container) return;

  container.replaceChildren();

  if (!comments.length) {
    container.append(
      createElement(
        "p",
        "library-empty-message",
        "💌 No Love Notes yet. Be the first!"
      )
    );

    return;
  }

  for (const comment of comments) {
    const card = createElement(
      "article",
      "writing-comment-card"
    );

    const header = createElement(
      "div",
      "writing-comment-header"
    );

    const isMine =
      comment.user_id === currentUser.id;

    const authorLabel = isMine
      ? "💗 You"
      : comment.user_id === currentPiece.user_id
        ? "🖋️ The Author"
        : "💌 TBB Baddie";

    const author = createElement(
      "span",
      "writing-comment-author",
      authorLabel
    );

    const date = createElement(
      "span",
      "writing-comment-date",
      formatDate(comment.created_at)
    );

    header.append(author, date);

    const body = createElement(
      "p",
      "writing-comment-body",
      comment.body
    );

    card.append(header, body);

    const canDelete =
      isMine ||
      currentPiece.user_id === currentUser.id ||
      adminStatus;

    if (canDelete) {
      const actions = createElement(
        "div",
        "writing-comment-actions"
      );

      const deleteButton =
        document.createElement("button");

      deleteButton.type = "button";
      deleteButton.textContent = "🗑️ Remove";

      deleteButton.addEventListener(
        "click",
        () => void deleteComment(comment.id)
      );

      actions.append(deleteButton);
      card.append(actions);
    }

    container.append(card);
  }
}

/* ==========================================
   POST LOVE NOTE
   ========================================== */

async function submitComment(event) {
  event.preventDefault();

  if (!currentPiece || commentBusy) return;

  const textarea = $("writingCommentText");
  const body = textarea.value.trim();

  if (!body || body.length > 2000) {
    setFeedbackStatus(
      "Love Notes must contain 1–2,000 characters."
    );
    return;
  }

  commentBusy = true;

  const button = $("submitWritingComment");
  button.disabled = true;

  const pieceId = currentPiece.id;
  const session = readerSession;

  try {
    const { error } = await db
      .from(COMMENTS_TABLE)
      .insert({
        piece_id: pieceId,
        user_id: currentUser.id,
        body
      });

    if (error) throw error;

    if (!isCurrentSession(session, pieceId)) {
      return;
    }

    textarea.value = "";

    await loadComments(pieceId, session);

    setFeedbackStatus(
      "💌 Your Love Note has been delivered!"
    );

  } catch (error) {
    console.error("Comment failed:", error);

    if (isCurrentSession(session, pieceId)) {
      setFeedbackStatus(
        "💔 Couldn't send your Love Note. " +
        error.message
      );
    }

  } finally {
    commentBusy = false;
    button.disabled = false;
  }
}

/* ==========================================
   DELETE COMMENT
   ========================================== */

async function deleteComment(commentId) {
  if (!currentPiece || commentBusy) return;

  const confirmed = window.confirm(
    "Remove this Love Note permanently?"
  );

  if (!confirmed) return;

  commentBusy = true;

  const pieceId = currentPiece.id;
  const session = readerSession;

  try {
    const { error } = await db
      .from(COMMENTS_TABLE)
      .delete()
      .eq("id", commentId)
      .eq("piece_id", pieceId);

    if (error) throw error;

    if (!isCurrentSession(session, pieceId)) {
      return;
    }

    await loadComments(pieceId, session);

    setFeedbackStatus(
      "🗑️ Love Note removed."
    );

  } catch (error) {
    console.error("Delete comment failed:", error);

    if (isCurrentSession(session, pieceId)) {
      setFeedbackStatus(
        "💔 Couldn't remove that Love Note. " +
        error.message
      );
    }

  } finally {
    commentBusy = false;
  }
}

/* ==========================================
   OPEN SHARED WRITING
   ========================================== */

export async function openWritingReader(pieceId) {
  if (!currentUser || !pieceId) return;

  const dialog = getReaderDialog();

  if (!dialog) return;

  const session = ++readerSession;

  clearReader();

  $("writingReaderTitle").textContent =
    "Opening your masterpiece…";

  $("writingReaderCategory").textContent = "";

  $("writingReaderAuthor").textContent = "";

  setFeedbackStatus("Loading Love Notes™…");

  if (!dialog.open) {
    dialog.showModal();
  }

  try {
    const piece = await fetchWritingPiece(pieceId);

    if (session !== readerSession) {
      return;
    }

    currentPiece = piece;

    $("writingReaderTitle").textContent =
      piece.title || "Untitled Piece";

    $("writingReaderCategory").textContent =
      CATEGORIES[piece.category] || "🖋️ Writing";

    $("writingReaderAuthor").textContent =
      piece.user_id === currentUser.id
        ? "Written by You 💗"
        : "Written by a TBB Baddie 💌";

    renderWritingDocument(
      $("writingReaderContent"),
      piece.content_json
    );

    await Promise.all([
      loadReactions(piece.id, session),
      loadComments(piece.id, session)
    ]);

    if (isCurrentSession(session, piece.id)) {
      setFeedbackStatus("");
    }

  } catch (error) {
    console.error(
      "Couldn't open shared writing:",
      error
    );

    if (session === readerSession) {
      $("writingReaderTitle").textContent =
        "This piece is unavailable";

      setFeedbackStatus(
        "💔 Couldn't load this shared writing. " +
        error.message
      );
    }
  }
}

/* ==========================================
   CLOSE READER
   ========================================== */

function closeWritingReader() {
  readerSession++;

  const dialog = getReaderDialog();

  if (dialog?.open) {
    dialog.close();
  }

  clearReader();
}

/* ==========================================
   INITIALIZATION
   ========================================== */

async function initializeWritingFeedback() {
  try {
    await requireAccess();

    const { data, error } =
      await db.auth.getUser();

    if (error) throw error;

    if (!data?.user) {
      throw new Error("Please sign in.");
    }

    currentUser = data.user;

    // Existing TBB admin authorization.
    const { data: isAdmin, error: adminError } =
      await db.rpc("tbb_post_is_admin");

    if (adminError) {
      console.warn(
        "Admin status could not be verified:",
        adminError
      );
    }

    adminStatus = isAdmin === true;

    document.addEventListener(
      "tbb:open-writing-reader",
      (event) => {
        const pieceId = event.detail?.pieceId;

        if (pieceId) {
          void openWritingReader(pieceId);
        }
      }
    );

    for (const button of document.querySelectorAll(
      "[data-writing-reaction]"
    )) {
      button.addEventListener("click", () => {
        void toggleReaction(
          button.dataset.writingReaction
        );
      });
    }

    $("writingCommentForm").addEventListener(
      "submit",
      submitComment
    );

    $("closeWritingReader").addEventListener(
      "click",
      closeWritingReader
    );

    $("writingReaderDialog").addEventListener(
      "close",
      () => {
        readerSession++;
        clearReader();
      }
    );

    console.info(
      "💌 Love Notes™ is ready."
    );

  } catch (error) {
    console.error(
      "Love Notes initialization failed:",
      error
    );

    setFeedbackStatus(
      "💔 Love Notes couldn't initialize. " +
      error.message
    );
  }
}

void initializeWritingFeedback();
