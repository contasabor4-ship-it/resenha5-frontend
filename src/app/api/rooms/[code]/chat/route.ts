import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;

    const { data: messages } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('room_code', code)
      .order('created_at', { ascending: true })
      .limit(200);

    return NextResponse.json({ messages: messages || [] });
  } catch (error) {
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const { playerId, playerName, message } = await req.json();

    const { error } = await supabaseAdmin.from('chat_messages').insert({
      room_code: code,
      player_id: playerId,
      player_name: playerName,
      message: message.trim(),
    });

    if (error) {
      return NextResponse.json({ error: 'Erro ao enviar mensagem' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
