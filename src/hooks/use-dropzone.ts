import { useCallback, useRef, useState, type DragEvent } from "react";

interface Options { onDrop: (files: File[]) => void; }

export function useDropzone({ onDrop }: Options) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setActive] = useState(false);

  const onDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setActive(true); }, []);
  const onDragLeave = useCallback(() => setActive(false), []);
  const onDropEv = useCallback(async (e: DragEvent) => {
    e.preventDefault(); setActive(false);
    const files: File[] = [];
    const items = e.dataTransfer?.items;
    const hasEntries = items && items.length > 0 && typeof (items[0] as any).webkitGetAsEntry === "function";
    if (hasEntries) {
      const promises: Promise<void>[] = [];
      for (let i = 0; i < items!.length; i++) {
        const entry = (items![i] as any).webkitGetAsEntry?.();
        if (entry) promises.push(walkEntry(entry, files));
      }
      await Promise.all(promises);
    } else if (e.dataTransfer?.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) files.push(e.dataTransfer.files[i]);
    }
    if (files.length) onDrop(files);
  }, [onDrop]);

  const getRootProps = () => ({ onDragOver, onDragLeave, onDrop: onDropEv, onClick: () => inputRef.current?.click() });
  const getInputProps = () => ({
    ref: inputRef,
    type: "file" as const,
    multiple: true,
    hidden: true,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const fs = Array.from(e.target.files ?? []);
      if (fs.length) onDrop(fs);
      e.target.value = "";
    },
  });
  const openPicker = () => inputRef.current?.click();

  return { getRootProps, getInputProps, isDragActive, openPicker };
}

async function walkEntry(entry: any, out: File[], path = ""): Promise<void> {
  if (entry.isFile) {
    await new Promise<void>((r) => entry.file((f: File) => {
      try { Object.defineProperty(f, "name", { value: path + f.name }); } catch {}
      out.push(f); r();
    }));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries: any[] = await new Promise((r) => reader.readEntries(r));
    for (const e of entries) await walkEntry(e, out, path + entry.name + "/");
  }
}
