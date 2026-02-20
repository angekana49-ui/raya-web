# RAYA Web - Extraction Guide

A comprehensive guide documenting how the RAYA AI chat interface was extracted from a React Native mobile app and converted into a standalone Next.js web application.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Source Analysis](#source-analysis)
3. [Technology Stack Migration](#technology-stack-migration)
4. [Project Setup](#project-setup)
5. [Component Conversion](#component-conversion)
6. [File Structure](#file-structure)
7. [Key Adaptations](#key-adaptations)
8. [Challenges & Solutions](#challenges--solutions)
9. [Future Improvements](#future-improvements)

---

## Project Overview

### Original Project
- **Name:** BlueStift (React Native / Expo)
- **Feature Extracted:** RAYA AI Assistant
- **Purpose:** Educational AI chatbot for students

### New Project
- **Name:** RAYA Web
- **Framework:** Next.js 16 + TypeScript
- **Styling:** Tailwind CSS
- **Animations:** Framer Motion

---

## Source Analysis

### Step 1: Identify Core Files

The first step was to explore the React Native codebase and identify all files related to the AI functionality:

```
BlueStift/src/
├── screens/ai/
│   ├── AIScreen.tsx          # Main chat screen (446 lines)
│   └── LiveScreen.tsx        # Live features (stub)
├── components/ai/
│   ├── ChatInput/
│   │   ├── index.tsx         # Main input component
│   │   ├── ActionButton.tsx  # Send/Mic button
│   │   ├── AIOptionsButton.tsx
│   │   ├── FileButton.tsx
│   │   └── types.ts
│   ├── Menus/
│   │   ├── AIOptionsMenu.tsx
│   │   ├── FilePickerMenu.tsx
│   │   ├── ModelPickerMenu.tsx
│   │   └── types.ts
│   ├── MessageBubble.tsx
│   ├── EmptyState.tsx
│   ├── FileAttachment.tsx
│   ├── SidebarMenu.tsx
│   └── PromptsScreen.tsx
├── services/
│   └── aiModels.ts           # AI model configurations
└── utils/
    └── constants.ts          # Design system
```

### Step 2: Understand Dependencies

Key React Native specific dependencies identified:
- `react-native` core components
- `expo-image-picker`
- `expo-document-picker`
- `lucide-react-native`
- `react-native-safe-area-context`
- React Native's `Animated` API

### Step 3: Map Data Flow

```
AIScreen (State Management)
    ├── messages: Message[]
    ├── input: string
    ├── attachedFiles: AttachedFile[]
    ├── aiMode: string
    ├── selectedModel: string
    └── UI visibility states
```

---

## Technology Stack Migration

| React Native | Web Equivalent |
|--------------|----------------|
| `View` | `div` |
| `Text` | `span` / `p` |
| `TouchableOpacity` | `button` / `div` with `onClick` |
| `TextInput` | `textarea` / `input` |
| `ScrollView` | `div` with `overflow-y-auto` |
| `FlatList` | `map()` with scroll container |
| `Image` | `img` / Next.js `Image` |
| `StyleSheet.create()` | Tailwind CSS classes |
| `Animated` API | Framer Motion |
| `expo-image-picker` | `<input type="file">` |
| `expo-document-picker` | `<input type="file" accept="...">` |
| `lucide-react-native` | `lucide-react` |
| `SafeAreaView` | Standard `div` with padding |
| `Platform.select()` | CSS media queries / responsive classes |

---

## Project Setup

### Step 1: Initialize Next.js Project

```bash
npx create-next-app@latest raya-web --typescript --tailwind --eslint --app --src-dir
```

### Step 2: Install Dependencies

```bash
cd raya-web
npm install lucide-react framer-motion clsx
```

### Step 3: Configure Tailwind

Extended `tailwind.config.ts` with custom colors matching the original design system:

```typescript
// Primary color from BlueStift
colors: {
  primary: '#667eea',
  // ... other colors
}
```

### Step 4: Setup Font

Used Google Fonts via `<link>` tag instead of `next/font` (to avoid build issues):

```html
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
  rel="stylesheet"
/>
```

---

## Component Conversion

### 1. Types Definition (`src/types/index.ts`)

Created TypeScript interfaces matching the original:

```typescript
export interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  files?: AttachedFile[];
  timestamp?: Date;
}

export interface AttachedFile {
  id: string;
  name: string;
  type: "image" | "pdf" | "document" | "spreadsheet" | "other";
  url: string;
  size?: number;
}

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  date: Date;
  isActive?: boolean;
}

export interface AIModel {
  id: string;
  name: string;
  provider: "google" | "openai" | "anthropic";
  description: string;
  features: string[];
  maxTokens: number;
  costPerRequest?: number;
  isAvailable: boolean;
  isPremium?: boolean;
}

export interface ChatMode {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}
```

### 2. Utility Functions (`src/lib/utils.ts`)

```typescript
import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function getFileTypeFromName(filename: string): AttachedFile["type"] {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) return "image";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "txt"].includes(ext || "")) return "document";
  if (["xls", "xlsx"].includes(ext || "")) return "spreadsheet";
  return "other";
}

export function groupConversationsByDate(conversations: Conversation[]) {
  // Group by Today, Yesterday, This Week, etc.
}
```

### 3. MessageBubble Component

**Original (React Native):**
```tsx
<View style={[styles.bubble, isUser && styles.userBubble]}>
  <Text style={styles.messageText}>{message.text}</Text>
</View>
```

**Converted (React/Tailwind):**
```tsx
<div className={cn(
  "max-w-[80%] rounded-2xl px-4 py-3",
  isUser
    ? "bg-primary text-white ml-auto rounded-br-md"
    : "bg-white border border-gray-200 mr-auto rounded-bl-md"
)}>
  <p className="text-base whitespace-pre-wrap">{message.text}</p>
</div>
```

### 4. ChatInput Component

**Key Changes:**
- `TextInput` → `textarea` with auto-resize
- `onContentSizeChange` → manual height calculation via ref
- Touch handlers → Click handlers
- Platform-specific padding → Unified CSS

```tsx
// Auto-resize textarea
const adjustHeight = useCallback(() => {
  const textarea = textareaRef.current;
  if (textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }
}, []);
```

### 5. FilePickerMenu Component

**Original:** Used `expo-image-picker` and `expo-document-picker`

**Converted:** Uses native HTML file input

```tsx
const fileInputRef = useRef<HTMLInputElement>(null);

const handleOptionClick = (option) => {
  if (fileInputRef.current) {
    fileInputRef.current.accept = option.accept;
    if (option.capture) {
      fileInputRef.current.capture = option.capture;
    }
    fileInputRef.current.click();
  }
};

// Hidden input
<input
  ref={fileInputRef}
  type="file"
  className="hidden"
  onChange={handleFileChange}
/>
```

### 6. Sidebar Component

**Key Changes:**
- Slide animation: `Animated.View` → `motion.div` with `x` transform
- Fixed the "button inside button" hydration error by using `div` with `cursor-pointer`
- Added complete profile menu with all options

### 7. Animations

**Original (React Native Animated):**
```tsx
Animated.spring(slideAnim, {
  toValue: 0,
  tension: 100,
  friction: 8,
  useNativeDriver: true,
}).start();
```

**Converted (Framer Motion):**
```tsx
<motion.div
  initial={{ x: "-100%" }}
  animate={{ x: 0 }}
  exit={{ x: "-100%" }}
  transition={{ type: "spring", damping: 20, stiffness: 300 }}
>
```

---

## File Structure

Final web project structure:

```
raya-web/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Main chat page
│   │   └── globals.css
│   ├── components/
│   │   ├── chat/
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── FileAttachment.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── PromptsModal.tsx
│   │   ├── menus/
│   │   │   ├── AIOptionsMenu.tsx
│   │   │   ├── FilePickerMenu.tsx
│   │   │   ├── ModelPickerMenu.tsx
│   │   │   └── LanguageMenu.tsx
│   │   └── modals/
│   │       ├── PromoCodeModal.tsx
│   │       ├── SettingsModal.tsx
│   │       └── HelpModal.tsx
│   ├── lib/
│   │   ├── ai-models.ts
│   │   ├── constants.ts
│   │   └── utils.ts
│   └── types/
│       └── index.ts
├── public/
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Key Adaptations

### 1. Responsive Design

Added responsive breakpoints for desktop experience:

```tsx
className="fixed bottom-16 left-3 right-3 md:left-3 md:right-auto md:w-[280px]"
```

### 2. Keyboard Handling

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (canSend) onSend();
  }
};
```

### 3. File Handling

Web uses `URL.createObjectURL()` for file previews:

```tsx
const attachedFile: AttachedFile = {
  id: Date.now().toString(),
  name: file.name,
  type: getFileTypeFromName(file.name),
  url: URL.createObjectURL(file),
  size: file.size,
};
```

### 4. Hydration Error Fix

Changed nested `<button>` elements to `<div>` with click handlers:

```tsx
// Before (causes hydration error)
<button onClick={selectConversation}>
  <button onClick={deleteConversation}>Delete</button>
</button>

// After
<div onClick={selectConversation} className="cursor-pointer">
  <button onClick={(e) => { e.stopPropagation(); deleteConversation(); }}>
    Delete
  </button>
</div>
```

---

## Challenges & Solutions

### Challenge 1: Google Fonts Build Error
**Problem:** `next/font/google` failed during build due to network issues
**Solution:** Used traditional `<link>` tag in layout.tsx

### Challenge 2: Button Nesting Hydration Error
**Problem:** HTML doesn't allow `<button>` inside `<button>`
**Solution:** Replaced outer button with `<div>` using `cursor-pointer` class

### Challenge 3: File Type Detection
**Problem:** Web doesn't have native file type detection like Expo
**Solution:** Created utility function to detect type from filename extension

### Challenge 4: Camera Access
**Problem:** Mobile-style camera capture on web
**Solution:** Used `capture="environment"` attribute on file input (works on mobile browsers)

---

## Future Improvements

### Phase 1: API Integration
- [ ] Connect to actual AI APIs (OpenAI, Anthropic, Google)
- [ ] Implement streaming responses
- [ ] Add error handling and retry logic

### Phase 2: Authentication
- [ ] Add user authentication (NextAuth.js)
- [ ] Implement conversation persistence
- [ ] User preferences storage

### Phase 3: Features
- [ ] Voice input (Web Speech API)
- [ ] Export conversations
- [ ] Share functionality
- [ ] Dark mode

### Phase 4: Performance
- [ ] Implement virtual scrolling for long conversations
- [ ] Add service worker for offline support
- [ ] Optimize bundle size

---

## Commands Reference

```bash
# Development
npm run dev

# Build
npm run build

# Start production
npm start

# Lint
npm run lint
```

---

## Credits

- Original App: BlueStift React Native
- Extracted Feature: RAYA AI Assistant
- Conversion: React Native → Next.js + Tailwind + Framer Motion

---

*Document generated during extraction process - January 2026*
