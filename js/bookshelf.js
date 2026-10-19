
/* ==========================================
   TBB 2.0 — THE BOOKSHELF™
   PHASE 5 | STEP 4E
   Authentication, Themes & Reading Stats
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

let currentUser = null;

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
  const root = document.documentElement;

  for (const key of [
    "accent",
    "light",
    "bg",
    "surface",
    "alt",
    "border"
  ]) {
    root.style.setProperty(`--${key}`, theme[key]);
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
    throw new Error(
      "Your Library Card could not be found."
    );
  }

  const displayName =
    data.display_name ||
    data.username ||
    "Baddie";

  $("bookshelfOwner").textContent =
    `📚 ${displayName}'s Bookshelf`;

  applyTheme(data.vanity_theme);

  return data;
}

async function countRows(table, filters = []) {
  let query = db
    .from(table)
    .select("id", {
      count: "exact",
      head: true
    })
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
    totalBooks,
    currentlyReading,
    finishedBooks,
    customShelves
  ] = await Promise.all([
    countRows("tbb_bookshelf_entries"),

    countRows(
      "tbb_bookshelf_entries",
      [["reading_status", "currently_reading"]]
    ),

    countRows(
      "tbb_bookshelf_entries",
      [["reading_status", "finished"]]
    ),

    countRows("tbb_custom_shelves")
  ]);

  $("totalBooks").textContent = totalBooks;
  $("currentlyReading").textContent =
    currentlyReading;
  $("finishedBooks").textContent =
    finishedBooks;
  $("customShelfCount").textContent =
    customShelves;
}

async function init() {
  try {
    const access = await requireAccess();

    if (!access) return;

    currentUser = access.user;

    await loadOwnerProfile();
    await loadReadingStats();

    notify(
      "Your Bookshelf is ready, Baddie! 💗"
    );

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

$("logout").addEventListener(
  "click",
  logout
);

init();
