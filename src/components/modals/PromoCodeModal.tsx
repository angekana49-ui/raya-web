"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Gift, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { normalizeUserEntitlements, type UserEntitlements } from "@/lib/user-entitlements";

interface PromoCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: (entitlements: UserEntitlements) => void;
}

export default function PromoCodeModal({ isOpen, onClose, onApplied }: PromoCodeModalProps) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsLoading(true);
    setMessage("");

    const { data, error } = await supabase.rpc("redeem_level_up_code", {
      p_code: code.trim().toUpperCase(),
    });

    if (error) {
      setStatus("error");
      setMessage(error.message || "Invalid or expired Level Up Code");
      setIsLoading(false);
      return;
    }

    const payload = (data && typeof data === "object") ? data as {
      redeemed?: boolean;
      alreadyRedeemed?: boolean;
      message?: string;
      entitlements?: unknown;
    } : null;

    if (payload?.redeemed || payload?.alreadyRedeemed) {
      setStatus("success");
      setMessage(payload?.message || "Level Up Code applied successfully!");
      if (payload?.entitlements) {
        onApplied?.(normalizeUserEntitlements(payload.entitlements));
      }
    } else {
      setStatus("error");
      setMessage(payload?.message || "Invalid or expired Level Up Code");
    }

    setIsLoading(false);
  };

  const handleClose = () => {
    setCode("");
    setStatus("idle");
    setMessage("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="zen-backdrop z-[60]"
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            onClick={handleClose}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Level Up Code</h2>
                </div>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-5">
                <div className="bg-blue-50 rounded-xl p-4 mb-5">
                  <p className="text-sm text-blue-800 leading-relaxed">
                    <span className="font-semibold">If you got a Level Up Code, enter it here to unlock a few extra perks.</span>
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-blue-700">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">-</span>
                      <span>
                        <strong>Rush Mode</strong> unlocked in the app right away
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">-</span>
                      <span>
                        <strong>Creative Mode + bigger limits</strong> after email verification
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">-</span>
                      <span>
                        <strong>50% off</strong> the first subscription
                      </span>
                    </li>
                  </ul>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label htmlFor="promo-code" className="block text-sm font-medium text-gray-700 mb-2">
                      Enter your Level Up Code
                    </label>
                    <input
                      id="promo-code"
                      type="text"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        setStatus("idle");
                      }}
                      placeholder="E.g.: RAYA2024" // Keep fixed to avoid auto-translation drift.
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                      disabled={isLoading || status === "success"}
                    />
                  </div>

                  <AnimatePresence mode="wait">
                    {status === "success" && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 p-3 bg-green-50 rounded-xl mb-4"
                      >
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm text-green-700 font-medium">
                          {message || "Level Up Code applied successfully!"}
                        </span>
                      </motion.div>
                    )}

                    {status === "error" && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 p-3 bg-red-50 rounded-xl mb-4"
                      >
                        <AlertCircle className="w-5 h-5 text-red-500" />
                        <span className="text-sm text-red-700 font-medium">
                          {message || "Invalid or expired Level Up Code"}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={!code.trim() || isLoading || status === "success"}
                    className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                        />
                        <span>Validating...</span>
                      </>
                    ) : status === "success" ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        <span>Code applied</span>
                      </>
                    ) : (
                      <span>Apply code</span>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
