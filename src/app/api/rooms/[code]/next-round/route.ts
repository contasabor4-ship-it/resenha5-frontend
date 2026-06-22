import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createAssignments, calculatePhaseEnd } from '@/lib/game-logic';

const DEFAULT_PHRASES = [
  'O céu é azul', 'A noite estrelada', 'Um dia ensolarado',
  'Uma flor no jardim', 'O mar azul', 'Uma casa na colina',
  'O gato dorme', 'O cachorro corre', 'A chuva cai',
  'O sol brilha', 'A lua cheia', 'Um arco-íris',
  'Uma árvore alta', 'O vento sopra', 'A neve cai',
  'Uma montanha alta', 'O rio corre', 'A praia vazia',
  'Um castelo antigo', 'A floresta escura',
];

function getRandomDefault() {
  return DEFAULT_PHRASES[Math.floor(Math.random() * DEFAULT_PHRASES.length)];
}

async function allPlayersSubmitted(roomCode: string): Promise<boolean> {
  const { data: players } = await supabaseAdmin
    .from('players')
    .select('id, has_submitted')
    .eq('room_code', roomCode)
    .eq('is_connected', true);
  if (!players || players.length === 0) return false;
  return players.every((p) => p.has_submitted);
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await req.json().catch(() => ({}));
    const { force } = body;

    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('*')
      .eq('code', code)
      .single();

    if (!room) {
      return NextResponse.json({ error: 'Sala não encontrada' }, { status: 404 });
    }

    const currentRound = room.current_round;
    const totalRounds = room.total_rounds;
    const currentPhase = room.current_phase;

    const { data: players } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('room_code', code)
      .eq('is_connected', true);

    if (!players || players.length === 0) {
      return NextResponse.json({ error: 'Sem jogadores' }, { status: 400 });
    }

    const pidSet = players.map((p) => p.id);

    if (currentPhase === 'writing') {
      // Evita transição duplicada se assignments já existem
      const { data: existingAssignments } = await supabaseAdmin
        .from('assignments')
        .select('id')
        .eq('room_code', code)
        .eq('round_number', currentRound + 1)
        .eq('phase', 'drawing')
        .limit(1);
      if (existingAssignments && existingAssignments.length > 0) {
        return NextResponse.json({ success: true, newPhase: 'drawing', round: currentRound + 1 });
      }

      const allDone = await allPlayersSubmitted(code);
      if (!allDone && !force) {
        return NextResponse.json({ success: false, message: 'Aguardando todos' });
      }

      if (force) {
        const { data: missing } = await supabaseAdmin
          .from('players')
          .select('id')
          .eq('room_code', code)
          .eq('is_connected', true)
          .eq('has_submitted', false);

        if (missing && missing.length > 0) {
          for (const p of missing) {
            const { data: existingP } = await supabaseAdmin
              .from('phrases')
              .select('id')
              .eq('room_code', code)
              .eq('round_number', currentRound)
              .eq('author_id', p.id)
              .eq('is_initial', true)
              .maybeSingle();
            if (!existingP) {
              await supabaseAdmin.from('phrases').insert({
                room_code: code,
                round_number: currentRound,
                author_id: p.id,
                text: getRandomDefault(),
                is_initial: true,
              });
            }
          }
        }
      }

      // Pega UMA frase por jogador (usa uma subquery pra evitar duplicatas)
      const { data: phrases } = await supabaseAdmin
        .from('phrases')
        .select('id, author_id')
        .eq('room_code', code)
        .eq('round_number', currentRound)
        .eq('is_initial', true)
        .in('author_id', pidSet);

      if (!phrases || phrases.length === 0) {
        return NextResponse.json({ error: 'Nenhuma frase encontrada' }, { status: 500 });
      }

      // Se houver mais frases que players, pega só a primeira de cada player
      let deduped = phrases;
      if (phrases.length > players.length) {
        const seen = new Set<string>();
        deduped = phrases.filter(p => {
          if (seen.has(p.author_id)) return false;
          seen.add(p.author_id);
          return true;
        });
      }

      if (deduped.length !== players.length) {
        return NextResponse.json({ error: 'Contagem de frases inválida' }, { status: 500 });
      }

      const assignments = createAssignments(players, currentRound + 1, 'drawing', deduped.map((p) => p.id));
      const { error: aErr } = await supabaseAdmin.from('assignments').insert(
        assignments.map((a) => ({ ...a, room_code: code, round_number: currentRound + 1, phase: 'drawing' }))
      );
      if (aErr) return NextResponse.json({ error: 'Erro ao criar assignments' }, { status: 500 });

      await supabaseAdmin.from('players').update({ has_submitted: false }).eq('room_code', code);
      await supabaseAdmin.from('rooms').update({
        current_round: currentRound + 1,
        current_phase: 'drawing',
        phase_end_at: calculatePhaseEnd(180),
      }).eq('code', code);

      return NextResponse.json({ success: true, newPhase: 'drawing', round: currentRound + 1 });
    }

    if (currentPhase === 'drawing') {
      const { data: existingG } = await supabaseAdmin
        .from('assignments')
        .select('id')
        .eq('room_code', code)
        .eq('round_number', currentRound)
        .eq('phase', 'guessing')
        .limit(1);
      if (existingG && existingG.length > 0) {
        return NextResponse.json({ success: true, newPhase: 'guessing' });
      }

      const allDone = await allPlayersSubmitted(code);
      if (!allDone && !force) {
        return NextResponse.json({ success: false, message: 'Aguardando todos' });
      }

      if (force) {
        const { data: assignments } = await supabaseAdmin
          .from('assignments')
          .select('id, player_id, source_id')
          .eq('room_code', code)
          .eq('round_number', currentRound)
          .eq('phase', 'drawing')
          .in('player_id', pidSet);

        const { data: missing } = await supabaseAdmin
          .from('players')
          .select('id')
          .eq('room_code', code)
          .eq('is_connected', true)
          .eq('has_submitted', false);

        if (missing && missing.length > 0 && assignments) {
          for (const p of missing) {
            const assign = assignments.find((a) => a.player_id === p.id);
            if (!assign) continue;
            const { data: existingD } = await supabaseAdmin
              .from('drawings')
              .select('id')
              .eq('room_code', code)
              .eq('round_number', currentRound)
              .eq('drawer_id', p.id)
              .maybeSingle();
            if (!existingD) {
              await supabaseAdmin.from('drawings').insert({
                room_code: code,
                round_number: currentRound,
                phrase_id: assign.source_id,
                drawer_id: p.id,
                image_url: blankPNG,
              });
            }
          }
        }
      }

      const { data: drawings } = await supabaseAdmin
        .from('drawings')
        .select('id, drawer_id')
        .eq('room_code', code)
        .eq('round_number', currentRound)
        .in('drawer_id', pidSet);

      if (!drawings || drawings.length === 0) {
        return NextResponse.json({ error: 'Nenhum desenho encontrado' }, { status: 500 });
      }

      let dedupedD = drawings;
      if (drawings.length > players.length) {
        const seen = new Set<string>();
        dedupedD = drawings.filter(d => {
          if (seen.has(d.drawer_id)) return false;
          seen.add(d.drawer_id);
          return true;
        });
      }

      if (dedupedD.length !== players.length) {
        return NextResponse.json({ error: 'Contagem de desenhos inválida' }, { status: 500 });
      }

      const assignments = createAssignments(players, currentRound, 'guessing', dedupedD.map((d) => d.id));
      const { error: aErr } = await supabaseAdmin.from('assignments').insert(
        assignments.map((a) => ({ ...a, room_code: code, round_number: currentRound, phase: 'guessing' }))
      );
      if (aErr) return NextResponse.json({ error: 'Erro ao criar assignments' }, { status: 500 });

      await supabaseAdmin.from('players').update({ has_submitted: false }).eq('room_code', code);
      await supabaseAdmin.from('rooms').update({
        current_phase: 'guessing',
        phase_end_at: calculatePhaseEnd(60),
      }).eq('code', code);

      return NextResponse.json({ success: true, newPhase: 'guessing' });
    }

    if (currentPhase === 'guessing') {
      if (currentRound >= totalRounds) {
        await supabaseAdmin.from('rooms').update({
          current_phase: 'results',
          status: 'finished',
          finished_at: new Date().toISOString(),
        }).eq('code', code);
        return NextResponse.json({ success: true, newPhase: 'results' });
      }

      // Verifica se já existe próxima rodada
      const nextRound = currentRound + 1;
      const { data: existingNext } = await supabaseAdmin
        .from('assignments')
        .select('id')
        .eq('room_code', code)
        .eq('round_number', nextRound)
        .eq('phase', 'drawing')
        .limit(1);
      if (existingNext && existingNext.length > 0) {
        return NextResponse.json({ success: true, newPhase: 'drawing', round: nextRound });
      }

      const allDone = await allPlayersSubmitted(code);
      if (!allDone && !force) {
        return NextResponse.json({ success: false, message: 'Aguardando todos' });
      }

      if (force) {
        const { data: missing } = await supabaseAdmin
          .from('players')
          .select('id')
          .eq('room_code', code)
          .eq('is_connected', true)
          .eq('has_submitted', false);

        if (missing && missing.length > 0) {
          const { data: guessAssignments } = await supabaseAdmin
            .from('assignments')
            .select('id, player_id, source_id')
            .eq('room_code', code)
            .eq('round_number', currentRound)
            .eq('phase', 'guessing')
            .in('player_id', pidSet);

          if (guessAssignments) {
            for (const p of missing) {
              const assign = guessAssignments.find((a) => a.player_id === p.id);
              if (!assign) continue;
              const { data: existingG } = await supabaseAdmin
                .from('guesses')
                .select('id')
                .eq('room_code', code)
                .eq('round_number', currentRound)
                .eq('guesser_id', p.id)
                .maybeSingle();
              if (!existingG) {
                await supabaseAdmin.from('guesses').insert({
                  room_code: code,
                  round_number: currentRound,
                  drawing_id: assign.source_id,
                  guesser_id: p.id,
                  text: getRandomDefault(),
                });
              }
              await supabaseAdmin.from('players').update({ has_submitted: true }).eq('id', p.id);
            }
          }
        }
      }

      const { data: guesses } = await supabaseAdmin
        .from('guesses')
        .select('id, text, guesser_id')
        .eq('room_code', code)
        .eq('round_number', currentRound)
        .in('guesser_id', pidSet);

      if (!guesses || guesses.length === 0) {
        return NextResponse.json({ error: 'Nenhum palpite encontrado' }, { status: 500 });
      }

      // Deduplica palpites
      let dedupedG = guesses;
      if (guesses.length > players.length) {
        const seen = new Set<string>();
        dedupedG = guesses.filter(g => {
          if (seen.has(g.guesser_id)) return false;
          seen.add(g.guesser_id);
          return true;
        });
      }

      if (dedupedG.length !== players.length) {
        return NextResponse.json({ error: 'Contagem de palpites inválida' }, { status: 500 });
      }

      // Cria frases da próxima rodada (upsert)
      for (const g of dedupedG) {
        const { data: existingPh } = await supabaseAdmin
          .from('phrases')
          .select('id')
          .eq('room_code', code)
          .eq('round_number', nextRound)
          .eq('author_id', g.guesser_id)
          .maybeSingle();
        if (!existingPh) {
          await supabaseAdmin.from('phrases').insert({
            room_code: code,
            round_number: nextRound,
            author_id: g.guesser_id,
            text: g.text,
            is_initial: false,
          });
        }
      }

      const { data: newPhrases } = await supabaseAdmin
        .from('phrases')
        .select('id, author_id')
        .eq('room_code', code)
        .eq('round_number', nextRound);

      if (!newPhrases || newPhrases.length === 0) {
        return NextResponse.json({ error: 'Nenhuma nova frase' }, { status: 500 });
      }

      let dedupedNP = newPhrases;
      if (newPhrases.length > players.length) {
        const seen = new Set<string>();
        dedupedNP = newPhrases.filter(p => {
          if (seen.has(p.author_id)) return false;
          seen.add(p.author_id);
          return true;
        });
      }

      if (dedupedNP.length !== players.length) {
        return NextResponse.json({ error: 'Contagem de novas frases inválida' }, { status: 500 });
      }

      const assignments = createAssignments(players, nextRound, 'drawing', dedupedNP.map((p) => p.id));
      const { error: aErr } = await supabaseAdmin.from('assignments').insert(
        assignments.map((a) => ({ ...a, room_code: code, round_number: nextRound, phase: 'drawing' }))
      );
      if (aErr) return NextResponse.json({ error: 'Erro ao criar assignments' }, { status: 500 });

      await supabaseAdmin.from('players').update({ has_submitted: false }).eq('room_code', code);
      await supabaseAdmin.from('rooms').update({
        current_round: nextRound,
        current_phase: 'drawing',
        phase_end_at: calculatePhaseEnd(180),
      }).eq('code', code);

      return NextResponse.json({ success: true, newPhase: 'drawing', round: nextRound });
    }

    return NextResponse.json({ error: 'Fase inválida' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

const blankPNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAoAAAAKAAQMAAAA1h3nWAAAABlBMVEX///8AAABVwtN+AAAASElEQVR42u3BMQEAAADIPuXb71f0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADuBQ7AAAFTAwBiAAAAAElFTkSuQmCC';
