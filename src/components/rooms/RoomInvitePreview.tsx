"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles, Users } from "lucide-react";

interface RoomInvitePreviewProps {
  roomId: string;
  roomName: string;
  mission: string;
  onlineCount: number;
  maxMembers: number;
  vibe: string;
  aiMode?: "passive" | "active";
  timerStatus?: "idle" | "running" | "finished";
}

export default function RoomInvitePreview({
  roomId,
  roomName,
  mission,
  onlineCount,
  maxMembers,
  vibe,
  aiMode = "active",
  timerStatus = "running",
}: RoomInvitePreviewProps) {
  const joinHref = `/?view=rooms&roomInvite=${encodeURIComponent(roomId)}`;
  const isFull = onlineCount >= maxMembers;
  const isClosed = timerStatus === "finished";
  const isJoinDisabled = isFull || isClosed;
  const modeCopy = aiMode === "passive"
    ? "RAYA stays quiet unless the room calls @raya or focus breaks."
    : "RAYA actively moderates, keeps momentum up, and helps the squad converge.";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(124,58,237,0.16),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef2ff_100%)] px-4 py-6 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-5xl items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[36px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(37,99,235,0.12)] backdrop-blur-xl sm:p-8"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-indigo-600">
              <Users className="h-3.5 w-3.5" />
              You are invited
            </div>

            <h1 className="mt-4 max-w-xl text-4xl font-black leading-none tracking-tight text-slate-950 sm:text-5xl">
              Join {roomName}
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              {mission}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
                <Users className="h-3.5 w-3.5 text-sky-500" />
                {onlineCount}/{maxMembers} online now
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
                {vibe}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 shadow-sm capitalize">
                <Sparkles className="h-3.5 w-3.5" />
                Raya {aiMode} mode
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                Join first, sign up later
              </span>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {isJoinDisabled ? (
                <div className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-slate-200 px-6 py-4 text-sm font-black text-slate-500">
                  {isClosed ? "Session finished" : "Room full"}
                </div>
              ) : (
                <Link
                  href={joinHref}
                  className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] px-6 py-4 text-sm font-black text-white shadow-[0_16px_50px_rgba(79,70,229,0.26)] transition-transform hover:-translate-y-0.5"
                >
                  Join in 10 seconds
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-[22px] border border-slate-200 bg-white px-6 py-4 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Go to RAYA home
              </Link>
            </div>

            <p className="mt-4 text-xs font-medium text-slate-500">
              No heavy signup wall. Pick a name, jump into the room, and secure your account later if you want to keep your progress.
            </p>
            <p className="mt-2 text-xs font-medium text-slate-500">
              {modeCopy}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="rounded-[36px] border border-slate-200/70 bg-[linear-gradient(180deg,#0f172a_0%,#1e293b_100%)] p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] sm:p-8"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">What to expect</p>

            <div className="mt-5 space-y-4">
              <div className="rounded-[24px] bg-white/5 p-4">
                <p className="text-sm font-black text-white">Live squad energy</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">
                  You are not entering a dead chat. You are joining a room where people are already thinking, explaining, and competing together.
                </p>
              </div>

              <div className="rounded-[24px] bg-white/5 p-4">
                <p className="text-sm font-black text-white">AI host, not just AI answers</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">
                  RAYA nudges the room, rewards helpful behavior, and keeps the session moving without talking over everyone.
                </p>
              </div>

              <div className="rounded-[24px] bg-white/5 p-4">
                <p className="text-sm font-black text-white">Built for fast entry</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">
                  Good invite flows feel instant. That is the point here: join first, belong fast, then decide whether to keep the account.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
