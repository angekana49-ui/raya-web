"use client";

import { useNotificationStore } from "@/store/useNotificationStore";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Trophy, BadgeCheck, TrendingUp, UserPlus, ExternalLink, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import * as socialService from "@/services/social.service";

export default function UnifiedToastStack() {
  const { notifications, removeNotification } = useNotificationStore();
  const router = useRouter();

  const dismissNotification = async (notif: any) => {
    try {
      if (notif.payload?.notificationId) {
        await socialService.markNotificationRead(notif.payload.notificationId);
      }
    } catch (err) {
      console.error("Dismiss failed", err);
    } finally {
      removeNotification(notif.id);
    }
  };

  const handleAction = async (notif: any, action: 'accept' | 'join' | 'read') => {
    try {
      if (notif.type === 'friend_request' && action === 'accept') {
        await socialService.acceptFriendRequest(notif.payload.senderId);
      } else if (notif.type === 'room_invite' && action === 'join') {
        if (notif.payload?.notificationId) {
          await socialService.markNotificationRead(notif.payload.notificationId);
        }
        router.push(`/?view=rooms&roomInvite=${encodeURIComponent(notif.payload.roomId)}`);
      } else if (notif.payload?.notificationId) {
        await socialService.markNotificationRead(notif.payload.notificationId);
      }
      removeNotification(notif.id);
    } catch (err) {
      console.error("Action failed", err);
    }
  };

  return (
    <div className="fixed top-6 right-6 z-[100] flex flex-col items-end gap-3 pointer-events-none w-80">
      <AnimatePresence mode="popLayout" initial={false}>
        {notifications.map((notif) => (
          <motion.div
            key={notif.id}
            layout
            initial={{ opacity: 0, x: 100, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9, transition: { duration: 0.2 } }}
            className="pointer-events-auto overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl w-full"
          >
            {/* Gamification Style */}
            {["xp", "mission", "badge", "level_up"].includes(notif.type) ? (
              <div className={cn(
                "p-3 flex items-center gap-3",
                notif.type === 'xp' && "bg-yellow-50",
                notif.type === 'mission' && "bg-emerald-50",
                notif.type === 'level_up' && "bg-indigo-50"
              )}>
                <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center">
                  {notif.type === 'xp' && <Zap className="w-4 h-4 text-yellow-500 fill-yellow-400" />}
                  {notif.type === 'mission' && <Trophy className="w-4 h-4 text-emerald-500" />}
                  {notif.type === 'badge' && <div className="text-sm">{notif.payload?.emoji || "🏅"}</div>}
                  {notif.type === 'level_up' && <TrendingUp className="w-4 h-4 text-indigo-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-tight text-slate-800 truncate">
                    {notif.title}
                  </p>
                  {notif.sub && <p className="text-[10px] font-bold text-slate-500 truncate">{notif.sub}</p>}
                </div>
                <button onClick={() => void dismissNotification(notif)} className="text-slate-300 hover:text-slate-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              /* Social Style */
              <div>
                <div className="bg-slate-50 px-4 py-1.5 flex items-center justify-between border-b border-slate-100">
                  <p className="text-[9px] font-black uppercase tracking-[0.1em] text-indigo-600">
                    {notif.type === 'friend_request' ? "Squad Alert" : "Session Invite"}
                  </p>
                  <button onClick={() => void dismissNotification(notif)} className="text-slate-400 hover:text-slate-600">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 shrink-0 rounded-xl bg-indigo-600 flex items-center justify-center text-xs font-black text-white uppercase">
                      {(notif.sender?.display_name || notif.sender?.username || '?')[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black text-slate-800 truncate">
                        {notif.sender?.display_name || notif.sender?.username}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 truncate">
                        {notif.sub}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {notif.type === 'friend_request' ? (
                      <button
                        onClick={() => handleAction(notif, 'accept')}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-[10px] font-black uppercase text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
                      >
                        <Check className="h-3 w-3" />
                        Accept
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAction(notif, 'join')}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-[10px] font-black uppercase text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Join Session
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
