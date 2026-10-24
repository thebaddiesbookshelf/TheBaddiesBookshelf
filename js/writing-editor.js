
/* ==========================================
   TBB 2.0 — THE CREATIVE CANVAS™
   Structured rich-text editor
   ========================================== */

import { Editor } from "https://esm.sh/@tiptap/core@2.27.2";
import StarterKit from "https://esm.sh/@tiptap/starter-kit@2.27.2";
import Underline from "https://esm.sh/@tiptap/extension-underline@2.27.2";
import Placeholder from "https://esm.sh/@tiptap/extension-placeholder@2.27.2";

const EMPTY_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

let editor = null;

function getToolbarButtons() {
  return [
    ...document.querySelectorAll(
      "[data-writing-command]"
    )
  ];
}

function updateToolbar() {
  if (!editor) return;

  const states = {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    heading: editor.isActive("heading", { level: 2 }),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    blockquote: editor.isActive("blockquote")
  };

  for (const button of getToolbarButtons()) {
    const command = button.dataset.writingCommand;

    if (command in states) {
      button.setAttribute(
        "aria-pressed",
        String(states[command])
      );
    }
  }
}

function runCommand(command) {
  if (!editor) return;

  const chain = editor.chain().focus();

  switch (command) {
    case "bold":
      chain.toggleBold().run();
      break;

    case "italic":
      chain.toggleItalic().run();
      break;

    case "underline":
      chain.toggleUnderline().run();
      break;

    case "heading":
      chain.toggleHeading({ level: 2 }).run();
      break;

    case "bulletList":
      chain.toggleBulletList().run();
      break;

    case "orderedList":
      chain.toggleOrderedList().run();
      break;

    case "blockquote":
      chain.toggleBlockquote().run();
      break;

    case "clear":
      chain.unsetAllMarks().clearNodes().run();
      break;
  }

  updateToolbar();
}

export function createWritingEditor(onChange) {
  const mount = document.getElementById(
    "writingContentEditor"
  );

  if (!mount) {
    throw new Error(
      "The Creative Canvas™ editor container is missing."
    );
  }

  if (editor) {
    editor.destroy();
    editor = null;
  }

  editor = new Editor({
    element: mount,

    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2]
        }
      }),

      Underline,

      Placeholder.configure({
        placeholder:
          "Once upon a time... your story begins here. 💗"
      })
    ],

    content: EMPTY_DOCUMENT,

    editorProps: {
      attributes: {
        "aria-label": "Your creative writing",
        spellcheck: "true"
      }
    },

    onUpdate: ({ editor: currentEditor }) => {
      if (typeof onChange === "function") {
        onChange({
          json: currentEditor.getJSON(),
          text: currentEditor.getText()
        });
      }
    },

    onSelectionUpdate: updateToolbar,
    onTransaction: updateToolbar
  });

  for (const button of getToolbarButtons()) {
    if (button.dataset.writingBound === "true") {
      continue;
    }

    button.dataset.writingBound = "true";

    button.addEventListener("click", () => {
      runCommand(button.dataset.writingCommand);
    });
  }

  updateToolbar();

  return editor;
}

export function setWritingContent(documentJSON) {
  if (!editor) return;

  const content =
    documentJSON &&
    documentJSON.type === "doc" &&
    Array.isArray(documentJSON.content)
      ? documentJSON
      : EMPTY_DOCUMENT;

  editor.commands.setContent(content, false);
  updateToolbar();
}

export function getWritingContent() {
  if (!editor) {
    return {
      json: EMPTY_DOCUMENT,
      text: ""
    };
  }

  return {
    json: editor.getJSON(),
    text: editor.getText()
  };
}

export function focusWritingEditor() {
  editor?.commands.focus();
}

export function destroyWritingEditor() {
  if (editor) {
    editor.destroy();
    editor = null;
  }
}
