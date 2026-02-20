"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Check } from "lucide-react";

interface Language {
  code: string;
  name: string;
  flag: string;
}

const languages: Language[] = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "zh-CN", name: "中文", flag: "🇨🇳" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "es", name: "Español", flag: "🇪🇸" },
];

interface LanguageMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

// Fonction pour changer la langue via Google Translate
function changeLanguage(langCode: string) {
  // Vérifie si le widget Google Translate est chargé
  const selectElement = document.querySelector(".goog-te-combo") as HTMLSelectElement;
  if (selectElement) {
    selectElement.value = langCode;
    selectElement.dispatchEvent(new Event("change"));
  } else {
    // Si le widget n'est pas encore chargé, on stocke la préférence
    localStorage.setItem("preferredLanguage", langCode);
    // On essaie via le cookie Google Translate
    document.cookie = `googtrans=/en/${langCode}; path=/`;
    document.cookie = `googtrans=/en/${langCode}; path=/; domain=${window.location.hostname}`;
    window.location.reload();
  }
}

// Fonction pour obtenir la langue actuelle
function getCurrentLanguage(): string {
  const match = document.cookie.match(/googtrans=\/[^/]+\/([^;]+)/);
  if (match) return match[1];
  return localStorage.getItem("preferredLanguage") || "en";
}

export default function LanguageMenu({ isOpen, onClose }: LanguageMenuProps) {
  const currentLang = getCurrentLanguage();

  const handleLanguageSelect = (langCode: string) => {
    changeLanguage(langCode);
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
            className="fixed inset-0 z-[55]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-[56]"
          >
          {/* Header */}
          <div
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-900">Language</span>
          </div>

          {/* Language list */}
          <div className="py-1 max-h-[280px] overflow-y-auto">
            {languages.map((lang) => (
              <div
                key={lang.code}
                onClick={() => handleLanguageSelect(lang.code)}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{lang.flag}</span>
                  <span className="text-sm text-gray-700">{lang.name}</span>
                </div>
                {currentLang === lang.code && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </div>
            ))}
          </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Composant à ajouter dans le layout pour charger Google Translate
export function GoogleTranslateScript() {
  useEffect(() => {
    // Évite le double chargement
    if (document.getElementById("google-translate-script")) return;

    // Injecte les styles pour masquer la barre Google Translate
    if (!document.getElementById("google-translate-styles")) {
      const style = document.createElement("style");
      style.id = "google-translate-styles";
      style.textContent = `
        /* Masque la barre horizontale Google Translate */
        .goog-te-banner-frame,
        .skiptranslate,
        #goog-gt-tt,
        .goog-te-balloon-frame,
        div#goog-gt-,
        .goog-text-highlight {
          display: none !important;
        }

        /* Supprime le padding/margin ajouté au body */
        body {
          top: 0 !important;
          position: static !important;
        }

        /* Masque l'iframe de la barre */
        .goog-te-banner-frame.skiptranslate {
          display: none !important;
        }

        /* Corrige le décalage du body */
        body > .skiptranslate {
          display: none !important;
        }

        /* Masque le widget visible */
        #google_translate_element {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Définit la fonction de callback
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

    // Charge le script Google Translate
    const script = document.createElement("script");
    script.id = "google-translate-script";
    script.src =
      "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.body.appendChild(script);

    // Observer pour supprimer la barre si elle réapparaît
    const observer = new MutationObserver(() => {
      const banner = document.querySelector(".goog-te-banner-frame") as HTMLElement;
      if (banner) {
        banner.style.display = "none";
      }
      // Corrige le top du body
      document.body.style.top = "0px";
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"]
    });

    return () => {
      observer.disconnect();
      // Cleanup
      const existingScript = document.getElementById("google-translate-script");
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  return <div id="google_translate_element" className="hidden" />;
}
