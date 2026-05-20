"use client";

import { create } from "zustand";

export type NotificationType = "xp" | "mission" | "badge" | "level_up" | "friend_request" | "room_invite";

export interface GlobalNotification {
  id: string;
  type: NotificationType;
  title: string;
  sub?: string;
  payload?: any;
  sender?: any;
  duration?: number | null; // ms
}

interface NotificationStore {
  notifications: GlobalNotification[];
  addNotification: (notif: Omit<GlobalNotification, "id">) => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (notif) => {
    const id = Math.random().toString(36).substring(7);
    const newNotif = { ...notif, id };
    
    set((state) => ({
      notifications: [...state.notifications, newNotif],
    }));

    // Auto-dismiss logic
    const duration = notif.duration ?? (notif.type === 'xp' ? 3000 : 8000);
    if (duration !== null) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, duration);
    }
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
