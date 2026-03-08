"use client";

import { useMemo, useState } from "react";
import { X, BarChart3, Target, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NoTranslate } from "@/components/ui/NoTranslate";
import LearningHud from "@/components/chat/LearningHud";

interface SkillItem {
  key: string;
  label: string;
  progress: number;
}

interface RightLearningSidebarProps {
  visible: boolean;
  onClose: () => void;
  xpToday: number;
  streakCount: number;
  missionTitle: string;
  missionCurrent: number;
  missionTarget: number;
  skills: SkillItem[];
}

type TabId = "overview" | "mission" | "skills";

export default function RightLearningSidebar(props: RightLearningSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const missionPercent = useMemo(
    () =>
      Math.max(
        0,
        Math.min(100, Math.round((props.missionCurrent / Math.max(1, props.missionTarget)) * 100))
      ),
    [props.missionCurrent, props.missionTarget]
  );

  return (
    <aside
      className={cn(
        "h-full shrink-0 bg-white border-l border-gray-200 shadow-sm flex flex-col overflow-hidden transition-[width,opacity] duration-300",
        props.visible
          ? "w-[82vw] max-w-[320px] md:w-[320px] opacity-100"
          : "w-0 opacity-0 border-l-0 pointer-events-none"
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <img src="/raya-logo.jpeg" alt="RAYA" className="w-8 h-8 rounded-lg object-cover" />
        <span className="flex-1 text-lg font-bold text-primary">
          <NoTranslate>RAYA Progress</NoTranslate>
        </span>
        <button
          onClick={props.onClose}
          className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Close right sidebar"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setActiveTab("overview")}
            className={cn(
              "h-8 text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors",
              activeTab === "overview" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab("mission")}
            className={cn(
              "h-8 text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors",
              activeTab === "mission" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Target className="w-3.5 h-3.5" />
            Mission
          </button>
          <button
            onClick={() => setActiveTab("skills")}
            className={cn(
              "h-8 text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors",
              activeTab === "skills" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Skills
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {activeTab === "overview" && (
          <LearningHud
            xpToday={props.xpToday}
            streakCount={props.streakCount}
            missionTitle={props.missionTitle}
            missionCurrent={props.missionCurrent}
            missionTarget={props.missionTarget}
            skills={props.skills}
            className="pt-0 pb-0 px-0"
          />
        )}

        {activeTab === "mission" && (
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Daily mission</p>
            <p className="text-sm font-semibold text-slate-800 mt-1">{props.missionTitle}</p>
            <div className="mt-3 h-2 rounded-full bg-violet-100 overflow-hidden">
              <div className="h-full bg-violet-500" style={{ width: `${missionPercent}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {props.missionCurrent}/{props.missionTarget} complete
            </p>
            <div className="mt-4 rounded-xl bg-orange-50 border border-orange-100 px-3 py-2.5">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Streak</p>
              <p className="text-base font-semibold text-orange-700 mt-0.5">{props.streakCount} days</p>
            </div>
          </div>
        )}

        {activeTab === "skills" && (
          <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm p-3 space-y-2">
            {props.skills.map((skill) => (
              <div key={skill.key} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-slate-700 truncate">{skill.label}</p>
                  <p className="text-[11px] text-slate-500">{skill.progress}%</p>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-[linear-gradient(90deg,#5a6cff_0%,#8b5cf6_100%)]"
                    style={{ width: `${Math.max(0, Math.min(100, skill.progress))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
