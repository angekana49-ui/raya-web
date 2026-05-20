"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Sparkles, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate?: (payload: { title: string; mission: string; duration: number; aiMode: "passive" | "active"; files: File[] }) => void | Promise<void>;
}

export default function CreateRoomModal({
  isOpen,
  onClose,
  onCreate,
}: CreateRoomModalProps) {
  const [title, setTitle] = useState("");
  const [mission, setMission] = useState("");
  const [duration, setDuration] = useState(30);
  const [aiMode, setAiMode] = useState<"passive" | "active">("active");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setMission("");
    setDuration(30);
    setAiMode("active");
    setFiles([]);
    setIsSubmitting(false);
    setFormError(null);
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (files.length + newFiles.length > 3) {
        alert("Maximum 3 files allowed.");
        return;
      }
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !mission.trim()) {
      setFormError("Give the room a clear title and mission before launching.");
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError(null);
      await onCreate?.({
        title: title.trim(),
        mission: mission.trim(),
        duration,
        aiMode,
        files
      });
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not launch the room right now.");
    } finally {
      setIsSubmitting(false);
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
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 overflow-y-auto"
            onClick={isSubmitting ? undefined : onClose}
          >
            <div
              className="my-auto w-full max-w-lg overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-6 py-6 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                      <Users className="h-3.5 w-3.5" />
                      New Squad Room
                    </div>
                    <h2 className="text-2xl font-black tracking-tight">Create a study room</h2>
                    <p className="mt-1 text-sm text-indigo-100/80 font-medium">
                      Start a session that feels live, focused, and social.
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5 p-6 h-[70vh] overflow-y-auto scrollbar-hide">
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Room Identity
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-bold text-slate-900 outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                    placeholder="e.g. Algebra Sprint"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Mission Goals
                  </label>
                  <textarea
                    value={mission}
                    onChange={(e) => setMission(e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-medium leading-relaxed text-slate-900 outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50"
                    placeholder="e.g. Solve together, explain clearly, and help the slowest teammate catch up before the timer ends."
                  />
                  <p className="mt-2 text-[11px] font-medium text-slate-400">
                    Keep it concrete: what should the squad produce before the timer ends?
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Duration: {duration} min
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="60"
                      step="5"
                      value={duration}
                      onChange={(e) => setDuration(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                      <span>10m</span>
                      <span>60m</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                      AI Mode: {aiMode === "active" ? "Active" : "Passive"}
                    </label>
                    <div className="flex p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setAiMode("active")}
                        className={cn(
                          "flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all",
                          aiMode === "active" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiMode("passive")}
                        className={cn(
                          "flex-1 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all",
                          aiMode === "passive" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Passive
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Context Knowledge (Max 3)
                  </label>
                  <div className="space-y-2">
                    {files.length < 3 && (
                      <label className="group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-4 transition-all hover:border-indigo-300 hover:bg-indigo-50/30">
                        <div className="flex flex-col items-center justify-center space-y-1">
                          <Plus className="h-5 w-5 text-slate-400 group-hover:text-indigo-500" />
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 group-hover:text-indigo-600">
                            Add context file
                          </p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          onChange={handleFileChange}
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
                          multiple
                        />
                      </label>
                    )}
                    
                    <div className="flex flex-wrap gap-2">
                      {files.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 border border-indigo-100">
                          <span className="max-w-[120px] truncate text-[10px] font-bold text-indigo-700">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="text-indigo-300 hover:text-indigo-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {formError && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {formError}
                  </div>
                )}

                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-[11px] font-semibold leading-relaxed text-indigo-700">
                  The room starts live immediately. Raya, the timer, and the shared transcript all begin as soon as you launch.
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 text-xs font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50 active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-indigo-200 transition-all hover:shadow-indigo-300 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                  >
                    {isSubmitting ? "Launching..." : "Launch Squad"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
