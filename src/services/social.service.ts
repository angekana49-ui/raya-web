import { supabase } from '@/lib/supabase/client';

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';
export type SocialNotificationType = 'friend_request' | 'room_invite';

export type UserProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  profile_picture_url: string | null;
};

export type SocialNotification = {
  id: string;
  sender_id: string;
  type: SocialNotificationType;
  payload: any;
  is_read: boolean;
  created_at: string;
  sender?: UserProfile;
};

export async function getDbUserId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_db_user_id');
  if (error || !data) return null;
  return data as string;
}

export async function searchUsers(query: string): Promise<UserProfile[]> {
  const userId = await getDbUserId();
  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, username, profile_picture_url')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .neq('id', userId || '')
    .limit(10);

  if (error) {
    console.error('Search failed:', error);
    return [];
  }
  return data as UserProfile[];
}

export async function sendFriendRequest(friendId: string) {
  const userId = await getDbUserId();
  if (!userId) throw new Error('Not authenticated');

  // Insert friendship record
  const { error: friendError } = await supabase
    .from('friendships')
    .upsert({ user_id: userId, friend_id: friendId, status: 'pending' }, { onConflict: 'user_id, friend_id' });

  if (friendError) throw friendError;

  // Create notification for the friend
  const { error: notifError } = await supabase
    .from('notifications')
    .insert({
      user_id: friendId,
      sender_id: userId,
      type: 'friend_request',
      payload: {}
    });

  if (notifError) throw notifError;
}

export async function acceptFriendRequest(senderId: string) {
  const userId = await getDbUserId();
  if (!userId) throw new Error('Not authenticated');

  // Update friendship record
  const { error: friendError } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('user_id', senderId)
    .eq('friend_id', userId);

  if (friendError) throw friendError;

  // Mark notification as read
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('sender_id', senderId)
    .eq('type', 'friend_request');
}

export async function getFriends(): Promise<UserProfile[]> {
  const userId = await getDbUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('friendships')
    .select(`
      user_id,
      friend_id,
      users:friend_id(id, display_name, username, profile_picture_url),
      friend:user_id(id, display_name, username, profile_picture_url)
    `)
    .eq('status', 'accepted')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  if (error) {
    console.error('Get friends failed:', error);
    return [];
  }

  // Deduplicate and filter out own ID
  const friends = data.map((row: any) =>
    row.user_id === userId ? row.users : row.friend
  ).filter(Boolean);

  return friends;
}

export async function sendRoomInvite(friendId: string, roomId: string, roomName: string) {
  const userId = await getDbUserId();
  if (!userId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: friendId,
      sender_id: userId,
      type: 'room_invite',
      payload: { roomId, roomName }
    });

  if (error) throw error;
}

export async function getNotifications(): Promise<SocialNotification[]> {
  const userId = await getDbUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select(`
      *,
      sender:sender_id(id, display_name, username, profile_picture_url)
    `)
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Get notifications failed:', error);
    return [];
  }
  return data as any as SocialNotification[];
}

export async function markNotificationRead(notifId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notifId);

  if (error) throw error;
}

export async function getFriendshipStatuses(friendIds: string[]): Promise<Record<string, FriendshipStatus>> {
  const userId = await getDbUserId();
  if (!userId || friendIds.length === 0) return {};

  const { data, error } = await supabase
    .from('friendships')
    .select('user_id, friend_id, status')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .in('user_id', [userId, ...friendIds])
    .in('friend_id', [userId, ...friendIds]);

  if (error) return {};

  const statusMap: Record<string, FriendshipStatus> = {};
  data.forEach((row: any) => {
    const friendId = row.user_id === userId ? row.friend_id : row.user_id;
    statusMap[friendId] = row.status as FriendshipStatus;
  });
  return statusMap;
}
