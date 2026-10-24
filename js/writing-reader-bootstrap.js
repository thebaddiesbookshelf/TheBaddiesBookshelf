
/* ==========================================
   TBB 2.0 — LOVE NOTES™
   REUSABLE READER BOOTSTRAP
   ========================================== */

import {
  ensureWritingReaderUI
} from "./writing-reader-ui.js";

ensureWritingReaderUI();

// Load feedback only after the reader exists.
// Dynamic import preserves this initialization order.
await import("./writing-feedback.js");
