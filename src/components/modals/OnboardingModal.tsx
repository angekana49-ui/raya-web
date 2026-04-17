"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Loader2, Globe, ChevronDown, X } from "lucide-react";
import { NoTranslate } from "@/components/ui/NoTranslate";
import TurnstileWidget from "@/components/security/TurnstileWidget";
import { languages, changeLanguage } from "@/components/menus/LanguageMenu";
import { cn } from "@/lib/utils";

const SCHOOL_LEVELS: { group: string; levels: string[] }[] = [
  {
    group: "Middle school",
    levels: ["Grade 6", "Grade 7", "Grade 8", "Grade 9"],
  },
  {
    group: "High school",
    levels: ["Grade 10", "Grade 11", "Grade 12"],
  },
  {
    group: "University",
    levels: ["1st year", "2nd year", "3rd year", "Masters+"],
  },
  {
    group: "Other",
    levels: ["Primary", "Vocational", "Other"],
  },
];

interface OnboardingModalProps {
  visible: boolean;
  defaultName?: string;
  defaultUsername?: string;
  defaultSchoolLevel?: string;
  loading?: boolean;
  error?: string | null;
  turnstileSiteKey?: string;
  onComplete: (payload: {
    username: string;
    displayName: string;
    schoolLevel: string;
    captchaToken?: string;
  }) => void;
  onClose?: () => void;
  onOpenRecovery?: () => void;
}

export default function OnboardingModal({
  visible,
  defaultName = "",
  defaultUsername = "",
  defaultSchoolLevel = "",
  loading = false,
  error = null,
  turnstileSiteKey,
  onComplete,
  onClose,
  onOpenRecovery,
}: OnboardingModalProps) {
  const [displayName, setDisplayName] = useState(defaultName);
  const [username, setUsername] = useState(defaultUsername);
  const [selectedLevel, setSelectedLevel] = useState(defaultSchoolLevel);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState("en");

  useEffect(() => {
    // Basic way to check active language from cookies
    const match = document.cookie.match(/googtrans=\/[^/]+\/([^;]+)/);
    if (match) setCurrentLang(match[1]);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setDisplayName(defaultName);
    setUsername(defaultUsername);
    setSelectedLevel(defaultSchoolLevel);
    setCaptchaToken(null);
    setCaptchaError(null);
    setCaptchaResetKey((value) => value + 1);
  }, [defaultName, defaultSchoolLevel, defaultUsername, visible]);

  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    setCaptchaError(null);
  }, []);

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaError("Verification expired. Please try again.");
  }, []);

  const handleCaptchaError = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaError("Verification failed to load. Please refresh and try again.");
  }, []);

  const normalizedUsername = username.trim();
  const captchaRequired = Boolean(turnstileSiteKey);
  
  // Rules: Min 3 chars, 1 uppercase, 1 digit
  const hasUppercase = /[A-Z]/.test(normalizedUsername);
  const hasDigit = /\d/.test(normalizedUsername);
  const isLengthValid = normalizedUsername.length >= 3;

  const canSubmit =
    isLengthValid &&
    hasUppercase &&
    hasDigit &&
    selectedLevel !== "" &&
    (!captchaRequired || Boolean(captchaToken));

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmit || loading) return;
    if (captchaRequired && !captchaToken) {
      setCaptchaError("Please complete the verification first.");
      return;
    }
    onComplete({
      username: normalizedUsername,
      displayName: displayName.trim(),
      schoolLevel: selectedLevel,
      captchaToken: captchaToken ?? undefined,
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="zen-backdrop z-[70]"
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className="fixed z-[80] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-[440px] max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col"
          >
            <div className="bg-[linear-gradient(135deg,#2563eb_0%,#7c3aed_100%)] px-6 pt-6 pb-5 shrink-0 relative">
              {onClose && (
                <button
                  onClick={onClose}
                  className="absolute left-4 top-4 w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              )}
              <div className="absolute right-4 top-4">
                <div className="relative">
                  <button
                    onClick={() => setLangMenuOpen(!langMenuOpen)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/20"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold uppercase">{currentLang}</span>
                    <ChevronDown className={cn("w-3 h-3 transition-transform", langMenuOpen && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {langMenuOpen && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-0 z-0"
                          onClick={() => setLangMenuOpen(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute right-0 top-full mt-2 w-32 bg-white rounded-xl shadow-xl border border-slate-100 py-1 overflow-hidden z-10"
                        >
                          {languages.map((lang) => (
                            <button
                              key={lang.code}
                              onClick={() => {
                                changeLanguage(lang.code);
                                setLangMenuOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between",
                                currentLang === lang.code ? "text-indigo-600 font-bold" : "text-slate-600"
                              )}
                            >
                              <NoTranslate>
                                <span lang={lang.langTag} dir={lang.code === "ar" ? "rtl" : "ltr"}>
                                  {lang.nativeName}
                                </span>
                              </NoTranslate>
                              {currentLang === lang.code && <div className="w-1 h-1 rounded-full bg-indigo-600" />}
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className={cn("flex items-center gap-3 mb-1", onClose ? "mt-4" : "")}>
                <img src="/raya-logo.jpeg" alt="RAYA" className="w-8 h-8 rounded-lg object-cover" />
                <span className="text-lg font-bold text-white"><NoTranslate>RAYA</NoTranslate></span>
              </div>
              <h3 className="text-base font-bold text-white mt-1">Set up your student profile</h3>
              <p className="text-xs text-blue-100 mt-0.5">
                Pick a unique pseudo and your school level.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto min-h-0 bg-white">
              <div className="px-5 py-4 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Unique pseudo
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))}
                  placeholder="e.g. BeastLearner123"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-300 focus:bg-white transition-colors"
                />
                <div className="mt-2 space-y-1">
                  <p className={cn("text-[10px] flex items-center gap-1", isLengthValid ? "text-emerald-600" : "text-slate-400")}>
                    {isLengthValid ? "✓" : "○"} At least 3 characters
                  </p>
                  <p className={cn("text-[10px] flex items-center gap-1", hasUppercase ? "text-emerald-600" : "text-slate-400")}>
                    {hasUppercase ? "✓" : "○"} At least 1 uppercase letter
                  </p>
                  <p className={cn("text-[10px] flex items-center gap-1", hasDigit ? "text-emerald-600" : "text-slate-400")}>
                    {hasDigit ? "✓" : "○"} At least 1 digit
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Display name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-300 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                  School level
                </label>
                <div className="space-y-2">
                  {SCHOOL_LEVELS.map((group) => (
                    <div key={group.group}>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                        {group.group}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.levels.map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setSelectedLevel(level)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                              selectedLevel === level
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"
                            )}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {turnstileSiteKey && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Verification
                  </p>
                  <TurnstileWidget
                    siteKey={turnstileSiteKey}
                    resetKey={captchaResetKey}
                    onToken={handleCaptchaToken}
                    onExpire={handleCaptchaExpire}
                    onError={handleCaptchaError}
                  />
                </div>
              )}

              {captchaError && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {captchaError}
                </p>
              )}

              {error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              </div>
            </form>

            <div className="p-5 border-t border-slate-100 bg-slate-50/50 shrink-0 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || loading}
                className={cn(
                  "w-full h-11 rounded-xl bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] text-white font-bold text-sm shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2",
                  (!canSubmit || loading) && "opacity-50 grayscale cursor-not-allowed shadow-none"
                )}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                <NoTranslate>Start with RAYA</NoTranslate>
              </button>
              
              <button 
                onClick={onOpenRecovery}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors mt-1"
                type="button"
              >
                Sign up / Log in with Email or Recovery Key
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}