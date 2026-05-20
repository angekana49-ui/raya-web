"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Share2, Users, X } from "lucide-react";

interface InviteRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  inviteUrl: string;
  onlineCount: number;
}

export default function InviteRoomModal({
  isOpen,
  onClose,
  roomName,
  inviteUrl,
  onlineCount,
}: InviteRoomModalProps) {
  const [copied, setCopied] = useState(false);

  const shareText = useMemo(
    () =>
      `Join my RAYA study room "${roomName}". We are live right now and you do not need a full signup to jump in: ${inviteUrl}`,
    [inviteUrl, roomName]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join ${roomName} on RAYA`,
          text: shareText,
          url: inviteUrl,
        });
      } else {
        await handleCopy();
      }
    } catch {
      // user cancelled or browser blocked
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="w-full max-w-lg overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[linear-gradient(135deg,#0f172a_0%,#334155_100%)] px-5 py-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]">
                      <Users className="h-3.5 w-3.5" />
                      Invite Squad
                    </div>
                    <h2 className="text-xl font-black">Bring someone into {roomName}</h2>
                    <p className="mt-1 text-sm text-slate-300">
                      Share one link. They can jump in whether they already use RAYA or not.
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="rounded-[24px] border border-indigo-100 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_100%)] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Invite preview</p>
                  <h3 className="mt-2 text-lg font-black text-slate-900">{roomName}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {onlineCount} students are already inside. New arrivals can join first and secure their account later.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                    Share link
                  </label>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 break-all">
                    {inviteUrl}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs leading-relaxed text-slate-600">
                    Suggested message:
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-800">
                    {shareText}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] px-4 py-3 text-sm font-black text-white shadow-lg shadow-indigo-200 transition-transform hover:-translate-y-0.5"
                  >
                    <Share2 className="h-4 w-4" />
                    Share invite
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
