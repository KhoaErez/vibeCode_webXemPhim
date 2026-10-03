import { createClient } from './supabase/client';

export async function createWatchRoom(hostId: string, movie: { slug: string; name: string }) {
  const supabase = createClient();
  
  // Generate a random 6-character room code
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  const { data, error } = await supabase
    .from('watch_rooms')
    .insert({
      room_code: roomCode,
      host_id: hostId,
      movie_slug: movie.slug,
      movie_name: movie.name,
      status: 'active'
    })
    .select()
    .single();
    
  if (error) throw error;
  
  // Join the host to the room members
  await supabase
    .from('watch_room_members')
    .insert({
      room_id: data.id,
      user_id: hostId
    });
    
  return data;
}

export async function joinWatchRoom(userId: string, roomCode: string) {
  const supabase = createClient();
  
  // Find room
  const { data: room, error: roomError } = await supabase
    .from('watch_rooms')
    .select('*')
    .eq('room_code', roomCode)
    .eq('status', 'active')
    .single();
    
  if (roomError || !room) {
    throw new Error('Phòng không tồn tại hoặc đã đóng!');
  }
  
  // Add to members (use upsert or handle unique constraint)
  const { error: memberError } = await supabase
    .from('watch_room_members')
    .upsert({
      room_id: room.id,
      user_id: userId
    }, { onConflict: 'room_id,user_id' });
    
  if (memberError) {
    console.error(memberError);
    // Ignore error if already joined
  }
  
  return room;
}
