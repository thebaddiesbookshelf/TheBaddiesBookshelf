
/* ==========================================
   TBB 2.0 — LOVE NOTES™
   STEP 4F.4 — REUSABLE READER INTERFACE

   Shared by:
   - The Bookshelf™
   - The Vanity™
   - The Baddie Directory™
   ========================================== */

const READER_ID = "writingReaderDialog";

export function ensureWritingReaderUI() {
  // Bookshelf™ already has its own reader.
  // Never create a duplicate dialog.
  const existing = document.getElementById(READER_ID);

  if (existing) {
    return existing;
  }

  const dialog = document.createElement("dialog");

  dialog.id = READER_ID;
  dialog.className =
    "library-dialog writing-reader-dialog";

  dialog.setAttribute(
    "aria-labelledby",
    "writingReaderTitle"
  );

  dialog.innerHTML = `
    <div class="writing-reader-shell">

      <header class="writing-reader-header">
        <span
          id="writingReaderCategory"
          class="writing-reader-category"
        ></span>

        <h3 id="writingReaderTitle">
          Opening your masterpiece...
        </h3>

        <p
          id="writingReaderAuthor"
          class="writing-reader-author"
        ></p>
      </header>

      <article
        id="writingReaderContent"
        class="writing-reader-content"
        aria-label="Writing content"
      ></article>

      <section
        class="writing-love-notes"
        aria-label="Love Notes reactions and comments"
      >
        <div class="writing-love-notes-heading">
          <h4>💌 The Love Notes™</h4>
          <p>
            A little love for the words that made you feel.
          </p>
        </div>

        <div
          id="writingReactionButtons"
          class="writing-reaction-buttons"
          aria-label="React to this writing"
        >
          <button
            type="button"
            data-writing-reaction="love"
            aria-pressed="false"
          >
            💗 Loved It
            <span data-reaction-count="love">0</span>
          </button>

          <button
            type="button"
            data-writing-reaction="felt_this"
            aria-pressed="false"
          >
            🥹 Felt This
            <span data-reaction-count="felt_this">0</span>
          </button>

          <button
            type="button"
            data-writing-reaction="ate_that"
            aria-pressed="false"
          >
            🔥 Ate That
            <span data-reaction-count="ate_that">0</span>
          </button>

          <button
            type="button"
            data-writing-reaction="beautiful"
            aria-pressed="false"
          >
            ✨ Beautiful
            <span data-reaction-count="beautiful">0</span>
          </button>
        </div>

        <section
          class="writing-comments-section"
          aria-label="Love Notes comments"
        >
          <h5>💗 Notes from the Baddies</h5>

          <div
            id="writingCommentsList"
            class="writing-comments-list"
            aria-live="polite"
          ></div>

          <form
            id="writingCommentForm"
            class="writing-comment-form"
          >
            <label for="writingCommentText">
              Leave a little Love Note 💌
            </label>

            <textarea
              id="writingCommentText"
              maxlength="2000"
              required
              placeholder="Tell this Baddie how her words made you feel..."
            ></textarea>

            <button
              id="submitWritingComment"
              type="submit"
              class="btn primary"
            >
              Send My Love Note 💌
            </button>
          </form>
        </section>
      </section>

      <p
        id="writingFeedbackStatus"
        role="status"
        aria-live="polite"
      ></p>

      <div class="writing-reader-actions">
        <button
          id="closeWritingReader"
          type="button"
          class="btn"
        >
          Close 💗
        </button>
      </div>

    </div>
  `;

  document.body.append(dialog);

  return dialog;
}

/* ==========================================
   END REUSABLE LOVE NOTES™ READER
   ========================================== */
