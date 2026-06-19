import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    const { nickname, password } = await req.json();

    const trimmed = nickname?.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Digite seu nickname' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'Digite sua senha' }, { status: 400 });
    }

    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('*')
      .eq('nickname', trimmed)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Nickname ou senha incorretos' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Nickname ou senha incorretos' }, { status: 401 });
    }

    return NextResponse.json({ success: true, nickname: trimmed });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
