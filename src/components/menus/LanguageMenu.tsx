"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Check } from "lucide-react";

interface Language {
  code: string;
  name: string;
  shortLabel: string;
}

const languages: Language[] = [
  { code: "en", name: "English", shortLabel: "EN" },
  { code: "fr", name: "French", shortLabel: "FR" },
  { code: "de", name: "German", shortLabel: "DE" },
  { code: "ar", name: "Arabic", shortLabel: "AR" },
  { code: "zh-CN", name: "Chinese", shortLabel: "ZH" },
  { code: "ru", name: "Russian", shortLabel: "RU" },
  { code: "pt", name: "Portuguese", shortLabel: "PT" },
  { code: "es", name: "Spanish", shortLabel: "ES" },
];

interface LanguageMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

// Change language via Google Translate.
function changeLanguage(langCode: string) {
  const selectElement = document.querySelector(".goog-te-combo") as HTMLSelectElement | null;

  if (selectElement) {
    selectElement.value = langCode;
    selectElement.dispatchEvent(new Event("change"));
    return;
  }

  localStorage.setItem("preferredLanguage", langCode);
  document.cookie = `googtrans=/en/${langCode}; path=/`;
  document.cookie = `googtrans=/en/${langCode}; path=/; domain=${window.location.hostname}`;
  window.location.reload();
}

// Read the active language from cookie/local storage.
function getCurrentLanguage(): string {
  if (typeof document === "undefined") return "en";

  const match = document.cookie.match(/googtrans=\/[^/]+\/([^;]+)/);
  if (match) return match[1];
  if (typeof localStorage === "undefined") return "en";
  return localStorage.getItem("preferredLanguage") || "en";
}

export default function LanguageMenu({ isOpen, onClose }: LanguageMenuProps) {
  const [currentLang, setCurrentLang] = useState("en");

  useEffect(() => {
    setCurrentLang(getCurrentLanguage());
  }, [isOpen]);

  const handleLanguageSelect = (langCode: string) => {
    changeLanguage(langCode);
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
            className="fixed inset-0 z-[55]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-[56]"
          >
            <div
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900">Language</span>
            </div>

            <div className="py-1 max-h-[280px] overflow-y-auto">
              {languages.map((lang) => (
                <div
                  key={lang.code}
                  onClick={() => handleLanguageSelect(lang.code)}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                      {lang.shortLabel}
                    </span>
                    <span className="text-sm text-gray-700">{lang.name}</span>
                  </div>
                  {currentLang === lang.code && <Check className="w-4 h-4 text-primary" />}
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Add this component in layout to load Google Translate once.
export function GoogleTranslateScript() {
  useEffect(() => {
    if (document.getElementById("google-translate-script")) return;

    if (!document.getElementById("google-translate-styles")) {
      const style = document.createElement("style");
      style.id = "google-translate-styles";
      style.textContent = `
        .goog-te-banner-frame,
        #goog-gt-tt,
        .goog-te-balloon-frame,
        div#goog-gt-,
        .goog-text-highlight {
          display: none !important;
        }

        body {
          top: 0 !important;
          position: static !important;
        }

        .goog-te-banner-frame.skiptranslate,
        body > .skiptranslate {
          display: none !important;
        }

        #google_translate_element {
          display: none !important;
        }

        /*
         * msg-body visibility is enforced in globals.css (static stylesheet).
         * Inline-style overrides are handled by the MutationObserver below.
         */
      `;
      document.head.appendChild(style);
    }

    (window as any).googleTranslateElementInit = function () {
      new (window as any).google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "en,fr,de,ar,zh-CN,ru,pt,es",
          autoDisplay: false,
        },
        "google_translate_element"
      );
    };

    const script = document.createElement("script");
    script.id = "google-translate-script";
    script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.body.appendChild(script);

    // Flag prevents the observer from looping when we ourselves change inline styles.
    let isFixing = false;

    const observer = new MutationObserver(() => {
      // Hide GT banner / reset body offset
      const banner = document.querySelector(".goog-te-banner-frame") as HTMLElement | null;
      if (banner) banner.style.display = "none";
      document.body.style.top = "0px";

      // Restore any msg-body element that GT hid via inline style.
      // Guard against re-entrant loops triggered by our own removeProperty calls.
      if (isFixing) return;
      const msgBodies = document.querySelectorAll<HTMLElement>(".msg-body");
      let fixed = false;
      msgBodies.forEach((el) => {
        if (el.style.display === "none" || el.style.visibility === "hidden") {
          el.style.removeProperty("display");
          el.style.removeProperty("visibility");
          fixed = true;
        }
      });
      if (fixed) {
        isFixing = true;
        requestAnimationFrame(() => { isFixing = false; });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    return () => {
      observer.disconnect();
      const existingScript = document.getElementById("google-translate-script");
      if (existingScript) existingScript.remove();
    };
  }, []);

  return <div id="google_translate_element" className="hidden" />;
}
