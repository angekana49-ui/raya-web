"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Gift, CheckCircle, AlertCircle } from "lucide-react";

interface PromoCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PromoCodeModal({ isOpen, onClose }: PromoCodeModalProps) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsLoading(true);
    // Simulation de validation du code
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Pour la démo, on accepte le code "RAYA2024"
    if (code.toUpperCase() === "RAYA2024") {
      setStatus("success");
    } else {
      setStatus("error");
    }
    setIsLoading(false);
  };

  const handleClose = () => {
    setCode("");
    setStatus("idle");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={handleClose}
          />

          {/* Modal */}
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
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Promo Code</h2>
                </div>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5">
                {/* Info box */}
                <div className="bg-blue-50 rounded-xl p-4 mb-5">
                  <p className="text-sm text-blue-800 leading-relaxed">
                    <span className="font-semibold">Promo code benefits:</span>
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm text-blue-700">
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span><strong>Annual subscription:</strong> 1 month free</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span><strong>Monthly subscription:</strong> 1 week free</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span><strong>Free plan:</strong> 2 weeks free</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span><strong>For everyone:</strong> 15% off first subscription</span>
                    </li>
                  </ul>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label htmlFor="promo-code" className="block text-sm font-medium text-gray-700 mb-2">
                      Enter your promo code
                    </label>
                    <input
                      id="promo-code"
                      type="text"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        setStatus("idle");
                      }}
                      placeholder="E.g.: RAYA2024" // Note: placeholder is not translated by Google Translate
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                      disabled={isLoading || status === "success"}
                    />
                  </div>

                  {/* Status messages */}
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
                          Promo code applied successfully!
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
                          Invalid or expired promo code
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit button */}
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
