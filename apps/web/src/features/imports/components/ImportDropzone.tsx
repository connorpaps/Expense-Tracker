import { useRef, useState } from 'react';
import type { DragEvent } from 'react';

interface ImportDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function ImportDropzone({ onFile, disabled }: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`dropzone${dragging ? ' dropzone--active' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (disabled) return;
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,application/pdf,.pdf"
        className="sr-only"
        id="import-file-input"
        aria-label="Choose a statement file to import"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
      <div className="dropzone__inner">
        <p className="dropzone__title">Import a statement</p>
        <p className="dropzone__hint">CSV or text-based PDF from American Express, Apple Card, Chase, Capital One, or US Bank.</p>
        <button
          type="button"
          className="button button--secondary"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Choose a file
        </button>
        <p className="dropzone__hint dropzone__hint--small">
          or drag and drop it here. Files are parsed on this device and never uploaded.
        </p>
      </div>
    </div>
  );
}
