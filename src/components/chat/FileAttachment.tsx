"use client";

import { X, FileText, File, Image as ImageIcon, Paperclip } from "lucide-react";
import type { AttachedFile } from "@/types";

interface FileAttachmentProps {
  files: AttachedFile[];
  onAddFile: () => void;
  onRemoveFile: (fileId: string) => void;
  disabled?: boolean;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value >= 10 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
}

const getFileIcon = (type: AttachedFile["type"]) => {
  switch (type) {
    case "image":
      return <ImageIcon className="w-5 h-5 text-primary" />;
    case "pdf":
      return <FileText className="w-5 h-5 text-rose-500" />;
    case "document":
      return <FileText className="w-5 h-5 text-indigo-500" />;
    case "spreadsheet":
      return <File className="w-5 h-5 text-emerald-500" />;
    default:
      return <File className="w-5 h-5 text-slate-500" />;
  }
};

const getFileBadge = (type: AttachedFile["type"]) => {
  const badges = {
    image: { label: "Image", color: "bg-blue-500/90" },
    pdf: { label: "PDF", color: "bg-rose-500/90" },
    document: { label: "Doc", color: "bg-indigo-500/90" },
    spreadsheet: { label: "Sheet", color: "bg-emerald-500/90" },
    other: { label: "File", color: "bg-slate-500/90" },
  };
  return badges[type];
};

export default function FileAttachment({
  files,
  onAddFile,
  onRemoveFile,
  disabled = false,
}: FileAttachmentProps) {
  if (files.length === 0) return null;

  return (
    <div className="py-2">
      <div className="flex gap-2.5 overflow-x-auto pb-2">
        {files.map((file) => {
          const badge = getFileBadge(file.type);
          const sizeLabel = formatBytes(file.size);

          return (
            <div
              key={file.id}
              className="group relative w-[132px] flex-shrink-0 rounded-xl border border-slate-200/90 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.08)] p-2.5"
            >
              {file.type === "image" ? (
                <div className="relative overflow-hidden rounded-lg">
                  <img
                    src={file.url}
                    alt={file.name}
                    className="w-full h-24 object-cover bg-slate-100 transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-black/50 to-transparent" />
                </div>
              ) : (
                <div className="w-full h-24 rounded-lg bg-[linear-gradient(160deg,#f8faff_0%,#eef2ff_100%)] border border-slate-200/80 flex flex-col items-center justify-center gap-1">
                  {getFileIcon(file.type)}
                  <span className="text-[10px] text-slate-500 uppercase tracking-wide">
                    {file.name.split(".").pop() || "file"}
                  </span>
                </div>
              )}

              <div
                className={`absolute top-2.5 left-2.5 px-1.5 py-0.5 rounded text-[9px] font-semibold text-white ${badge.color}`}
              >
                {badge.label}
              </div>

              <p className="text-[11px] text-slate-900 mt-2 truncate" title={file.name}>
                {file.name}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {sizeLabel || "Ready"}
              </p>

              <button
                onClick={() => onRemoveFile(file.id)}
                className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-white/95 border border-slate-200 text-slate-600 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                aria-label="Remove file"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        <button
          onClick={onAddFile}
          disabled={disabled}
          className="w-[132px] h-[156px] flex-shrink-0 rounded-xl border border-dashed border-primary/40 bg-[linear-gradient(165deg,rgba(90,108,255,0.08),rgba(105,71,255,0.06))] flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-[linear-gradient(165deg,rgba(90,108,255,0.14),rgba(105,71,255,0.1))] transition-colors disabled:opacity-50"
        >
          <div className="w-9 h-9 rounded-full bg-white/90 border border-primary/20 flex items-center justify-center">
            <Paperclip className="w-4 h-4 text-primary" />
          </div>
          <span className="text-xs text-primary font-medium">Add file</span>
        </button>
      </div>
    </div>
  );
}
