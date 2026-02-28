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
// import ModelPickerMenu from "@/components/menus/ModelPickerMenu"; // PRO - coming soon

interface SidebarProps {
  visible: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
  onNewChat: () => void;
  conversations: Conversation[];
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onSignOut?: () => void;
  onOpenAuth?: () => void;
}

export default function Sidebar({
  visible,
  onClose,
  userName,
  userEmail,
  onNewChat,
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onSignOut,
  onOpenAuth,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.title.toLowerCase().includes(normalizedQuery) ||
      conv.preview.toLowerCase().includes(normalizedQuery)
  );
  const sortedConversations = [...filteredConversations].sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );
  const hasConversations = conversations.length > 0;
  const hasSearch = normalizedQuery.length > 0;
  const conversationGroups = groupConversationsByDate(sortedConversations);

  const handleSelectConversation = (id: string) => {
    onSelectConversation?.(id);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDeleteConversation?.(id);
  };

  return (
    <>
      <aside
        className={cn(
          "h-full shrink-0 bg-white border-r border-gray-200 shadow-sm flex flex-col overflow-hidden transition-[width,opacity] duration-300",
          visible
            ? "w-[82vw] max-w-[320px] md:w-[320px] opacity-100"
            : "w-0 opacity-0 border-r-0 pointer-events-none"
        )}
      >
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <img src="/raya-logo.jpeg" alt="RAYA" className="w-8 h-8 rounded-lg object-cover" />
              <span className="flex-1 text-lg font-bold text-primary">
                <NoTranslate>RAYA AI</NoTranslate>
              </span>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close sidebar"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="px-4 py-3">
              <button
                onClick={onNewChat}
                className="w-full flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Plus className="w-5 h-5 text-gray-700" strokeWidth={2.5} />
                <span className="text-sm font-semibold text-gray-900">New conversation</span>
              </button>
            </div>

            <div className="px-4 pb-4">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
                />
                {hasSearch && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              {hasSearch && (
                <p className="mt-2 px-1 text-xs text-gray-500">
                  {filteredConversations.length} result(s)
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-2">
              {!hasConversations && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">No conversations yet.</div>
              )}

              {hasConversations && hasSearch && filteredConversations.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No results for "{searchQuery}".
                </div>
              )}

              {conversationGroups.map((group) => (
                <div key={group.label} className="mb-4">
                  <p className="text-xs font-bold text-gray-400 uppercase px-2 mb-2">{group.label}</p>

                  {group.items.map((conversation) => {
                    const isActive = activeConversationId === conversation.id;
                    return (
                      <div
                        key={conversation.id}
                        onClick={() => handleSelectConversation(conversation.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-colors group cursor-pointer",
                          isActive ? "bg-primary/10" : "hover:bg-gray-100"
                        )}
                      >
                        <MessageSquare
                          className={cn(
                            "w-4 h-4 flex-shrink-0",
                            isActive ? "text-primary" : "text-gray-400"
                          )}
                        />
                        <span
                          className={cn(
                            "flex-1 text-sm text-left truncate",
                            isActive ? "text-primary font-medium" : "text-gray-700"
                          )}
                        >
                          {conversation.title}
                        </span>
                        <button
                          onClick={(e) => handleDeleteClick(e, conversation.id)}
                          className={cn(
                            "p-1 rounded transition-all",
                            isActive
                              ? "opacity-100 hover:bg-primary/20"
                              : "opacity-0 group-hover:opacity-100 hover:bg-gray-200"
                          )}
                        >
                          <Trash2
                            className={cn(
                              "w-3.5 h-3.5",
                              isActive ? "text-primary" : "text-gray-400 hover:text-red-500"
                            )}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 p-4">
              {/* Upgrade button - PRO (coming soon) */}
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 py-2 bg-gray-100 rounded-xl mb-3 cursor-not-allowed opacity-60"
              >
                <img src="/raya-logo.jpeg" alt="" className="w-4 h-4 rounded-full object-cover grayscale" />
                <span className="text-sm font-bold text-gray-400">
                  Upgrade to <NoTranslate>RAYA Pro</NoTranslate>
                </span>
                <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 text-[9px] font-bold rounded">
                  SOON
                </span>
              </button>

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

                <LanguageMenu isOpen={languageMenuOpen} onClose={() => setLanguageMenuOpen(false)} />

                <AnimatePresence>
                  {profileMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
                    >
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

                      <div className="py-1">
                        {/* Change model - PRO (coming soon) */}
                        <div className="flex items-center justify-between px-4 py-2.5 cursor-not-allowed opacity-50">
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

                      <div className="border-t border-gray-100 py-1">
                        {userEmail ? (
                          <div
                            onClick={() => { setProfileMenuOpen(false); onSignOut?.(); }}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 cursor-pointer"
                          >
                            <LogOut className="w-4 h-4 text-red-500" />
                            <span className="text-sm text-red-600">Log out</span>
                          </div>
                        ) : (
                          <div
                            onClick={() => { setProfileMenuOpen(false); onOpenAuth?.(); }}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 cursor-pointer"
                          >
                            <LogOut className="w-4 h-4 text-blue-500 rotate-180" />
                            <span className="text-sm text-blue-600">Sign up / Log in</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
      </aside>

      <PromoCodeModal isOpen={promoModalOpen} onClose={() => setPromoModalOpen(false)} />

      {/* Model Picker Menu - PRO (coming soon)
      <ModelPickerMenu
        visible={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        currentModel={currentModel}
        onSelectModel={setCurrentModel}
      />
      */}

      <SettingsModal isOpen={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} />
      <HelpModal isOpen={helpModalOpen} onClose={() => setHelpModalOpen(false)} />
    </>
  );
}
