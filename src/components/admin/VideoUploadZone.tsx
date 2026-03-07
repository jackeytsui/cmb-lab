import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface VideoUploadZoneProps {
  /** Called when files are dropped or selected */
  onFilesSelected: (files: File[], category: string, tags: string[]) => void;
  /** Whether uploads are currently in progress */
  disabled?: boolean;
}

const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
];

const ACCEPTED_EXTENSIONS = ".mp4,.mov,.webm,.avi,.mkv";

/**
 * Drag-and-drop zone for uploading multiple video files with metadata.
 * Accepts common video formats and validates before passing to parent.
 */
export function VideoUploadZone({
  onFilesSelected,
  disabled = false,
}: VideoUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [category, setCategory] = useState<string>("lesson");
  const [tags, setTags] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFiles = useCallback((fileList: FileList | File[]): File[] => {
    const files = Array.from(fileList);
    const valid: File[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      if (ACCEPTED_VIDEO_TYPES.includes(file.type)) {
        valid.push(file);
      } else {
        rejected.push(file.name);
      }
    }

    if (rejected.length > 0) {
      console.warn(
        `Rejected files (unsupported format): ${rejected.join(", ")}`
      );
    }

    return valid;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const files = validateFiles(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesSelected(files, category, tags.split(",").map(t => t.trim()).filter(Boolean));
      }
    },
    [disabled, onFilesSelected, validateFiles, category, tags]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    },
    []
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const files = validateFiles(e.target.files);
        if (files.length > 0) {
          onFilesSelected(files, category, tags.split(",").map(t => t.trim()).filter(Boolean));
        }
      }
      // Reset input so same files can be re-selected
      e.target.value = "";
    },
    [onFilesSelected, validateFiles, category, tags]
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="space-y-4">
      {/* Metadata Controls */}
      <div className="flex gap-4">
        <div className="w-40 space-y-1">
          <Label className="text-zinc-400 text-xs">Category</Label>
          <Select value={category} onValueChange={setCategory} disabled={disabled}>
            <SelectTrigger className="h-9 bg-zinc-800 border-zinc-700 text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-200">
              <SelectItem value="lesson">Lesson Content</SelectItem>
              <SelectItem value="prompt">Coach Prompt</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-zinc-400 text-xs">Tags (comma separated)</Label>
          <Input 
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. grammar, pronunciation, intro"
            className="h-9 bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative rounded-lg border-2 border-dashed p-8 text-center transition-colors
          ${
            isDragOver
              ? "border-indigo-500 bg-indigo-500/10"
              : "border-zinc-600 bg-zinc-800/50 hover:border-zinc-500"
          }
          ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
        `}
      >
        {/* Upload icon */}
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-300"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <p className="mb-1 text-sm font-medium text-zinc-200">
          {isDragOver
            ? "Drop video files here"
            : "Drag and drop video files here"}
        </p>
        <p className="mb-4 text-xs text-zinc-400">
          MP4, MOV, WebM, AVI, MKV supported
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleBrowseClick}
          disabled={disabled}
          className="border-zinc-600 bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
        >
          Browse Files
        </Button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    </div>
  );
}
