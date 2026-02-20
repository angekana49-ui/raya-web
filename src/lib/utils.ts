import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function groupConversationsByDate<T extends { date: Date }>(
  items: T[]
): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  const today: T[] = [];
  const yesterday: T[] = [];
  const lastWeek: T[] = [];
  const older: T[] = [];

  items.forEach((item) => {
    const diffDays = Math.floor(
      (new Date().getTime() - item.date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) today.push(item);
    else if (diffDays === 1) yesterday.push(item);
    else if (diffDays < 7) lastWeek.push(item);
    else older.push(item);
  });

  if (today.length > 0) groups.push({ label: "Today", items: today });
  if (yesterday.length > 0) groups.push({ label: "Yesterday", items: yesterday });
  if (lastWeek.length > 0) groups.push({ label: "Last 7 days", items: lastWeek });
  if (older.length > 0) groups.push({ label: "Older", items: older });

  return groups;
}

export function getFileTypeFromName(filename: string): "image" | "pdf" | "document" | "spreadsheet" | "other" {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "")) {
    return "image";
  }
  if (ext === "pdf") {
    return "pdf";
  }
  if (["doc", "docx", "txt", "rtf", "odt"].includes(ext || "")) {
    return "document";
  }
  if (["xls", "xlsx", "csv"].includes(ext || "")) {
    return "spreadsheet";
  }
  return "other";
}
