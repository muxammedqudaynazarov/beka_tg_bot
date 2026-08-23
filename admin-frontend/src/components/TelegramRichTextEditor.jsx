import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Bold, Italic, Underline, Strikethrough, Code, EyeOff, Link as LinkIcon } from 'lucide-react';

// ============================================================================
// Telegram HTML rejimi FAQAT shu teglarni tushunadi: <b> <i> <u> <s> <code>
// <pre> <a href> <tg-spoiler>. Boshqa hamma narsa (div, p, span, style va
// h.k, brauzer contentEditable avtomatik qo'shib qo'yadigan narsalar)
// bu yerda olib tashlanadi, faqat MATNI saqlanadi — natijada Telegram
// har doim to'g'ri, xatosiz qabul qiladigan HTML chiqadi.
// ============================================================================

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sanitizeNode(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += escapeHtml(child.textContent);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase();
      const inner = sanitizeNode(child);
      if (tag === 'b' || tag === 'strong') out += `<b>${inner}</b>`;
      else if (tag === 'i' || tag === 'em') out += `<i>${inner}</i>`;
      else if (tag === 'u') out += `<u>${inner}</u>`;
      else if (tag === 's' || tag === 'strike' || tag === 'del') out += `<s>${inner}</s>`;
      else if (tag === 'code') out += `<code>${inner}</code>`;
      else if (tag === 'a') {
        const href = (child.getAttribute('href') || '').replace(/"/g, '&quot;');
        out += `<a href="${href}">${inner}</a>`;
      } else if (tag === 'span' && child.dataset.spoiler === 'true') {
        out += `<tg-spoiler>${inner}</tg-spoiler>`;
      } else if (tag === 'br') {
        out += '\n';
      } else if (tag === 'div' || tag === 'p') {
        // contentEditable har bir qatorni <div>/<p>ga o'raydi — buni oddiy
        // qator ko'chirishga aylantiramiz
        out += (out && !out.endsWith('\n') ? '\n' : '') + inner + '\n';
      } else {
        out += inner; // noma'lum teg — faqat ichidagi matn/formatlash saqlanadi
      }
    }
  }
  return out;
}

export function extractTelegramHtml(container) {
  return sanitizeNode(container).replace(/\n{3,}/g, '\n\n').trim();
}

function wrapSelection(tagName, attrs = {}) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return; // hech narsa tanlanmagan bo'lsa hech narsa qilmaymiz

  const el = document.createElement(tagName);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  try {
    range.surroundContents(el);
  } catch {
    const content = range.extractContents();
    el.appendChild(content);
    range.insertNode(el);
  }
  selection.removeAllRanges();
}

function ToolbarButton({ onClick, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // fokusni contentEditable'dan olib qo'ymaslik uchun
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-md text-ink hover:bg-surface"
    >
      {children}
    </button>
  );
}

const TelegramRichTextEditor = forwardRef(function TelegramRichTextEditor({ placeholder }, ref) {
  const editorRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getHtml: () => extractTelegramHtml(editorRef.current),
    isEmpty: () => !editorRef.current.textContent.trim(),
    clear: () => {
      editorRef.current.innerHTML = '';
    },
  }));

  function exec(command) {
    editorRef.current.focus();
    document.execCommand(command, false, null);
  }

  function addLink() {
    const url = window.prompt('Ссылка (например https://t.me/...)');
    if (!url) return;
    editorRef.current.focus();
    wrapSelection('a', { href: url });
  }

  function addSpoiler() {
    editorRef.current.focus();
    wrapSelection('span', {
      'data-spoiler': 'true',
      style: 'background:#3a3a3a;color:#3a3a3a;border-radius:3px;',
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface focus-within:border-accent">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-bg/40 px-1.5 py-1">
        <ToolbarButton title="Жирный" onClick={() => exec('bold')}><Bold size={14} /></ToolbarButton>
        <ToolbarButton title="Курсив" onClick={() => exec('italic')}><Italic size={14} /></ToolbarButton>
        <ToolbarButton title="Подчёркнутый" onClick={() => exec('underline')}><Underline size={14} /></ToolbarButton>
        <ToolbarButton title="Зачёркнутый" onClick={() => exec('strikeThrough')}><Strikethrough size={14} /></ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton title="Код" onClick={() => wrapSelection('code')}><Code size={14} /></ToolbarButton>
        <ToolbarButton title="Спойлер" onClick={addSpoiler}><EyeOff size={14} /></ToolbarButton>
        <ToolbarButton title="Ссылка" onClick={addLink}><LinkIcon size={14} /></ToolbarButton>
      </div>
      <div
        ref={editorRef}
        contentEditable
        data-placeholder={placeholder}
        className="editor-placeholder min-h-[110px] px-3 py-2 text-sm text-ink focus:outline-none [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-bg [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]"
        suppressContentEditableWarning
      />
    </div>
  );
});

export default TelegramRichTextEditor;
