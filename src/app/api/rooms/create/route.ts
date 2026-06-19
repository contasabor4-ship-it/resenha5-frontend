import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const { data: existing } = await supabaseAdmin
      .from('rooms')
      .select('code')
      .eq('code', code)
      .single();
    if (!existing) return code;
  }
  throw new Error('Não foi possível gerar um código único');
}

export async function POST(req: Request) {
  try {
    const { nickname } = await req.json();
    if (!nickname || !nickname.trim()) {
      return NextResponse.json({ error: 'Nickname é obrigatório' }, { status: 400 });
    }

    const code = await generateUniqueCode();

    const { error: insertError } = await supabaseAdmin.from('rooms').insert({
      code,
      host_player_id: null,
      max_players: 16,
      status: 'waiting',
      current_round: 0,
      total_rounds: 0,
      current_phase: 'lobby',
      phase_end_at: null,
    });

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Erro ao criar sala: ' + insertError.message }, { status: 500 });
    }

    return NextResponse.json({ code });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
