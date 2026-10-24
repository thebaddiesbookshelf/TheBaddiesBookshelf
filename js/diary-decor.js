
/* ==========================================
   TBB 2.0 — READING DIARY™
   STEP 2F — WRITING DESK GLOW-UP
   STICKERS • INK • DIVIDERS • PROMPTS
   ========================================== */

const $ = id => document.getElementById(id);

const STICKERS = [
  { label: "Pink Heart", value: "💗" },
  { label: "Love Letter", value: "💌" },
  { label: "Ribbon", value: "🎀" },
  { label: "Sparkles", value: "✨" },
  { label: "Butterfly", value: "🦋" },
  { label: "Cherry", value: "🍒" },
  { label: "Strawberry", value: "🍓" },
  { label: "Rose", value: "🌹" },
  { label: "Flower", value: "🌸" },
  { label: "Book", value: "📖" },
  { label: "Coffee", value: "☕" },
  { label: "Moon", value: "🌙" },
  { label: "Star", value: "⭐" },
  { label: "Tears", value: "😭" },
  { label: "Heart Eyes", value: "😍" },
  { label: "Blushing", value: "🥹" },
  { label: "Kiss", value: "💋" },
  { label: "Drama", value: "🤭" },
  { label: "Broken Heart", value: "💔" },
  { label: "Crown", value: "👑" },
  { label: "Magic", value: "🪄" },
  { label: "Cloud", value: "☁️" },
  { label: "Candles", value: "🕯️" },
  { label: "Pen", value: "🖋️" }
];

const DIVIDERS = [
  "────── 💗 ──────",
  "✦ ─── ✦ ─── ✦",
  "୨୧ ───────── ୨୧",
  "♡ ♡ ♡ ♡ ♡",
  "✧･ﾟ: *✧･ﾟ:*",
  "────── 📖 ──────",
  "⋆｡°✩ ⋆｡°✩",
  "🌸 ─── 🎀 ─── 🌸"
];

const PROMPTS = [
  "Dear Diary, today I can't stop thinking about...",
  "Something that made me smile today was...",
  "If today were a chapter in my life, I'd call it...",
  "One thing I wish I could tell my past self is...",
  "The fictional character living rent-free in my head is...",
  "A bookish moment I never want to forget is...",
  "Here's what nobody warned me about...",
  "If I could rewrite one moment from today...",
  "Today felt like a scene from a book because...",
  "The biggest plot twist in my life lately has been...",
  "Something I'm proud of myself for is...",
  "Dear future me, I hope you remember..."
];

const INK_COLORS = [
  { label: "Baddie Pink", color: "#e76caa" },
  { label: "Cherry Red", color: "#cf435f" },
  { label: "Lavender", color: "#ad83e8" },
  { label: "Chocolate", color: "#9a6a48" },
  { label: "Forest", color: "#56866c" },
  { label: "Ocean", color: "#4d8fc7" },
  { label: "Golden", color: "#bc8d32" },
  { label: "Midnight", color: "#292338" }
];

let savedRange = null;
let initialized = false;

/* ==========================================
   EDITOR SELECTION
   ========================================== */

function editor() {
  return $("diaryContentEditor");
}

function selectionInsideEditor() {
  const target = editor();
  const selection = window.getSelection();

  if (!target || !selection || !selection.rangeCount) {
    return false;
  }

  const range = selection.getRangeAt(0);

  return target.contains(range.commonAncestorContainer);
}

function rememberSelection() {
  if (!selectionInsideEditor()) return;

  savedRange = window.getSelection()
    .getRangeAt(0)
    .cloneRange();
}

function restoreSelection() {
  const target = editor();
  const selection = window.getSelection();

  target.focus();

  if (
    savedRange &&
    target.contains(savedRange.commonAncestorContainer)
  ) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);

  selection.removeAllRanges();
  selection.addRange(range);
}

function signalEditorChanged() {
  const target = editor();

  target.dispatchEvent(
    new Event("input", { bubbles: true })
  );

  rememberSelection();
}

/* ==========================================
   SAFE TEXT INSERTION
   ========================================== */

function insertText(value) {
  const target = editor();

  if (!target) return;

  restoreSelection();

  const selection = window.getSelection();

  if (!selection || !selection.rangeCount) return;

  const range = selection.getRangeAt(0);

  range.deleteContents();

  const textNode = document.createTextNode(value);
  range.insertNode(textNode);

  range.setStartAfter(textNode);
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);

  signalEditorChanged();
}

/* ==========================================
   INK COLORS
   ========================================== */

function applyInk(color) {
  const target = editor();

  if (!target) return;

  restoreSelection();

  // Uses the same browser formatting functionality
  // as the existing Writing Desk toolbar.
  document.execCommand(
    "foreColor",
    false,
    color
  );

  if ($("diaryInkColor")) {
    $("diaryInkColor").value = color;
  }

  signalEditorChanged();
}

/* ==========================================
   COMPONENT HELPERS
   ========================================== */

function makeButton(label, title, callback) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);

  button.addEventListener("click", callback);

  return button;
}

function makeHeading(text) {
  const heading = document.createElement("h4");
  heading.className = "diary-decor-heading";
  heading.textContent = text;
  return heading;
}

function makePanel(title) {
  const panel = document.createElement("div");
  panel.className = "diary-decor-panel";
  panel.appendChild(makeHeading(title));
  return panel;
}

/* ==========================================
   STICKER COLLECTION
   ========================================== */

function buildStickerPanel() {
  const panel = makePanel("🎀 My Sticker Collection");

  const grid = document.createElement("div");
  grid.className = "diary-sticker-grid";

  for (const sticker of STICKERS) {
    const button = makeButton(
      sticker.value,
      sticker.label,
      () => insertText(sticker.value)
    );

    button.className = "diary-sticker-btn";
    grid.appendChild(button);
  }

  panel.appendChild(grid);

  return panel;
}

/* ==========================================
   DECORATIVE DIVIDERS
   ========================================== */

function buildDividerPanel() {
  const panel = makePanel("✨ Pretty Little Dividers");

  const grid = document.createElement("div");
  grid.className = "diary-divider-grid";

  for (const divider of DIVIDERS) {
    const button = makeButton(
      divider,
      `Insert divider ${divider}`,
      () => insertText(`\n${divider}\n`)
    );

    button.className = "diary-divider-btn";
    grid.appendChild(button);
  }

  panel.appendChild(grid);

  return panel;
}

/* ==========================================
   INK PALETTE
   ========================================== */

function buildInkPanel() {
  const panel = makePanel("🖋️ Pick Your Ink");

  const grid = document.createElement("div");
  grid.className = "diary-ink-grid";

  for (const ink of INK_COLORS) {
    const button = makeButton(
      "●",
      ink.label,
      () => applyInk(ink.color)
    );

    button.className = "diary-ink-btn";
    button.style.setProperty(
      "--diary-swatch",
      ink.color
    );

    const name = document.createElement("span");
    name.textContent = ink.label;

    button.appendChild(name);
    grid.appendChild(button);
  }

  panel.appendChild(grid);

  return panel;
}

/* ==========================================
   WRITING PROMPTS
   ========================================== */

function buildPromptPanel() {
  const panel = makePanel("💌 Need a Little Inspiration?");

  const description = document.createElement("p");
  description.className = "diary-decor-description";
  description.textContent =
    "A little nudge for those days when the words need help finding their way.";

  const button = makeButton(
    "✨ Give Me a Writing Prompt",
    "Insert a random writing prompt",
    () => {
      const prompt = PROMPTS[
        Math.floor(Math.random() * PROMPTS.length)
      ];

      insertText(`\n${prompt}\n`);
    }
  );

  button.className = "diary-prompt-btn";

  panel.append(description, button);

  return panel;
}

/* ==========================================
   BUILD THE DECOR STUDIO
   ========================================== */

function buildDecorStudio() {
  const target = editor();

  if (!target) return;

  const field = target.closest(
    ".diary-editor-field"
  );

  if (!field || $("diaryDecorStudio")) return;

  const studio = document.createElement("section");
  studio.id = "diaryDecorStudio";
  studio.className = "diary-decor-studio";
  studio.setAttribute(
    "aria-label",
    "Writing Desk decorations"
  );

  const heading = document.createElement("div");
  heading.className = "diary-decor-header";

  const title = document.createElement("h4");
  title.textContent = "🎀 The Decoration Drawer™";

  const subtitle = document.createElement("p");
  subtitle.textContent =
    "Because even your diary deserves a little extra.";

  heading.append(title, subtitle);

  const toggle = makeButton(
    "Open My Decoration Drawer ✨",
    "Toggle diary decorations",
    () => {
      const expanded =
        toggle.getAttribute("aria-expanded") === "true";

      toggle.setAttribute(
        "aria-expanded",
        String(!expanded)
      );

      drawer.hidden = expanded;

      toggle.textContent = expanded
        ? "Open My Decoration Drawer ✨"
        : "Close My Decoration Drawer 💗";
    }
  );

  toggle.className = "diary-decor-toggle";
  toggle.setAttribute("aria-expanded", "false");

  const drawer = document.createElement("div");
  drawer.className = "diary-decor-drawer";
  drawer.id = "diaryDecorDrawer";
  drawer.hidden = true;

  toggle.setAttribute(
    "aria-controls",
    drawer.id
  );

  drawer.append(
    buildStickerPanel(),
    buildDividerPanel(),
    buildInkPanel(),
    buildPromptPanel()
  );

  studio.append(heading, toggle, drawer);

  // Place decorations directly beneath
  // the rich-text editor.
  target.insertAdjacentElement(
    "afterend",
    studio
  );
}

/* ==========================================
   INITIALIZE
   ========================================== */

function initDiaryDecor() {
  if (initialized || !editor()) return;

  initialized = true;

  buildDecorStudio();

  const target = editor();

  target.addEventListener(
    "mouseup",
    rememberSelection
  );

  target.addEventListener(
    "keyup",
    rememberSelection
  );

  target.addEventListener(
    "focus",
    rememberSelection
  );

  // Preserve the cursor when using decoration controls.
  document
    .querySelectorAll(
      ".diary-sticker-btn, .diary-divider-btn, .diary-ink-btn, .diary-prompt-btn"
    )
    .forEach(button => {
      button.addEventListener(
        "mousedown",
        event => event.preventDefault()
      );
    });

  const dialog = $("diaryEditorDialog");

  if (dialog) {
    dialog.addEventListener("close", () => {
      savedRange = null;

      const drawer = $("diaryDecorDrawer");
      const toggle = document.querySelector(
        ".diary-decor-toggle"
      );

      if (drawer) drawer.hidden = true;

      if (toggle) {
        toggle.setAttribute(
          "aria-expanded",
          "false"
        );

        toggle.textContent =
          "Open My Decoration Drawer ✨";
      }
    });
  }

  console.log(
    "Reading Diary™ Decoration Drawer ready! 🎀"
  );
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initDiaryDecor,
    { once: true }
  );
} else {
  initDiaryDecor();
}

/* ==========================================
   END — WRITING DESK GLOW-UP
   ========================================== */
