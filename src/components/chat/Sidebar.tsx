"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
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
  Mail,
  Gift,
  Crown,
  ChevronRight,
  Lightbulb,
  History,
  ShieldCheck,
  Users,
  Archive,
} from "lucide-react";
import type { Conversation, StudyRoomPreview } from "@/types";
import { groupConversationsByDate, cn } from "@/lib/utils";
import { getStudyRoomStatusMeta } from "@/lib/study-room-data";
import PromoCodeModal from "@/components/modals/PromoCodeModal";
import SettingsModal from "@/components/modals/SettingsModal";
import HelpModal from "@/components/modals/HelpModal";
import { RayaCardModal } from "@/components/modals/RayaCardModal";
import LanguageMenu from "@/components/menus/LanguageMenu";
import { NoTranslate } from "@/components/ui/NoTranslate";
import { APP_SETTINGS_EVENT, readAppSettings } from "@/lib/app-settings";
import type { UserEntitlements } from "@/lib/user-entitlements";
// import ModelPickerMenu from "@/components/menus/ModelPickerMenu"; // PRO - coming soon

interface SidebarProps {
  visible: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
  userIsVerified?: boolean;
  entitlements: UserEntitlements;
  openLevelUpCodeRequest?: number;
  onNewChat: () => void;
  conversations: Conversation[];
  rooms?: StudyRoomPreview[];
  activeRoomId?: string | null;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onSelectRoom?: (id: string) => void;
  onRemoveRoom?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onSignOut?: () => void;
  onOpenAuth?: () => void;
  onUpgradeAccount?: () => void;
  onOpenPrompts?: () => void;
  onPromoApplied?: (entitlements: UserEntitlements) => void;
  activeView?: "chat" | "rooms";
  onSelectView?: (view: "chat" | "rooms") => void;
  onCreateRoom?: () => void;
  onJoinRoom?: () => void;
  onRoomFull?: (room: StudyRoomPreview) => void;
}

export default function Sidebar({
  visible,
  onClose,
  userName,
  userEmail,
  userIsVerified = false,
  entitlements,
  openLevelUpCodeRequest = 0,
  onNewChat,
  conversations,
  rooms = [],
  activeRoomId,
  activeConversationId,
  onSelectConversation,
  onSelectRoom,
  onDeleteConversation,
  onSignOut,
  onOpenAuth,
  onUpgradeAccount,
  onOpenPrompts,
  onPromoApplied,
  activeView = "chat",
  onSelectView,
  onCreateRoom,
  onJoinRoom,
  onRoomFull,
  onRemoveRoom,
}: SidebarProps) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [rayaCardModalOpen, setRayaCardModalOpen] = useState(false);
  const [showLevelUpHint, setShowLevelUpHint] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [confirmingRoomId, setConfirmingRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (confirmingDeleteId) {
      const timer = setTimeout(() => setConfirmingDeleteId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmingDeleteId]);

  useEffect(() => {
    if (confirmingRoomId) {
      const timer = setTimeout(() => setConfirmingRoomId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirmingRoomId]);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmingDeleteId === id) {
      onDeleteConversation?.(id);
      setConfirmingDeleteId(null);
    } else {
      setConfirmingDeleteId(id);
    }
  };

  const handleRemoveRoomClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmingRoomId === id) {
      onRemoveRoom?.(id);
      setConfirmingRoomId(null);
    } else {
      setConfirmingRoomId(id);
    }
  };

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const seen = window.localStorage.getItem("raya_level_up_seen_v1");
      const { tipsEnabled } = readAppSettings();
      setShowLevelUpHint(tipsEnabled && seen !== "true");
    }
  }, []);

  function markLevelUpSeen() {
    setShowLevelUpHint(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("raya_level_up_seen_v1", "true");
    }
  }

  useEffect(() => {
    const syncSettings = () => {
      const seen = window.localStorage.getItem("raya_level_up_seen_v1");
      const { tipsEnabled } = readAppSettings();
      setShowLevelUpHint(tipsEnabled && seen !== "true");
    };

    window.addEventListener(APP_SETTINGS_EVENT, syncSettings);
    return () => window.removeEventListener(APP_SETTINGS_EVENT, syncSettings);
  }, []);

  useEffect(() => {
    if (openLevelUpCodeRequest <= 0) return;
    markLevelUpSeen();
    setProfileMenuOpen(false);
    setPromoModalOpen(true);
  }, [openLevelUpCodeRequest]);


  if (!mounted) {
    return (
      <aside
        className={cn(
          "h-[calc(100vh-1rem)] m-2 shrink-0 glass-panel rounded-3xl flex flex-col overflow-hidden transition-all duration-300",
          visible
            ? "w-[82vw] max-w-[300px] md:w-[300px] opacity-100"
            : "w-0 opacity-0 pointer-events-none mx-0"
        )}
      />
    );
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.title.toLowerCase().includes(normalizedQuery) ||
      conv.preview.toLowerCase().includes(normalizedQuery)
  );
  const filteredRooms = rooms.filter(
    (room) =>
      room.title.toLowerCase().includes(normalizedQuery) ||
      room.mission.toLowerCase().includes(normalizedQuery)
  );
  const sortedConversations = [...filteredConversations].sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );
  const hasConversations = conversations.length > 0;
  const hasRooms = rooms.length > 0;
  const hasSearch = normalizedQuery.length > 0;
  const conversationGroups = groupConversationsByDate(sortedConversations);

  const handleSelectConversation = (id: string) => {
    onSelectConversation?.(id);
  };

  return (
    <>
      <aside
      className={cn(
        "fixed inset-y-2 left-2 z-[70] md:relative md:inset-0 h-[calc(100vh-1rem)] shrink-0 glass-panel rounded-3xl flex flex-col overflow-hidden transition-all duration-300",
        visible
          ? "w-[280px] sm:w-[300px] opacity-100 translate-x-0"
          : "w-0 opacity-0 pointer-events-none -translate-x-full md:translate-x-0"
      )}
    >
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <Image src="/raya-logo.jpeg" alt="RAYA" width={32} height={32} className="rounded-lg object-cover" />
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

        <div className="px-4 py-3 flex flex-col gap-2">
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 px-4 py-3 bg-indigo-600 rounded-2xl hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
          >
            <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
            <span className="text-sm font-bold text-white">New conversation</span>
          </button>
          
          <button
            onClick={onOpenPrompts}
            className="w-full flex items-center gap-2 px-4 py-3 bg-white/50 backdrop-blur-sm border border-indigo-100 rounded-2xl hover:bg-indigo-50/50 transition-all group"
          >
            <Lightbulb className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-semibold text-indigo-900">Browse Prompts</span>
          </button>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-indigo-100/70 bg-white/55 p-1.5">
            <button
              type="button"
              onClick={() => onSelectView?.("chat")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors",
                activeView === "chat"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-indigo-700 hover:bg-indigo-50"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Solo
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectView?.("rooms");
                if (activeView === "rooms") {
                  onSelectRoom?.("");
                }
              }}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors",
                activeView === "rooms"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-indigo-700 hover:bg-indigo-50"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              Rooms
            </button>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 bg-indigo-50/50 backdrop-blur-sm border border-indigo-100/50 rounded-2xl px-3 py-2.5 transition-all focus-within:ring-2 focus-within:ring-indigo-500/10">
            <Search className="w-4 h-4 text-indigo-400" />
            <input
              type="text"
              placeholder={activeView === "rooms" ? "Search rooms..." : "Search conversations..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-indigo-900 placeholder-indigo-300 outline-none"
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
              {(activeView === "rooms" ? filteredRooms.length : filteredConversations.length)} result(s)
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {activeView === "rooms" ? (
            <>
              <div className="flex items-center gap-2 px-3 pt-2 pb-4">
                <Users className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-900 uppercase tracking-widest">Study Rooms</span>
              </div>

              <div className="space-y-2 px-2 pb-4">
                <button
                  type="button"
                  onClick={onCreateRoom}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-left text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  Create room
                </button>
                <button
                  type="button"
                  onClick={onJoinRoom}
                  className="w-full rounded-2xl border border-indigo-100 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-indigo-900 transition-colors hover:bg-indigo-50"
                >
                  Join by invite
                </button>
              </div>

              {!hasRooms && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">No rooms yet.</div>
              )}

              {hasRooms && hasSearch && filteredRooms.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No rooms for "{searchQuery}".
                </div>
              )}

              {hasRooms && (() => {
                return filteredRooms.map((room) => {
                  const isActiveViewId = activeRoomId === room.id;
                  const statusMeta = getStudyRoomStatusMeta(room);
                  const isFull = statusMeta.status === "full";
                  const isClosed = statusMeta.status === "closed";
                   
                  return (
                    <div
                      key={room.id}
                      onClick={() => {
                        if (isFull && !isActiveViewId) {
                          onRoomFull?.(room);
                          return;
                        }
                        onSelectRoom?.(room.id);
                      }}
                      className={cn(
                        "group mx-2 mb-2 cursor-pointer rounded-[20px] border px-4 py-3 transition-all relative overflow-hidden",
                        isActiveViewId
                          ? "border-indigo-200 bg-white shadow-sm ring-2 ring-indigo-50"
                          : statusMeta.status === "live"
                            ? "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                            : "border-transparent bg-transparent opacity-70"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 pr-6">
                          <p className={cn(
                            "truncate text-sm font-bold",
                            isActiveViewId ? "text-slate-900" : "text-slate-600"
                          )}>{room.title}</p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate-400 font-medium">{room.mission}</p>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1">
                          {statusMeta.status === "full" ? (
                            <span className="rounded-lg bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-600 uppercase tracking-tight">Full</span>
                          ) : statusMeta.status === "closed" ? (
                            <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-600 uppercase tracking-tight">Closed</span>
                          ) : (
                            <div className={cn(
                              "rounded-lg px-2 py-0.5",
                              isActiveViewId ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600"
                            )}>
                              <p className="text-[10px] font-black">{statusMeta.detail}</p>
                            </div>
                          )}
                        </div>
                        
                        {/* Remove button for rooms */}
                         <button
                           onClick={(e) => handleRemoveRoomClick(e, room.id)}
                           className={cn(
                             "absolute right-2 top-2 z-10 inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition-all outline-none",
                             confirmingRoomId === room.id
                               ? "bg-red-500 text-white border-red-500 opacity-100 shadow-sm"
                               : "border-slate-200 bg-white/95 text-slate-500 opacity-0 group-hover:opacity-100 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                           )}
                           title="Hide from room history"
                        >
                          <Archive className="w-3 h-3" />
                          {confirmingRoomId === room.id ? "Hide?" : "Hide"}
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 pt-2 pb-4">
                <History className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-900 uppercase tracking-widest">History</span>
              </div>

              {!hasConversations && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">No conversations yet.</div>
              )}

              {hasConversations && hasSearch && filteredConversations.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No results for "{searchQuery}".
                </div>
              )}

              {conversationGroups.map((group) => (
                <div key={group.label} className="mb-6">
                  <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest px-3 mb-2">{group.label}</p>

                  {group.items.map((conversation) => {
                    const isActive = activeConversationId === conversation.id;
                    return (
                        <div
                          key={conversation.id}
                          onClick={() => handleSelectConversation(conversation.id)}
                          className={cn(
                          "mx-2 mb-1 flex items-start justify-between gap-3 cursor-pointer rounded-xl px-3 py-2 transition-all group",
                          isActive
                            ? "bg-indigo-50/80"
                            : "hover:bg-slate-50/80"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={cn(
                            "truncate text-sm font-semibold",
                            isActive ? "text-indigo-900" : "text-slate-700"
                          )}>
                            {conversation.title}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {conversation.preview || "No preview available"}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDeleteClick(e, conversation.id)}
                          className={cn(
                            "group/delete relative shrink-0 rounded-lg px-2 py-1.5 transition-all outline-none",
                            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                            confirmingDeleteId === conversation.id
                              ? "bg-red-500 text-white hover:bg-red-600 scale-105 shadow-sm"
                              : "hover:bg-red-50 hover:text-red-500 text-slate-300"
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            {confirmingDeleteId === conversation.id ? (
                              <>
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-black uppercase">Delete?</span>
                              </>
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="border-t border-indigo-100/50 bg-indigo-50/20 p-4">
          <div className="relative">
            <div
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="w-full flex items-center gap-3 hover:bg-white/60 rounded-2xl p-2 transition-all cursor-pointer border border-transparent hover:border-indigo-100/50"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
                <span className="text-base font-bold text-white">
                  {userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-gray-900">{userName}</p>
                <p className="text-xs text-gray-500">{userEmail}</p>
              </div>
              {showLevelUpHint && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  Level Up
                </span>
              )}
            </div>

            <LanguageMenu isOpen={languageMenuOpen} onClose={() => setLanguageMenuOpen(false)} />

            <AnimatePresence>
              {profileMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.96 }}
                  className="absolute bottom-full left-0 right-0 mb-3 bg-white/80 backdrop-blur-2xl border border-indigo-100/50 rounded-3xl shadow-[0_12px_40px_rgba(79,70,229,0.12)] overflow-hidden z-50 origin-bottom"
                >
                  <div className="flex items-center gap-3 px-4 py-4 border-b border-indigo-50/50 bg-indigo-50/20">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-md">
                      <span className="text-lg font-bold text-white">
                        {userName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-bold text-indigo-900 truncate">{userName}</p>
                      <p className="text-[11px] text-indigo-400 truncate tracking-tight">{userEmail}</p>
                    </div>
                  </div>

                  <div className="py-1">
                    {!userIsVerified && (
                      <div
                        onClick={() => {
                          setProfileMenuOpen(false);
                          onUpgradeAccount?.();
                        }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 cursor-pointer"
                      >
                        <Mail className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm text-indigo-700">Verify this instant account</span>
                      </div>
                    )}


                    <div
                      onClick={() => {
                        markLevelUpSeen();
                        setPromoModalOpen(true);
                        setProfileMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/50 cursor-pointer group transition-colors"
                    >
                      <Gift className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition-transform" />
                      <span className="text-sm text-indigo-900/80 font-medium">Level Up Code</span>
                      {showLevelUpHint && (
                        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          New
                        </span>
                      )}
                    </div>

                    <div
                      onClick={() => {
                        setLanguageMenuOpen(true);
                        setProfileMenuOpen(false);
                      }}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-indigo-50/50 cursor-pointer group transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="w-4 h-4 text-indigo-400 group-hover:rotate-12 transition-transform" />
                        <span className="text-sm text-indigo-900/80 font-medium">Language</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-indigo-300" />
                    </div>

                    <div
                      onClick={() => {
                        setHelpModalOpen(true);
                        setProfileMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/50 cursor-pointer group transition-colors"
                    >
                      <HelpCircle className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                      <span className="text-sm text-indigo-900/80 font-medium">Help</span>
                    </div>

                    <div
                      onClick={() => {
                        setSettingsModalOpen(true);
                        setProfileMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/50 cursor-pointer group transition-colors"
                    >
                      <Settings className="w-4 h-4 text-indigo-400 group-hover:rotate-45 transition-transform" />
                      <span className="text-sm text-indigo-900/80 font-medium">Settings</span>
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
                        <LogOut className="w-4 h-4 text-indigo-500 rotate-180" />
                        <span className="text-sm text-indigo-600 font-semibold">Log into another account</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </aside>

      <PromoCodeModal
        isOpen={promoModalOpen}
        onClose={() => setPromoModalOpen(false)}
        onApplied={onPromoApplied}
      />

      {/* Model Picker Menu - PRO (coming soon)
      <ModelPickerMenu
        visible={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        currentModel={currentModel}
        onSelectModel={setCurrentModel}
      />
      */}

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        userIsVerified={userIsVerified}
        onOpenRayaCard={() => setRayaCardModalOpen(true)}
      />
      <HelpModal isOpen={helpModalOpen} onClose={() => setHelpModalOpen(false)} />
      <RayaCardModal isOpen={rayaCardModalOpen} onClose={() => setRayaCardModalOpen(false)} />
    </>
  );
}
