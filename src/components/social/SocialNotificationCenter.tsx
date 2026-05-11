"use client";

import { useEffect } from "react";
import * as socialService from "@/services/social.service";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";
import { useNotificationStore } from "@/store/useNotificationStore";

export default function SocialNotificationCenter() {
  const { user } = useAuth();
  const addNotification = useNotificationStore(s => s.addNotification);

  function playNotificationSound() {
    try {
      const audio = new Audio("/sounds/pop.mp3");
      audio.volume = 0.4;
      audio.play().catch(() => {});
    } catch {}
  }

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const pushNotification = async (notification: {
      id: string;
      type: string;
      sender_id: string;
      payload?: Record<string, unknown>;
    }) => {
      const { data: sender } = await supabase
        .from('users')
        .select('id, display_name, username, profile_picture_url')
        .eq('id', notification.sender_id)
        .single();

      if (cancelled) return;

      addNotification({
        type: notification.type as 'friend_request' | 'room_invite',
        title: notification.type === 'friend_request' ? "Squad Invitation" : "Room Invitation",
        sub: notification.type === 'friend_request' ? "wants to join your squad" : "invited you to a session",
        sender: sender,
        payload: {
          notificationId: notification.id,
          senderId: notification.sender_id,
          roomId: notification.payload?.roomId,
          roomName: notification.payload?.roomName,
        },
        duration: null,
      });

      playNotificationSound();
    };

    void socialService.getNotifications().then((notifications) => {
      if (cancelled) return;
      notifications.slice().reverse().forEach((notification) => {
        void pushNotification(notification);
      });
    });

    // Real-time subscription
    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        async (payload) => {
          await pushNotification(payload.new as any);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, addNotification]);

  

  return null; // Logic only
}
