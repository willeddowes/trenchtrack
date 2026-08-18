"use client";

import { useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ToolbarButton({
  onClick,
  active,
  children,
  label,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keeps the editor's text cursor/selection alive --
      // without this, clicking a toolbar button blurs the contenteditable first,
      // so the formatting command below would run with no selection to act on.
      onClick={onClick}
      aria-label={label}
      className={`rounded px-2 py-1 text-sm font-medium ${
        active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200 p-2">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        B
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        I
      </ToolbarButton>
      {[1, 2, 3].map((level) => (
        <ToolbarButton
          key={level}
          label={`Heading ${level}`}
          active={editor.isActive("heading", { level })}
          onClick={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()}
        >
          H{level}
        </ToolbarButton>
      ))}
      <ToolbarButton
        label="Paragraph"
        active={editor.isActive("paragraph")}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        P
      </ToolbarButton>
      <ToolbarButton
        label="Link"
        active={editor.isActive("link")}
        onClick={() => {
          if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          const url = window.prompt("Link URL");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
      >
        Link
      </ToolbarButton>
    </div>
  );
}

export function ArticleForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorText, setErrorText] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const editor = useEditor({
    immediatelyRender: false, // avoids an SSR hydration mismatch in Next.js
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    editorProps: {
      attributes: {
        class: "article-content min-h-[200px] p-3 focus:outline-none",
      },
    },
  });

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(published: boolean) {
    if (!editor) return;
    setStatus("saving");

    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        slug,
        content_html: editor.getHTML(),
        published,
      }),
    });

    if (res.ok) {
      setStatus("saved");
    } else {
      const body = await res.json();
      setErrorText(body.error ?? "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <form className="space-y-4 rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold">New / edit article</h2>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Title</span>
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Slug (used in the URL: /articles/…)
        </span>
        <input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          required
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">Content</span>
        <div className="rounded-md border border-gray-300">
          {editor && <Toolbar editor={editor} />}
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() => handleSubmit(false)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() => handleSubmit(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Publish
        </button>
      </div>

      {status === "saving" && <p className="text-gray-500">Saving...</p>}
      {status === "saved" && <p className="text-green-700">Saved.</p>}
      {status === "error" && <p className="text-red-600">{errorText}</p>}
    </form>
  );
}
