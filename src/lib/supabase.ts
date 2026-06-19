import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export function getRoomChannel(roomCode: string) {
  return supabase.channel(`room:${roomCode}`, {
    config: {
      broadcast: {
        self: true,
      },
      presence: {
        key: '',
      },
    },
  });
}
