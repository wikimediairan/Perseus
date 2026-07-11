import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface Props {
  children: React.ReactNode;
}

function getActiveTextField() {
  const el = document.activeElement;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el;
  }

  return null;
}

async function copy() {
  const el = getActiveTextField();
  if (!el) return;

  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;

  await navigator.clipboard.writeText(el.value.slice(start, end));
}

async function cut() {
  const el = getActiveTextField();
  if (!el) return;

  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;

  await navigator.clipboard.writeText(el.value.slice(start, end));

  el.setRangeText("", start, end, "start");
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function paste() {
  const el = getActiveTextField();
  if (!el) return;

  const text = await navigator.clipboard.readText();

  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;

  el.setRangeText(text, start, end, "end");
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function TextContextMenu({ children }: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={cut}>Cut</ContextMenuItem>
        <ContextMenuItem onClick={copy}>Copy</ContextMenuItem>
        <ContextMenuItem onClick={paste}>Paste</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
