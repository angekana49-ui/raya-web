"use client";

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Image as ImageIcon, FileText, X } from "lucide-react";
import type { AttachedFile } from "@/types";
import { getFileTypeFromName } from "@/lib/utils";

interface FilePickerMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelectFile: (file: AttachedFile) => void;
}

const FILE_OPTIONS = [
  {
    id: "camera",
    icon: Camera,
    label: "Take a photo",
    color: "#3b82f6",
    accept: "image/*",
    capture: "environment" as const,
  },
  {
    id: "gallery",
    icon: ImageIcon,
    label: "Photo gallery",
    color: "#10b981",
    accept: "image/*",
  },
  {
    id: "document",
    icon: FileText,
    label: "Documents",
    color: "#8b5cf6",
    accept: ".pdf,.doc,.docx,.txt,.xls,.xlsx",
  },
];

export default function FilePickerMenu({
  visible,
  onClose,
  onSelectFile,
}: FilePickerMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentOptionRef = useRef<typeof FILE_OPTIONS[0] | null>(null);

  const handleOptionClick = (option: typeof FILE_OPTIONS[0]) => {
    currentOptionRef.current = option;
    if (fileInputRef.current) {
      fileInputRef.current.accept = option.accept;
      if (option.capture) {
        fileInputRef.current.capture = option.capture;
      } else {
        fileInputRef.current.removeAttribute("capture");
      }
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const attachedFile: AttachedFile = {
        id: Date.now().toString(),
        name: file.name,
        type: getFileTypeFromName(file.name),
        url: URL.createObjectURL(file),
        size: file.size,
      };
      onSelectFile(attachedFile);
      onClose();
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />

          {/* Menu */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed bottom-16 left-3 right-3 md:left-3 md:right-auto md:w-[280px] bg-white rounded-2xl shadow-xl border border-gray-200 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                Add a file
              </h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Options */}
            <div className="p-2">
              {FILE_OPTIONS.map((option) => {
                const IconComponent = option.icon;

                return (
                  <button
                    key={option.id}
                    onClick={() => handleOptionClick(option)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${option.color}15` }}
                    >
                      <IconComponent
                        className="w-5 h-5"
                        style={{ color: option.color }}
                      />
                    </div>
                    <span className="text-base text-gray-900 font-medium">
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
