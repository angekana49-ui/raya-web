"use client";

import { X, FileText, File, Image as ImageIcon, Paperclip } from "lucide-react";
import type { AttachedFile } from "@/types";

interface FileAttachmentProps {
  files: AttachedFile[];
  onAddFile: () => void;
  onRemoveFile: (fileId: string) => void;
  disabled?: boolean;
}

const getFileIcon = (type: AttachedFile["type"]) => {
  switch (type) {
    case "image":
      return <ImageIcon className="w-5 h-5 text-primary" />;
    case "pdf":
      return <FileText className="w-5 h-5 text-red-500" />;
    case "document":
      return <FileText className="w-5 h-5 text-primary" />;
    case "spreadsheet":
      return <File className="w-5 h-5 text-green-500" />;
    default:
      return <File className="w-5 h-5 text-gray-500" />;
  }
};

const getFileBadge = (type: AttachedFile["type"]) => {
  const badges = {
    image: { label: "Image", color: "bg-blue-500" },
    pdf: { label: "PDF", color: "bg-red-500" },
    document: { label: "Doc", color: "bg-purple-500" },
    spreadsheet: { label: "Excel", color: "bg-green-500" },
    other: { label: "File", color: "bg-gray-500" },
  };
  return badges[type];
};

export default function FileAttachment({
  files,
  onAddFile,
  onRemoveFile,
  disabled = false,
}: FileAttachmentProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="py-2">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {files.map((file) => {
          const badge = getFileBadge(file.type);

          return (
            <div
              key={file.id}
              className="relative w-[100px] flex-shrink-0 bg-white border border-gray-200 rounded-lg p-2"
            >
              {/* Preview ou icône */}
              {file.type === "image" ? (
                <img
                  src={file.url}
                  alt={file.name}
                  className="w-full h-20 object-cover rounded bg-gray-100"
                />
              ) : (
                <div className="w-full h-20 rounded bg-gray-100 flex items-center justify-center">
                  {getFileIcon(file.type)}
                </div>
              )}

              {/* Badge type */}
              <div
                className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${badge.color}`}
              >
                {badge.label}
              </div>

              {/* Nom fichier */}
              <p className="text-xs text-gray-900 mt-1 truncate">{file.name}</p>

              {/* Bouton supprimer */}
              <button
                onClick={() => onRemoveFile(file.id)}
                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          );
        })}

        {/* Bouton ajouter plus */}
        <button
          onClick={onAddFile}
          disabled={disabled}
          className="w-[100px] h-[116px] flex-shrink-0 bg-gray-50 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
        >
          <Paperclip className="w-5 h-5 text-primary" />
          <span className="text-xs text-primary font-medium">Add</span>
        </button>
      </div>
    </div>
  );
}
