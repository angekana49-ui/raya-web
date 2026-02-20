// Design System RAYA Web - Basé sur Bluestift

export const COLORS = {
  // Palette principale
  primary: "#667eea",
  primaryDark: "#764ba2",
  primaryLight: "#eff6ff",
  primaryHover: "#5a6fd6",

  // Accents fonctionnels
  secondary: "#2563eb",
  success: "#10b981",
  successDark: "#059669",
  warning: "#f59e0b",
  warningLight: "#fbbf24",
  danger: "#ef4444",
  dangerDark: "#dc2626",
  info: "#3b82f6",
  infoDark: "#1e40af",

  // Neutrals (Light theme)
  background: "#f9fafb",
  surface: "#ffffff",
  surfaceSecondary: "#f3f4f6",
  text: "#1a1a1a",
  textSecondary: "#666666",
  textTertiary: "#999999",
  border: "#e5e7eb",
  borderLight: "#f3f4f6",

  // Dark theme
  darkBg: "#0f0f0f",
  darkSurface: "#1a1a1a",
  darkSurfaceSecondary: "#2a2a2a",
  darkText: "#f0f0f0",
  darkTextSecondary: "#d0d0d0",
  darkBorder: "#333333",

  // States
  disabled: "#9ca3af",
  hover: "#f9fafb",
  active: "#f3f4f6",
  focus: "#2563eb",

  // Transparent
  transparent: "transparent",
  overlay: "rgba(0, 0, 0, 0.6)",
  overlayLight: "rgba(0, 0, 0, 0.3)",
} as const;

export const GRADIENTS = {
  primary: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  success: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  warning: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  danger: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
} as const;

export const RAYA_CONFIG = {
  name: "RAYA",
  tagline: "Ton assistant IA personnel",
  systemPrompt: `Tu es RAYA, l'assistant IA de Bluestift.
Tu aides les utilisateurs à apprendre, créer du contenu éducatif, et progresser.
Sois encourageant, pédagogue, et précis. Adapte ton langage au niveau de l'utilisateur.`,
  maxTokens: 2048,
  temperature: 0.7,
} as const;
