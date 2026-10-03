import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import Hls from 'hls.js';

export type Room = {
  id: string;
  room_code: string;
  host_id: string;
  movie_slug: string;
  movie_name: string;
  status: string;
  [key: string]: unknown;
};

type WatchRoomViewProps = {
  room: Room;
  user: import('@supabase/supabase-js').User;
  onLeave: () => void;
};

const SyncHlsPlayer = ({ src, room, isHost, supabase }: { src: string, room: Room, isHost: boolean, supabase: import('@supabase/supabase-js').SupabaseClient }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<{ height: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const lastToggleTime = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ maxMaxBufferLength: 100 });
      hlsRef.current = hls;
      
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        setLevels(data.levels);
        
        const savedQuality = localStorage.getItem('preferred_quality');
        if (savedQuality && savedQuality !== 'auto') {
          const targetHeight = parseInt(savedQuality);
          const index = data.levels.findIndex((l: { height: number }) => l.height === targetHeight);
          if (index !== -1) {
            hls.currentLevel = index;
            setCurrentLevel(index);
          }
        }
        
        if (isHost) video.play().catch(e => console.log("Play failed", e));
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        if (isHost) video.play().catch(e => console.log("Play failed", e));
      });
    }
    return () => { if (hlsRef.current) hlsRef.current.destroy(); };
  }, [src, isHost]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHost) {
      const channel = supabase.channel(`room_sync_${room.id}`);
      
      let lastSync = 0;
      const sendSync = async () => {
        const now = Date.now();
        if (now - lastSync < 1000) return; // Throttle 1 second to prevent DoS
        lastSync = now;
        
        await supabase.from('watch_rooms').update({
          is_playing: !video.paused,
          playback_time: video.currentTime
        }).eq('id', room.id);
      };
      
      const onPlay = () => sendSync();
      const onPause = () => sendSync();
      const onSeeked = () => sendSync();

      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      video.addEventListener('seeked', onSeeked);

      // Listen for sync requests from new guests
      channel.on('broadcast', { event: 'request_sync' }, () => {
        sendSync();
      });
      channel.subscribe();

      return () => {
        video.removeEventListener('play', onPlay);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('seeked', onSeeked);
        supabase.removeChannel(channel);
      };
    } else {
      const channel = supabase.channel(`room_sync_${room.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'watch_rooms', filter: `id=eq.${room.id}` }, (payload: { new: { is_playing?: boolean; playback_time?: number; [key: string]: unknown } }) => {
          const { is_playing, playback_time } = payload.new;
          if (playback_time !== undefined && Math.abs(video.currentTime - playback_time) > 1) {
            video.currentTime = playback_time;
          }
          if (is_playing === true) video.play().catch(e => console.log(e));
          else if (is_playing === false) video.pause();
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            // Once connected, ask host for current state
            channel.send({
              type: 'broadcast',
              event: 'request_sync',
              payload: {}
            });
          }
        });
      return () => { supabase.removeChannel(channel); };
    }
  }, [isHost, room.id, supabase]);

  const handleQualityChange = (index: number, height?: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentLevel(index);
      if (index === -1) {
        localStorage.setItem('preferred_quality', 'auto');
      } else if (height) {
        localStorage.setItem('preferred_quality', height.toString());
      }
    }
    setShowSettings(false);
  };

  const handleSpeedChange = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
    setShowSettings(false);
  };

  return (
    <div className="relative w-full h-full group bg-black">
      <video
        ref={videoRef}
        className={`cursor-pointer w-full h-full object-contain ${!isHost ? 'pointer-events-none' : ''}`}
        controls={isHost}
        playsInline
        muted={false}
        onPlay={() => { lastToggleTime.current = Date.now(); }}
        onPause={() => { lastToggleTime.current = Date.now(); }}
        onClick={(e) => {
          if (!isHost) return;
          const rect = e.currentTarget.getBoundingClientRect();
          if (rect.height - (e.clientY - rect.top) < 70) return; // Clicked on controls

          setTimeout(() => {
            if (Date.now() - lastToggleTime.current < 150) return; // Browser natively handled it

            if (videoRef.current) {
              if (videoRef.current.paused) videoRef.current.play();
              else videoRef.current.pause();
            }
          }, 50);
        }}
      />
      
      {levels.length > 0 && (
        <div className="absolute top-4 right-4 z-50">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="cursor-pointer w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          
          {showSettings && (
            <div className="absolute top-12 right-0 bg-black/90 backdrop-blur-md rounded-lg p-2 border border-white/10 w-32 animate-in fade-in zoom-in-95 max-h-[300px] overflow-y-auto custom-scrollbar">
              <div className="text-[10px] font-bold text-zinc-400 mb-1 px-3 uppercase tracking-wider">Quality</div>
              <button 
                onClick={() => handleQualityChange(-1)}
                className={`cursor-pointer w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-between ${currentLevel === -1 ? 'bg-white/10 text-orange-500' : 'text-white hover:bg-white/5'}`}
              >
                Auto {currentLevel === -1 && '✓'}
              </button>
              {levels.slice().reverse().map((level, idx) => {
                const originalIndex = levels.length - 1 - idx;
                return (
                  <button 
                    key={originalIndex}
                    onClick={() => handleQualityChange(originalIndex, level.height)}
                    className={`cursor-pointer w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-between ${currentLevel === originalIndex ? 'bg-white/10 text-orange-500' : 'text-white hover:bg-white/5'}`}
                  >
                    {level.height}p {currentLevel === originalIndex && '✓'}
                  </button>
                )
              })}
              <div className="h-px bg-white/10 my-2 mx-2"></div>
              <div className="text-[10px] font-bold text-zinc-400 mb-1 px-3 uppercase tracking-wider">Speed</div>
              {[0.5, 1, 1.25, 1.5, 2].map(rate => (
                <button
                  key={`speed-${rate}`}
                  onClick={() => handleSpeedChange(rate)}
                  className={`cursor-pointer w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-between ${playbackRate === rate ? 'bg-white/10 text-orange-500' : 'text-white hover:bg-white/5'}`}
                >
                  {rate}x {playbackRate === rate && '✓'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type Profile = { username: string; avatar_url: string };
type Member = { user_id: string; profiles: Profile | null };
type Message = { id: string; message: string; created_at: string; user_id: string; profiles: Profile | null };

export default function WatchRoomView({ room, user, onLeave }: WatchRoomViewProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [movieData, setMovieData] = useState<Record<string, unknown> | null>(null);
  const [showClosedModal, setShowClosedModal] = useState(false);
  
  const supabase = createClient();
  const isHost = room.host_id === user.id;
  const chatRef = useRef<HTMLDivElement>(null);

  // Fetch movie data to get m3u8
  useEffect(() => {
    fetch(`https://phimapi.com/phim/${room.movie_slug}`)
      .then(res => res.json())
      .then(data => {
        if (data.status) setMovieData(data);
      });
  }, [room.movie_slug]);

  // Listen for room closure (for members)
  useEffect(() => {
    if (isHost) return;

    const channel = supabase.channel(`room_status_${room.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'watch_rooms', filter: `id=eq.${room.id}` }, (payload: { new: { status?: string; [key: string]: unknown } }) => {
        if (payload.new.status === 'closed') {
          setShowClosedModal(true);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isHost, room.id, supabase, onLeave]);

  // Realtime Members
  useEffect(() => {
    const fetchMembers = async () => {
      const { data } = await supabase.from('watch_room_members').select(`user_id, profiles(username, avatar_url)`).eq('room_id', room.id);
      if (data) setMembers(data as unknown as Member[]);
    };
    fetchMembers();

    const channel = supabase.channel(`members_${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_room_members', filter: `room_id=eq.${room.id}` }, () => {
        fetchMembers();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room.id, supabase]);

  // Realtime Messages
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase.from('watch_room_messages').select(`id, message, created_at, user_id, profiles(username, avatar_url)`).eq('room_id', room.id).order('created_at', { ascending: true });
      if (data) setMessages(data as unknown as Message[]);
    };
    fetchMessages();

    const channel = supabase.channel(`messages_${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'watch_room_messages', filter: `room_id=eq.${room.id}` }, async (payload) => {
        const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', payload.new.user_id).single();
        const msg = { ...payload.new, profiles: profile } as unknown as Message;
        setMessages(prev => [...prev, msg]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [room.id, supabase]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const handleLeave = async () => {
    if (isHost) {
      await supabase.from('watch_rooms').update({ status: 'closed' }).eq('id', room.id);
    } else {
      await supabase.from('watch_room_members').delete().eq('room_id', room.id).eq('user_id', user.id);
    }
    onLeave();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const text = newMessage;
    setNewMessage('');
    await supabase.from('watch_room_messages').insert({ room_id: room.id, user_id: user.id, message: text });
  };

  const firstEpisodeSrc = (movieData as Record<string, any>)?.episodes?.[0]?.server_data?.[0]?.link_m3u8;

  return (
    <div className="pt-[140px] lg:pt-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 relative z-10 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <span className="bg-orange-500 text-white text-sm px-3 py-1 rounded-full uppercase tracking-widest font-bold shrink-0">Phòng Xem Chung</span>
            <span className="truncate">{room.movie_name}</span>
          </h1>
          <p className="text-zinc-400 mt-1 flex items-center gap-2 font-medium">
            Mã phòng: <span className="text-orange-400 font-bold tracking-widest text-lg bg-orange-500/10 px-2 py-0.5 rounded">{room.room_code}</span>
          </p>
        </div>
        <button
          onClick={handleLeave}
          className="cursor-pointer flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/10 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-all shadow-sm shrink-0"
        >
          {isHost ? 'Đóng phòng' : 'Rời phòng'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Main Video Area */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/5 flex items-center justify-center text-zinc-500 font-bold text-xl relative group">
            {!firstEpisodeSrc ? (
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 border-4 border-zinc-800 border-t-orange-500 rounded-full animate-spin mb-4"></div>
                Đang tải phim...
              </div>
            ) : (
              <SyncHlsPlayer src={firstEpisodeSrc} room={room} isHost={isHost} supabase={supabase} />
            )}
            {!isHost && firstEpisodeSrc && (
              <div className="absolute top-4 right-4 bg-black/60 backdrop-blur text-white text-xs px-3 py-1.5 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Đang đồng bộ với Host
              </div>
            )}
          </div>
          
          {/* Members List */}
          <div className="bg-zinc-900/50 rounded-2xl p-5 border border-white/5">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
              Thành viên trong phòng ({members.length})
            </h3>
            <div className="flex flex-wrap gap-3">
              {members.map((m, i) => {
                const isMemberHost = m.user_id === room.host_id;
                return (
                  <div key={i} className="flex items-center gap-2 bg-zinc-800/80 rounded-full pr-4 pl-1 py-1 border border-white/5">
                    <img src={m.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.user_id}`} alt="avatar" className="w-8 h-8 rounded-full bg-zinc-700" />
                    <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                      {m.profiles?.username || `Thành viên ${m.user_id.substring(0, 4)}`}
                      {isMemberHost && <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><title>Host</title><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="bg-zinc-900 border border-white/5 rounded-2xl h-[600px] flex flex-col shadow-xl">
          <div className="p-4 border-b border-white/5 font-bold text-white flex items-center justify-between shrink-0">
            <span>Trò chuyện trực tiếp</span>
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
          </div>
          
          <div ref={chatRef} className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm">
                <svg className="w-12 h-12 mb-3 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                Hãy là người đầu tiên chat!
              </div>
            ) : (
              messages.map(msg => {
                const isMe = msg.user_id === user.id;
                return (
                  <div key={msg.id} className={`flex gap-3 max-w-[85%] ${isMe ? 'ml-auto flex-row-reverse' : ''}`}>
                    <img src={msg.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.user_id}`} className="w-8 h-8 rounded-full shrink-0 bg-zinc-800" alt="avatar" />
                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <span className="text-xs text-zinc-500 mb-1 px-1">{msg.profiles?.username || `Thành viên ${msg.user_id.substring(0, 4)}`}</span>
                      <div className={`px-4 py-2 rounded-2xl text-sm ${isMe ? 'bg-orange-500 text-white rounded-tr-sm' : 'bg-zinc-800 text-zinc-200 rounded-tl-sm'}`}>
                        {msg.message}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-3 border-t border-white/5 bg-zinc-950 rounded-b-2xl shrink-0">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Nhập tin nhắn..." 
                className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/50 text-white" 
              />
              <button 
                type="submit" 
                disabled={!newMessage.trim()} 
                className="bg-orange-500 text-white p-2.5 rounded-xl disabled:opacity-50 hover:bg-orange-600 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </div>
          </form>
        </div>
      </div>

      {showClosedModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200 px-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Phòng Đã Đóng</h3>
            <p className="text-zinc-400 text-sm mb-8">Chủ phòng đã giải tán phòng xem chung này. Hẹn gặp lại bạn ở những bộ phim tiếp theo nhé!</p>
            <button
              onClick={onLeave}
              className="cursor-pointer w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-orange-500/20"
            >
              Về Trang Chủ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
