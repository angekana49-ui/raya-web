"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Moon,
  Sun,
  Monitor,
  Bell,
  BellOff,
  Database,
  Shield,
  Trash2,
  ChevronRight,
  Download,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Theme = "light" | "dark" | "system";

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [theme, setTheme] = useState<Theme>("light");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Mock storage data
  const memoryUsage = {
    used: 12.4, // MB
    total: 50, // MB
    percentage: 24.8,
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    // TODO: Implement actual theme switching
  };

  const handleDeleteAccount = () => {
    // TODO: Implement account deletion via API
    alert("Your deletion request has been sent. You will receive a confirmation email.");
    setShowDeleteConfirm(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">Settings</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {/* Theme */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Sun className="w-4 h-4 text-gray-600" />
                    Theme
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleThemeChange("light")}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                        theme === "light"
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <Sun className={cn("w-5 h-5", theme === "light" ? "text-primary" : "text-gray-500")} />
                      <span className={cn("text-xs font-medium", theme === "light" ? "text-primary" : "text-gray-600")}>
                        Light
                      </span>
                    </button>
                    <button
                      onClick={() => handleThemeChange("dark")}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                        theme === "dark"
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <Moon className={cn("w-5 h-5", theme === "dark" ? "text-primary" : "text-gray-500")} />
                      <span className={cn("text-xs font-medium", theme === "dark" ? "text-primary" : "text-gray-600")}>
                        Dark
                      </span>
                    </button>
                    <button
                      onClick={() => handleThemeChange("system")}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                        theme === "system"
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <Monitor className={cn("w-5 h-5", theme === "system" ? "text-primary" : "text-gray-500")} />
                      <span className={cn("text-xs font-medium", theme === "system" ? "text-primary" : "text-gray-600")}>
                        Auto
                      </span>
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Coming soon</p>
                </div>

                {/* Notifications */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-gray-600" />
                    Notifications
                  </h3>
                  <button
                    onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                    className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {notificationsEnabled ? (
                        <Bell className="w-5 h-5 text-primary" />
                      ) : (
                        <BellOff className="w-5 h-5 text-gray-400" />
                      )}
                      <span className="text-sm text-gray-700">
                        {notificationsEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "w-11 h-6 rounded-full transition-colors relative",
                        notificationsEnabled ? "bg-primary" : "bg-gray-300"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                          notificationsEnabled ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </div>
                  </button>
                  <p className="text-xs text-gray-400 mt-2">Coming soon</p>
                </div>

                {/* Storage */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Database className="w-4 h-4 text-gray-600" />
                    Storage
                  </h3>
                  <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                    {/* Progress bar */}
                    <div>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Usage</span>
                        <span>{memoryUsage.used} MB / {memoryUsage.total} MB</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${memoryUsage.percentage}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Cached data: conversations, preferences, temporary files
                    </p>
                    <div className="flex gap-2">
                      <button
                        disabled
                        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-400 cursor-not-allowed"
                      >
                        <Download className="w-4 h-4" />
                        Export
                      </button>
                      <button
                        disabled
                        className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-400 cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                        Clear
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Coming soon</p>
                </div>

                {/* Privacy */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gray-600" />
                    Data & Privacy
                  </h3>
                  <div className="space-y-2">
                    <button
                      disabled
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl text-gray-400 cursor-not-allowed"
                    >
                      <span className="text-sm">View my data</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      disabled
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl text-gray-400 cursor-not-allowed"
                    >
                      <span className="text-sm">Export my data</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      disabled
                      className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-xl text-gray-400 cursor-not-allowed"
                    >
                      <span className="text-sm">Privacy policy</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Coming soon</p>
                </div>

                {/* Supprimer mon compte */}
                <div>
                  <h3 className="text-sm font-semibold text-red-600 mb-3 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    Danger zone
                  </h3>
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
                    >
                      <span className="text-sm text-red-600 font-medium">Delete my account</span>
                      <ChevronRight className="w-4 h-4 text-red-400" />
                    </button>
                  ) : (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-red-800 font-medium">
                            Are you sure you want to delete your account?
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            This action is irreversible. All your data, conversations and preferences will be permanently deleted.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 py-2 px-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDeleteAccount}
                          className="flex-1 py-2 px-3 bg-red-600 rounded-lg text-sm text-white font-medium hover:bg-red-700 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
