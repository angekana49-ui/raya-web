"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  MessageSquare,
  Trash2,
  Search,
  Settings,
  HelpCircle,
  LogOut,
  Globe,
  Gift,
  Crown,
  ChevronRight,
} from "lucide-react";
import type { Conversation } from "@/types";
import { groupConversationsByDate, cn } from "@/lib/utils";
import PromoCodeModal from "@/components/modals/PromoCodeModal";
import SettingsModal from "@/components/modals/SettingsModal";
import HelpModal from "@/components/modals/HelpModal";
import LanguageMenu from "@/components/menus/LanguageMenu";
import { NoTranslate } from "@/components/ui/NoTranslate";
// import ModelPickerMenu from "@/components/menus/ModelPickerMenu"; // PRO - bientôt disponible

interface SidebarProps {
  visible: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
  onNewChat: () => void;
  conversations: Conversation[];
  onSelectConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
}

export default function Sidebar({
  visible,
  onClose,
  userName,
  userEmail,
  onNewChat,
  conversations,
  onSelectConversation,
  onDeleteConversation,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.preview.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const conversationGroups = groupConversationsByDate(filteredConversations);

  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  const handleSelectConversation = (id: string) => {
    onSelectConversation?.(id);
    onClose();
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDeleteConversation?.(id);
  };

  return (
    <>
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 w-[82%] max-w-[320px] bg-white shadow-xl z-50 flex flex-col"
          >
            {/* Branding */}
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <img
                src="/raya-logo.jpeg"
                alt="RAYA"
                className="w-8 h-8 rounded-lg object-cover"
              />
              <span className="flex-1 text-lg font-bold text-primary">
                <NoTranslate>RAYA AI</NoTranslate>
              </span>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* New chat button */}
            <div className="px-4 py-3">
              <button
                onClick={handleNewChat}
                className="w-full flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-5 h-5 text-gray-700" strokeWidth={2.5} />
                <span className="text-sm font-semibold text-gray-900">
                  New conversation
                </span>
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pb-4">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
                />
              </div>
            </div>

            {/* Conversations list */}
            <div className="flex-1 overflow-y-auto px-2">
              {conversationGroups.map((group) => (
                <div key={group.label} className="mb-4">
                  <p className="text-xs font-bold text-gray-400 uppercase px-2 mb-2">
                    {group.label}
                  </p>

                  {group.items.map((conversation) => (
                    <div
                      key={conversation.id}
                      onClick={() => handleSelectConversation(conversation.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors group cursor-pointer",
                        conversation.isActive
                          ? "bg-primary/10"
                          : "hover:bg-gray-100"
                      )}
                    >
                      <MessageSquare
                        className={cn(
                          "w-4 h-4 flex-shrink-0",
                          conversation.isActive
                            ? "text-primary"
                            : "text-gray-400"
                        )}
                      />
                      <span
                        className={cn(
                          "flex-1 text-sm text-left truncate",
                          conversation.isActive
                            ? "text-primary font-medium"
                            : "text-gray-700"
                        )}
                      >
                        {conversation.title}
                      </span>
                      <button
                        onClick={(e) => handleDeleteClick(e, conversation.id)}
                        className={cn(
                          "p-1 rounded transition-all",
                          conversation.isActive
                            ? "opacity-100 hover:bg-primary/20"
                            : "opacity-0 group-hover:opacity-100 hover:bg-gray-200"
                        )}
                      >
                        <Trash2 className={cn(
                          "w-3.5 h-3.5",
                          conversation.isActive ? "text-primary" : "text-gray-400 hover:text-red-500"
                        )} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 p-4">
              {/* Upgrade button - PRO (bientôt disponible) */}
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 py-2 bg-gray-100 rounded-xl mb-3 cursor-not-allowed opacity-60"
              >
                <img src="/raya-logo.jpeg" alt="" className="w-4 h-4 rounded-full object-cover grayscale" />
                <span className="text-sm font-bold text-gray-400">
                  Upgrade to  <NoTranslate>RAYA Pro</NoTranslate>
                </span>
                <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 text-[9px] font-bold rounded">
                  SOON
                </span>
              </button>

              {/* Profile */}
              <div className="relative">
                <div
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="w-full flex items-center gap-3 hover:bg-gray-50 rounded-xl p-2 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-base font-bold text-white">
                      {userName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-gray-900">{userName}</p>
                    <p className="text-xs text-gray-500">{userEmail}</p>
                  </div>
                </div>

                {/* Language Menu */}
                <LanguageMenu
                  isOpen={languageMenuOpen}
                  onClose={() => setLanguageMenuOpen(false)}
                />

                {/* Profile dropdown - Menu complet */}
                <AnimatePresence>
                  {profileMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
                    >
                      {/* Profile header */}
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                        <div className="w-11 h-11 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-lg font-bold text-white">
                            {userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-900">{userName}</p>
                          <p className="text-xs text-gray-500">{userEmail}</p>
                        </div>
                      </div>

                      {/* Menu items */}
                      <div className="py-1">
                        {/* Changer de modèle - PRO (bientôt disponible) */}
                        <div
                          className="flex items-center justify-between px-4 py-2.5 cursor-not-allowed opacity-50"
                        >
                          <div className="flex items-center gap-3">
                            <Crown className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-400">Change model</span>
                            <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 text-[10px] font-bold rounded">
                              SOON
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </div>

                        <div
                          onClick={() => {
                            setPromoModalOpen(true);
                            setProfileMenuOpen(false);
                          }}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                        >
                          <Gift className="w-4 h-4 text-primary" />
                          <span className="text-sm text-gray-700">Get a promo code</span>
                        </div>

                        <div
                          onClick={() => {
                            setLanguageMenuOpen(true);
                            setProfileMenuOpen(false);
                          }}
                          className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <Globe className="w-4 h-4 text-gray-600" />
                            <span className="text-sm text-gray-700">Language</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>

                        <div
                          onClick={() => {
                            setHelpModalOpen(true);
                            setProfileMenuOpen(false);
                          }}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                        >
                          <HelpCircle className="w-4 h-4 text-gray-600" />
                          <span className="text-sm text-gray-700">Help</span>
                        </div>

                        <div
                          onClick={() => {
                            setSettingsModalOpen(true);
                            setProfileMenuOpen(false);
                          }}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                        >
                          <Settings className="w-4 h-4 text-gray-600" />
                          <span className="text-sm text-gray-700">Settings</span>
                        </div>
                      </div>

                      {/* Logout */}
                      <div className="border-t border-gray-100 py-1">
                        <div
                          onClick={() => alert("Logging out")}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 cursor-pointer"
                        >
                          <LogOut className="w-4 h-4 text-red-500" />
                          <span className="text-sm text-red-600">Log out</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

      {/* Promo Code Modal */}
      <PromoCodeModal
        isOpen={promoModalOpen}
        onClose={() => setPromoModalOpen(false)}
      />

      {/* Model Picker Menu - PRO (bientôt disponible)
      <ModelPickerMenu
        visible={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        currentModel={currentModel}
        onSelectModel={setCurrentModel}
      />
      */}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={helpModalOpen}
        onClose={() => setHelpModalOpen(false)}
      />
    </>
  );
}
