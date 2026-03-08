"use client";

import { Flame, Target, Sparkles } from "lucide-react";

interface SkillItem {
  key: string;
  label: string;
  progress: number;
}

interface LearningHudProps {
  xpToday: number;
  streakCount: number;
  missionTitle: string;
  missionCurrent: number;
  missionTarget: number;
  skills: SkillItem[];
  className?: string;
}

export default function LearningHud(props: LearningHudProps) {
  const missionPercent = Math.max(
    0,
    Math.min(100, Math.round((props.missionCurrent / Math.max(1, props.missionTarget)) * 100))
  );

  return (
    <section className={props.className}>
      <div className="rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur-sm shadow-sm p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
          <div className="rounded-xl bg-indigo-50/70 border border-indigo-100 px-3 py-2.5">
            <p className="text-[11px] text-slate-500 uppercase tracking-wide">Today XP</p>
            <p className="text-lg font-semibold text-indigo-700 mt-0.5">{props.xpToday}</p>
          </div>

          <div className="rounded-xl bg-orange-50/70 border border-orange-100 px-3 py-2.5">
            <p className="text-[11px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Flame className="w-3 h-3 text-orange-500" />
              Streak
            </p>
            <p className="text-lg font-semibold text-orange-700 mt-0.5">{props.streakCount} days</p>
          </div>

          <div className="rounded-xl bg-violet-50/70 border border-violet-100 px-3 py-2.5">
            <p className="text-[11px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Target className="w-3 h-3 text-violet-600" />
              Daily Mission
            </p>
            <p className="text-sm font-medium text-slate-800 mt-0.5 truncate">{props.missionTitle}</p>
            <div className="mt-2 h-1.5 rounded-full bg-violet-100 overflow-hidden">
              <div className="h-full bg-violet-500" style={{ width: `${missionPercent}%` }} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {props.missionCurrent}/{props.missionTarget} complete
            </p>
          </div>
        </div>

        <p className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Skill Progress
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {props.skills.map((skill) => (
            <div key={skill.key} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5">
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
      </div>
    </section>
  );
}
