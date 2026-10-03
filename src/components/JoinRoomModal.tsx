import { useState } from 'react';
import { joinWatchRoom } from '@/lib/room';

type JoinRoomModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onJoinSuccess: (room: Record<string, unknown>) => void;
};

export default function JoinRoomModal({ isOpen, onClose, userId, onJoinSuccess }: JoinRoomModalProps) {
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    
    setError('');
    setLoading(true);

    try {
      const room = await joinWatchRoom(userId, roomCode.toUpperCase().trim());
      onJoinSuccess(room);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tham gia phòng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} className="cursor-pointer absolute top-4 right-4 text-zinc-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Tham Gia Phòng</h2>
        <p className="text-zinc-400 text-sm text-center mb-6">Nhập mã phòng 6 ký tự để cùng xem phim với bạn bè!</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-xl text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-1.5">Mã Phòng (Room Code)</label>
            <input 
              type="text" 
              value={roomCode} 
              onChange={e => setRoomCode(e.target.value.toUpperCase())} 
              required 
              maxLength={6}
              className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.5em] font-black placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-orange-500 uppercase" 
              placeholder="ABC123" 
            />
          </div>

          <button type="submit" disabled={loading || roomCode.length < 3} className="cursor-pointer w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl mt-2 transition-colors disabled:opacity-50">
            {loading ? 'Đang vào phòng...' : 'Vào Phòng Ngay'}
          </button>
        </form>
      </div>
    </div>
  );
}
