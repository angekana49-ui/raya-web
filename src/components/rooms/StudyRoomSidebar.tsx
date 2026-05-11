"use client";

import { FileText, Flame, Target, Trophy, Users, Search, UserPlus, Send, Check, Loader2, Link, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttachedFile } from "@/types";
import { useState, useEffect } from "react";
import * as socialService from "@/services/social.service";
import { useAuth } from "@/hooks/useAuth";
import { resolveAttachedFileUrl } from "@/lib/attached-files";

import { getRoomFiles } from "@/services/study-rooms.service";

type RoomSidebarMember = {
  id: string;
  name: string;
  role: string;
  accent: string;
  streak: number;
};

interface StudyRoomSidebarProps {
  visible: boolean;
  onClose: () => void;
  members: RoomSidebarMember[];
  files?: AttachedFile[];
  /** Set only when a room session is open (not lobby). */
  roomId?: string;
  roomName?: string;
  mission?: string;
  timerStatus?: "idle" | "running" | "finished";
  /** ISO end time for the room timer (same source as the main room shell). */
  timerEndsAt?: string | null;
  onlineCount?: number;
  maxMembers?: number;
  roomAiMode?: "passive" | "active";
}

function formatMinutesLeft(endsAtIso: string): string {
  const end = new Date(endsAtIso).getTime();
  if (!Number.isFinite(end)) return "";
  const m = Math.max(0, Math.ceil((end - Date.now()) / 60_000));
  if (m >= 120) return `${Math.round(m / 60)}h left`;
  if (m <= 1) return "≤1 min left";
  return `${m} min left`;
}

export default function StudyRoomSidebar({
  visible,
  onClose,
  members,
  files: initialFiles = [],
  roomId,
  roomName,
  mission,
  timerStatus = "running",
  timerEndsAt,
  onlineCount,
  maxMembers,
  roomAiMode,
}: StudyRoomSidebarProps) {
  const { user, dbUserId } = useAuth();
  const [friends, setFriends] = useState<socialService.UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<socialService.UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<Set<string>>(new Set());
  const [pendingFriendRequests, setPendingFriendRequests] = useState<Set<string>>(new Set());
  const [friendshipStatuses, setFriendshipStatuses] = useState<Record<string, socialService.FriendshipStatus>>({});
  const [copyLinkState, setCopyLinkState] = useState("Share Room Link");
  const [socialNotice, setSocialNotice] = useState<string | null>(null);
  const [roomFiles, setRoomFiles] = useState<AttachedFile[]>(initialFiles);

  async function loadFriends() {
    const data = await socialService.getFriends();
    setFriends(data);
  }


  async function loadFriendshipStatuses() {
    const statuses = await socialService.getFriendshipStatuses(members.map(m => m.id));
    setFriendshipStatuses(statuses);
  }

  async function loadRoomFiles() {
    if (!roomId) return;
    const dbFiles = await getRoomFiles(roomId);
    setRoomFiles(dbFiles);
  }

  useEffect(() => {
    if (visible && user) {
      loadFriends();
    }
  }, [visible, user]);

  useEffect(() => {
    setRoomFiles(initialFiles);
  }, [initialFiles]);

  useEffect(() => {
    if (visible && roomId) {
      loadRoomFiles();
    }
  }, [visible, roomId]);

  useEffect(() => {
    if (visible && user && members.length > 0) {
      loadFriendshipStatuses();
    }
  }, [visible, user, members]);

  

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.length < 3) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const results = await socialService.searchUsers(val);
    // Filter out self and existing friends
    const filtered = results.filter(r => r.id !== dbUserId && !friends.some(f => f.id === r.id));
    setSearchResults(filtered);
    setIsSearching(false);
  };

  const handleAddFriend = async (friendId: string) => {
    try {
      await socialService.sendFriendRequest(friendId);
      setPendingFriendRequests(prev => new Set(prev).add(friendId));
      setSocialNotice("Friend request sent.");
    } catch (err) {
      console.error("Failed to send friend request", err);
      setSocialNotice("Could not send the friend request right now.");
    }
  };

  const handleInvite = async (friendId: string) => {
    if (!roomId || !roomName) return;
    try {
      await socialService.sendRoomInvite(friendId, roomId, roomName);
      setPendingInvites(prev => new Set(prev).add(friendId));
      setSocialNotice("Room invite sent.");
      setTimeout(() => {
        setPendingInvites(prev => {
          const next = new Set(prev);
          next.delete(friendId);
          return next;
        });
      }, 3000);
    } catch (err) {
      console.error("Failed to send invite", err);
      setSocialNotice("Could not send the invite right now.");
    }
  };

  const copyInviteLink = async () => {
    if (!roomId) return;
    const url = `${window.location.origin}/rooms/${roomId}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: roomName || "RAYA Room",
          text: mission || "Join my study room on RAYA.",
          url,
        });
        setCopyLinkState("Shared!");
      } else {
        await navigator.clipboard.writeText(url);
        setCopyLinkState("Copied!");
      }
    } catch {
      setCopyLinkState("Could not share");
    }

    window.setTimeout(() => setCopyLinkState("Share Room Link"), 2000);
  };

  useEffect(() => {
    if (!socialNotice) return;
    const timer = window.setTimeout(() => setSocialNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [socialNotice]);

  const sessionStatus = timerStatus === "finished"
    ? { label: "Closed Session", tone: "text-slate-600", dot: "bg-slate-500" }
    : { label: "Live Session", tone: "text-emerald-600", dot: "bg-emerald-500" };
  const effectiveOnlineCount = typeof onlineCount === "number" ? onlineCount : members.length;
  const showKnownMembersOnly = members.length < effectiveOnlineCount;
  return (
    <aside
      className={cn(
        "fixed inset-y-2 right-2 z-[70] md:relative md:inset-0 h-[calc(100vh-1rem)] shrink-0 glass-panel rounded-3xl flex flex-col overflow-hidden transition-all duration-300",
        visible
          ? "w-[82vw] max-w-[320px] translate-x-0 opacity-100 md:w-[320px]"
          : "pointer-events-none w-0 translate-x-full opacity-0 md:translate-x-0"
      )}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Room Pulse</p>
          <h3 className="mt-1 text-sm font-black uppercase tracking-wide text-slate-800">
            {roomId ? "Squad Board" : "Lobby View"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100"
          aria-label="Close room sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {!roomId ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-300 border border-slate-100">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800 mb-1">No Active Room</p>
              <p className="text-xs font-semibold text-slate-400 leading-relaxed">
                Join a study session to see the squad, shared mission, and files here.
              </p>
            </div>
          </div>
        ) : (
          <>
            <section className="rounded-[24px] border border-indigo-100 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_100%)] p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">
                <Target className="h-3.5 w-3.5" />
                Room Mission
              </div>
              <p className="mt-3 text-sm font-black leading-snug text-slate-900">
                {mission || "Focus on the shared mission and help the squad converge on the clearest answer."}
              </p>
              <div className="mt-3 rounded-2xl bg-white/90 px-3 py-2 text-[11px] font-semibold text-slate-500 shadow-sm">
                {timerStatus === "finished"
                  ? "Session closed — read-only. Raya won’t run new turns here."
                  : "Session open — Raya stays on the room mission (see header for AI Active/Passive)."}
              </div>
              {timerStatus !== "finished" && timerEndsAt && (
                <p className="mt-2 text-center text-[11px] font-black uppercase tracking-widest text-indigo-600">
                  {formatMinutesLeft(timerEndsAt)}
                </p>
              )}
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
                  <p className={cn("text-sm font-bold flex items-center gap-1.5", sessionStatus.tone)}>
                    <span className={cn("w-2 h-2 rounded-full", sessionStatus.dot)} />
                    {sessionStatus.label}
                  </p>
                  {roomAiMode && (
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Raya: <span className="text-slate-800">{roomAiMode}</span>
                    </p>
                  )}
                </div>
                <div className="text-right space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Members</p>
                  <p className="text-sm font-bold text-slate-700">
                    {typeof onlineCount === "number" && typeof maxMembers === "number"
                      ? `${Math.min(onlineCount, maxMembers)}/${maxMembers}`
                      : `${members.length} Online`}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-4">
                <button
                  onClick={copyInviteLink}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95",
                    copyLinkState === "Copied!" 
                      ? "bg-emerald-500 text-white shadow-emerald-200" 
                      : "bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700"
                  )}
                >
                  {copyLinkState === "Copied!" ? <Check className="h-4 w-4" /> : <Link className="h-4 w-4" />}
                  {copyLinkState}
                </button>
              </div>

              {socialNotice && (
                <div className="mb-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] font-semibold text-indigo-700">
                  {socialNotice}
                </div>
              )}

              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-sky-500" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">
                    {showKnownMembersOnly ? "Known Profiles" : "In this Session"}
                  </h3>
                </div>
                <p className="text-[10px] font-black text-slate-400">
                  {showKnownMembersOnly ? `${members.length}/${effectiveOnlineCount}` : members.length}
                </p>
              </div>
              {showKnownMembersOnly && (
                <div className="mb-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                  Live attendance is updating in real time. Detailed member profiles appear here only when this client knows them.
                </div>
              )}
              <div className="space-y-2">
                {members.map((member) => {
                  const isFriend = friendshipStatuses[member.id] === 'accepted';
                  const isPending = friendshipStatuses[member.id] === 'pending' || pendingFriendRequests.has(member.id);
                  const isSelf = member.id === dbUserId;

                  return (
                    <div key={member.id} className="flex items-center gap-3 rounded-[18px] border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-black text-white shadow-sm"
                        style={{ background: member.accent }}
                      >
                        {member.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-bold text-slate-800">{member.name}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{member.role}</p>
                      </div>
                      
                      {!isSelf && !isFriend && (
                        <button
                          onClick={() => handleAddFriend(member.id)}
                          disabled={isPending}
                          className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm transition-all hover:bg-indigo-50 active:scale-95 disabled:opacity-50"
                          title={isPending ? "Request Sent" : "Add to Squad"}
                        >
                          {isPending ? <Check className="h-4 w-4 text-emerald-500" /> : <UserPlus className="h-4 w-4" />}
                        </button>
                      )}

                      <div className="rounded-xl bg-white px-2 py-1 text-right shadow-sm border border-slate-50">
                        <p className="text-[10px] font-black text-orange-500">{member.streak}x</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Online Friends (Nearby Squad) */}
              <div className="mt-6 space-y-2 border-t border-slate-50 pt-4">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Nearby Squad</h3>
                  </div>
                </div>
                
                {friends.filter(f => !members.some(m => m.id === f.id)).length > 0 ? (
                  friends.filter(f => !members.some(m => m.id === f.id)).map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between rounded-xl border border-slate-50 bg-slate-50/50 p-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="h-8 w-8 shrink-0 rounded-xl bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white uppercase">
                          {(friend.display_name || friend.username || '?')[0]}
                        </div>
                        <p className="truncate text-[11px] font-bold text-slate-700">{friend.display_name || friend.username}</p>
                      </div>
                      <button
                        onClick={() => handleInvite(friend.id)}
                        disabled={pendingInvites.has(friend.id)}
                        className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-indigo-600 shadow-sm transition-all hover:bg-indigo-50 active:scale-95 disabled:opacity-50"
                      >
                        {pendingInvites.has(friend.id) ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <>
                            <Send className="h-3 w-3" />
                            Invite
                          </>
                        )}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="px-1 py-1 text-[10px] font-medium text-slate-400 italic">No friends nearby.</p>
                )}
              </div>
            </section>

            {roomFiles.length > 0 && (
              <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <FileText className="h-4 w-4 text-violet-500" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Shared Files</h3>
                </div>
                <div className="space-y-2">
                  {roomFiles.map((file) => (
                    <a
                      key={file.id}
                      href={resolveAttachedFileUrl(file) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "flex items-center gap-3 rounded-[18px] border border-slate-100 bg-slate-50/80 px-3 py-2 transition-colors",
                        resolveAttachedFileUrl(file) ? "hover:bg-slate-100" : "cursor-not-allowed opacity-60"
                      )}
                      onClick={(event) => {
                        if (!resolveAttachedFileUrl(file)) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-bold text-slate-800">{file.name}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                          {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Size unknown'}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-auto border-t border-slate-100 pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Find Squad Members..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-[12px] font-bold text-slate-700 transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                />
              </div>

              {searchQuery.length >= 3 && (
                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                  {isSearching ? (
                    <div className="flex justify-center py-4 text-slate-400"><Loader2 className="animate-spin h-5 w-5" /></div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map(res => (
                      <div key={res.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-50/50">
                        <p className="text-[11px] font-bold text-slate-700 truncate">{res.display_name || res.username}</p>
                        <button 
                          onClick={() => handleAddFriend(res.id)}
                          className="text-indigo-600 hover:bg-white p-1 rounded-lg"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-400 italic px-2">No users found.</p>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
