"use client";

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Image as ImageIcon, FileText, X } from "lucide-react";
import type { AttachedFile } from "@/types";
import { getFileTypeFromName } from "@/lib/utils";

interface FilePickerMenuProps {
  visible: boolean;
  onClose: () => void;
  onSelectFile: (file: AttachedFile) => void;
  anchorEl?: HTMLElement | null;
}

const FILE_OPTIONS = [
  {
    id: "camera",
    icon: Camera,
    label: "Take a photo",
    color: "#3b82f6",
    accept: "image/*",
    capture: "environment" as const,
    multiple: false,
  },
  {
    id: "gallery",
    icon: ImageIcon,
    label: "Photo gallery",
    color: "#10b981",
    accept: "image/*",
    multiple: true,
  },
  {
    id: "document",
    icon: FileText,
    label: "Documents",
    color: "#8b5cf6",
    accept: ".pdf,.doc,.docx,.txt,.xls,.xlsx",
    multiple: true,
  },
];

export default function FilePickerMenu({
  visible,
  onClose,
  onSelectFile,
  anchorEl,
}: FilePickerMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentOptionRef = useRef<typeof FILE_OPTIONS[0] | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, ready: false });

  useEffect(() => {
    if (!visible || !anchorEl) return;

    const updatePosition = () => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      const menuWidth = menuRect?.width || 232;
      const menuHeight = menuRect?.height || 206;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 8;
      const margin = 8;

      // Prefer opening directly above the trigger button.
      let left = anchorRect.left;
      left = Math.max(margin, Math.min(left, vw - menuWidth - margin));

      let top = anchorRect.top - menuHeight - gap;
      if (top < margin) top = Math.min(anchorRect.bottom + gap, vh - menuHeight - margin);

      setPosition((prev) => {
        const changed =
          Math.abs(prev.top - top) > 0.5 ||
          Math.abs(prev.left - left) > 0.5 ||
          !prev.ready;
        return changed ? { top, left, ready: true } : prev;
      });
    };

    let rafId = 0;
    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updatePosition();
      });
    };

    updatePosition();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [visible, anchorEl]);

  const handleOptionClick = (option: typeof FILE_OPTIONS[0]) => {
    currentOptionRef.current = option;
    if (fileInputRef.current) {
      fileInputRef.current.accept = option.accept;
      fileInputRef.current.multiple = option.multiple;
      if (option.capture) {
        fileInputRef.current.capture = option.capture;
      } else {
        fileInputRef.current.removeAttribute("capture");
      }
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const dataUrl = evt.target?.result as string;
          // dataUrl is "data:<mimeType>;base64,<data>" — strip the prefix
          const base64 = dataUrl.split(",")[1];
          const attachedFile: AttachedFile = {
            id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 7)}`,
            name: file.name,
            type: getFileTypeFromName(file.name),
            url: URL.createObjectURL(file),
            base64,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          };
          onSelectFile(attachedFile);
        };
        reader.readAsDataURL(file);
      });
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
            className="fixed inset-0 z-40 bg-transparent"
            onClick={onClose}
          />

          {/* Menu */}
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed w-[228px] md:w-[232px] bg-white rounded-2xl shadow-xl border border-gray-200 z-50 overflow-hidden"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.ready ? "visible" : "hidden",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
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
            <div className="p-1.5">
              {FILE_OPTIONS.map((option) => {
                const IconComponent = option.icon;

                return (
                  <button
                    key={option.id}
                    onClick={() => handleOptionClick(option)}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${option.color}15` }}
                    >
                      <IconComponent
                        className="w-3.5 h-3.5"
                        style={{ color: option.color }}
                      />
                    </div>
                    <span className="text-xs text-gray-900 font-medium">
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
