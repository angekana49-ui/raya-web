"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown, Rocket, Sparkles, X } from "lucide-react";
import type { UserEntitlements } from "@/lib/user-entitlements";

interface PlansPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  entitlements: UserEntitlements;
}

const plans = [
  {
    id: "pro",
    name: "RAYA Pro",
    price: "$5",
    accent: "from-amber-400 via-orange-400 to-rose-400",
    icon: Crown,
    features: [
      "4x more context for deeper study sessions",
      "All AI modes unlocked",
      "Advanced models unlocked with sensible usage caps",
      "More image uploads and longer study room sessions",
      "XP booster x2 and Pro badge",
    ],
  },
  {
    id: "plus",
    name: "RAYA Plus",
    price: "$9",
    accent: "from-sky-400 via-cyan-400 to-emerald-400",
    icon: Rocket,
    features: [
      "Everything in Pro",
      "Video generation when launched",
      "Near-unlimited context feel for long projects",
      "XP booster x3 and Plus badge",
      "Highest room and creative limits",
    ],
  },
];

export default function PlansPreviewModal({ isOpen, onClose, entitlements }: PlansPreviewModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="zen-backdrop z-[60]"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,#fef3c7,transparent_35%),radial-gradient(circle_at_top_right,#bfdbfe,transparent_30%),white] px-6 py-5">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Power Plans</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">Pick the RAYA tier built for your pace</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                    These plans define the next step up in context, creation, and study stamina so the value feels clear before billing opens.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-4 p-6 md:grid-cols-2">
                {plans.map((plan) => {
                  const Icon = plan.icon;
                  const isCurrent = entitlements.planTier === plan.id;

                  return (
                    <div
                      key={plan.id}
                      className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-5"
                    >
                      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${plan.accent}`} />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`rounded-2xl bg-gradient-to-br ${plan.accent} p-3 text-white shadow-sm`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-lg font-black text-slate-900">{plan.name}</p>
                            <p className="text-sm font-semibold text-slate-500">{plan.price} / month</p>
                          </div>
                        </div>
                        {isCurrent && (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                            Current
                          </span>
                        )}
                      </div>

                      <ul className="mt-5 space-y-2">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Best For</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {plan.id === "pro"
                            ? "Students who want stronger daily performance without going all the way."
                            : "Students building longer, more creative projects and wanting maximum room to think."}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
