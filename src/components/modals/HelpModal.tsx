"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  HelpCircle,
  Sparkles,
  AlertCircle,
  MessageCircle,
  Clock,
  CreditCard,
  Building2,
  Mail,
  Phone,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { NoTranslate } from "@/components/ui/NoTranslate";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FAQItem {
  question: React.ReactNode;
  answer: React.ReactNode[];
  icon: React.ReactNode;
}

const faqItems: FAQItem[] = [
  {
    question: <>How does <NoTranslate>RAYA</NoTranslate> work?</>,
    icon: <Sparkles className="w-5 h-5 text-primary" />,
    answer: [
      <><NoTranslate>RAYA</NoTranslate> is your intelligent study assistant, designed to support you in your learning journey.</>,
      "You can ask questions about your courses, request explanations on difficult concepts, or get help with your exercises.",
      <><NoTranslate>RAYA</NoTranslate> adapts to your level and guides you step by step towards understanding, rather than simply giving ready-made answers.</>,
    ],
  },
  {
    question: "Why are some features unavailable?",
    icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
    answer: [
      "Some features are still in testing phase and have been temporarily disabled to ensure the best possible experience.",
      "Others are currently under development and will be available in upcoming updates.",
      "We are actively working to bring you all these features very soon!",
    ],
  },
  {
    question: <>Why doesn&apos;t <NoTranslate>RAYA</NoTranslate> give me direct answers?</>,
    icon: <MessageCircle className="w-5 h-5 text-blue-500" />,
    answer: [
      <><NoTranslate>RAYA</NoTranslate> was designed as a true learning coach, not just an answer generator.</>,
      "Its goal is to help you understand and remember, not just produce work to copy-paste.",
      "It guides you with a structured approach to develop your thinking and strengthen your learning.",
      "Its tone may vary depending on the situation: encouraging, motivating, or slightly challenging, while remaining supportive.",
    ],
  },
  {
    question: "Why is there a daily usage limit?",
    icon: <Clock className="w-5 h-5 text-purple-500" />,
    answer: [
      "We are currently in launch phase and our resources are limited.",
      "These limits allow us to ensure fair access for all users and maintain service quality.",
      <>We are actively working on solutions to increase these limits and deploy the full power of <NoTranslate>RAYA</NoTranslate>.</>,
    ],
  },
  {
    question: "How to upgrade to a higher plan?",
    icon: <CreditCard className="w-5 h-5 text-emerald-500" />,
    answer: [
      "Premium subscriptions will unlock higher or unlimited usage limits.",
      "You will also have access to advanced features: deep learning, creative mode, extended file generation, AI model choice, etc.",
      "Plans are not yet available, but we are working to make them accessible very soon.",
      "Important: As our platform is mainly used by minor students, we recommend parents/guardians supervise and validate any payment.",
    ],
  },
  {
    question: <><NoTranslate>RAYA</NoTranslate> for educational institutions</>,
    icon: <Building2 className="w-5 h-5 text-indigo-500" />,
    answer: [
      <><NoTranslate>RAYA</NoTranslate> offers educational institutions the ability to track the progress of each class.</>,
      "Get detailed analysis of gaps, needs and strengths of your students, with personalized suggestions.",
      "Data protection guaranteed: all information is anonymized and aggregated by subject and class.",
      "Only relevant and impersonal data is shared, ensuring total confidentiality for each student.",
    ],
  },
];

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const handleToggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
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
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-primary/5 to-blue-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <HelpCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Help Center</h2>
                    <p className="text-xs text-gray-500">Frequently asked questions</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/80 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {faqItems.map((item, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleFaq(index)}
                      className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-100/70 transition-colors"
                    >
                      <div className="flex-shrink-0 mt-0.5">{item.icon}</div>
                      <h3 className="flex-1 text-sm font-bold text-gray-900 leading-tight">
                        {item.question}
                      </h3>
                      <div className="flex-shrink-0 text-gray-500 mt-0.5">
                        {openFaqIndex === index ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {openFaqIndex === index && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-11 pr-4 pb-4 space-y-2">
                            {item.answer.map((paragraph, pIndex) => (
                              <p key={pIndex} className="text-sm text-gray-600 leading-relaxed">
                                {paragraph}
                              </p>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}

                {/* Contact Section */}
                <div className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-sm font-semibold text-gray-900 mb-3">
                    Your question is not in the list?
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    Contact us, we are here to help!
                  </p>

                  <div className="space-y-2">
                    <a
                      href="mailto:Info@Thebluestift.com"
                      className="flex items-center gap-3 p-3 bg-white rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <Mail className="w-4 h-4 text-primary" />
                      <span className="text-sm text-gray-700 group-hover:text-primary transition-colors">
                        <NoTranslate>Info@Thebluestift.com</NoTranslate>
                      </span>
                      <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
                    </a>

                    <a
                      href="mailto:Russel@Thebluestift.com"
                      className="flex items-center gap-3 p-3 bg-white rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <Mail className="w-4 h-4 text-primary" />
                      <span className="text-sm text-gray-700 group-hover:text-primary transition-colors">
                        <NoTranslate>Russel@Thebluestift.com</NoTranslate>
                      </span>
                      <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
                    </a>

                    <a
                      href="https://wa.me/YOUR_WHATSAPP_NUMBER"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-white rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <Phone className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-gray-700 group-hover:text-green-600 transition-colors">
                        WhatsApp
                      </span>
                      <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
                    </a>
                  </div>

                  {/* Social Links */}
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-primary/10">
                    <span className="text-xs text-gray-500">Follow us:</span>
                    <a
                      href="https://linkedin.com/company/thebluestift"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-blue-50 transition-colors"
                    >
                      <svg className="w-4 h-4 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                    <a
                      href="https://instagram.com/thebluestift"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-pink-50 transition-colors"
                    >
                      <svg className="w-4 h-4 text-[#E4405F]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
