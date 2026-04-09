"use client";

import { motion } from "framer-motion";
import { Users, Plus, Link2, Sparkles, Clock, Globe, Menu, ChevronRight } from "lucide-react";
import type { StudyRoomPreview } from "@/types";

interface StudyRoomsLobbyProps {
  rooms: StudyRoomPreview[];
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onSelectRoom: (roomId: string) => void;
  onToggleSidebar: () => void;
  onTogglePanel: () => void;
  panelOpen?: boolean;
  onRoomFull?: (room: StudyRoomPreview) => void;
  onRemoveRoom?: (roomId: string) => void;
}

export default function StudyRoomsLobby({
  rooms,
  onCreateRoom,
  onJoinRoom,
  onSelectRoom,
  onToggleSidebar,
  onTogglePanel,
  panelOpen = false,
  onRoomFull,
  onRemoveRoom,
}: StudyRoomsLobbyProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-10">
        <section className="sticky top-2 z-30">
          <div className="mx-auto flex max-w-5xl items-center justify-between rounded-[1.75rem] border border-slate-200/80 bg-white/80 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-sm">
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Open sidebar"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-indigo-400">Rooms Lobby</p>
              <h2 className="text-sm font-black text-slate-900 sm:text-base">Live study sessions</h2>
            </div>

            <button
              type="button"
              onClick={onTogglePanel}
              aria-label={panelOpen ? "Hide room sidebar" : "Show room sidebar"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200"
            >
              <ChevronRight className={`h-5 w-5 transition-transform ${panelOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        </section>

        
        {/* Header / Hero */}
        <section className="relative overflow-hidden rounded-[2.5rem] bg-[linear-gradient(135deg,#e0e7ff_0%,#f5f3ff_100%)] px-8 py-12 md:py-16 shadow-[0_8px_32px_rgba(79,70,229,0.06)] border border-white/60">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-indigo-400 blur-[100px] opacity-20 rounded-full mix-blend-multiply pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-violet-400 blur-[100px] opacity-20 rounded-full mix-blend-multiply pointer-events-none" />
          
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 px-3 py-1 font-bold text-indigo-700 tracking-widest uppercase text-xs">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                Live Together
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-[1.1]">
                Study Rooms
              </h1>
              <p className="max-w-lg text-lg text-slate-600 font-medium leading-relaxed">
                Connect with others, focus on shared missions, and learn faster. Jump into a live room or create your own squad.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row md:flex-col gap-3 min-w-[200px]">
              <button 
                onClick={onCreateRoom}
                className="group relative flex items-center justify-center gap-3 w-full rounded-2xl bg-indigo-600 px-6 py-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(79,70,229,0.25)] transition-all hover:bg-indigo-700 hover:shadow-[0_12px_24px_rgba(79,70,229,0.3)] active:scale-[0.98]"
              >
                <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
                <span>Create a Room</span>
              </button>
              
              <button 
                onClick={onJoinRoom}
                className="flex items-center justify-center gap-3 w-full rounded-2xl border border-indigo-200 bg-white/60 backdrop-blur-sm px-6 py-4 text-sm font-bold text-indigo-800 transition-all hover:bg-white hover:border-indigo-300 hover:shadow-sm active:scale-[0.98]"
              >
                <Link2 className="w-5 h-5" />
                <span>Join by Invite</span>
              </button>
            </div>
          </div>
        </section>

        {/* Active Rooms Grid */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-500" />
              Active Sessions
            </h2>
            <span className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
              {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'} online
            </span>
          </div>

          {rooms.length === 0 ? (
            <div className="rounded-[2rem] border-2 border-dashed border-indigo-100 bg-indigo-50/30 flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">No active rooms</h3>
              <p className="text-slate-500 text-sm max-w-sm mb-6">
                Be the first to start a session today! Create a room to focus with others.
              </p>
              <button 
                onClick={onCreateRoom}
                className="rounded-xl bg-indigo-100 text-indigo-700 px-6 py-2.5 text-sm font-bold hover:bg-indigo-200 transition-colors"
              >
                Start a New Room
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {rooms.map((room, idx) => {
                const isFull = room.onlineCount >= room.maxMembers;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={room.id}
                    onClick={() => {
                      if (isFull) {
                        onRoomFull?.(room);
                        return;
                      }
                      onSelectRoom(room.id);
                    }}
                    className={`relative group cursor-pointer flex flex-col rounded-3xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                      isFull 
                        ? "border-slate-200 bg-slate-50 opacity-80" 
                        : "border-indigo-100 bg-white shadow-sm hover:border-indigo-300 hover:shadow-indigo-100/50"
                    }`}
                  >
                    {/* Dismiss Room Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveRoom?.(room.id);
                      }}
                      className="absolute -top-2 -right-2 z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-all hover:bg-red-50 hover:text-red-500 hover:border-red-200 group-hover:flex"
                      aria-label="Dismiss room"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="flex w-2.5 h-2.5 relative">
                          {!isFull && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                          <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${isFull ? 'bg-orange-500' : 'bg-emerald-500'}`}></span>
                        </span>
                        <span className={`text-xs font-black uppercase tracking-widest ${isFull ? 'text-orange-600' : 'text-emerald-600'}`}>
                          {isFull ? 'Full' : 'Live'}
                        </span>
                      </div>
                      
                      <div className={`text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1 shrink-0 ${
                        isFull ? 'bg-orange-100 text-orange-700' : 'bg-indigo-50 text-indigo-700'
                      }`}>
                        <Users className="w-3.5 h-3.5" />
                        {room.onlineCount}/{room.maxMembers}
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-slate-900 mb-2 truncate group-hover:text-indigo-600 transition-colors">
                      {room.title}
                    </h3>
                    
                    <p className="text-sm text-slate-500 font-medium line-clamp-2 leading-relaxed flex-1 mb-6">
                      {room.mission}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          {room.duration ? `${room.duration} min` : 'Continuous'}
                        </div>
                        {room.aiMode && (
                          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-violet-500 bg-violet-50 px-2 py-0.5 rounded-md">
                            {room.aiMode} AI
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
