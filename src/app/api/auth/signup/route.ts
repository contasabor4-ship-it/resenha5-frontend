import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { nickname, password } = await req.json();

    const trimmed = nickname?.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 16) {
      return NextResponse.json({ error: 'Nickname inválido (2-16 caracteres)' }, { status: 400 });
    }
    if (/\s/.test(trimmed)) {
      return NextResponse.json({ error: 'Nickname não pode conter espaços' }, { status: 400 });
    }
    if (!password || password.length < 3) {
      return NextResponse.json({ error: 'Senha deve ter no mínimo 3 caracteres' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('accounts')
      .select('nickname')
      .eq('nickname', trimmed)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Nickname já cadastrado' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { error: insertError } = await supabaseAdmin
      .from('accounts')
      .insert({ nickname: trimmed, password_hash });

    if (insertError) {
      return NextResponse.json({ error: 'Erro ao criar conta' }, { status: 500 });
    }

    return NextResponse.json({ success: true, nickname: trimmed });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
