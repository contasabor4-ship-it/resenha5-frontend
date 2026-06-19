import { supabaseAdmin } from '@/lib/supabase-server';
import { createAssignments, calculatePhaseEnd } from '@/lib/game-logic';

export async function allPlayersSubmitted(roomCode: string): Promise<boolean> {
  const { data: players } = await supabaseAdmin
    .from('players')
    .select('id, has_submitted')
    .eq('room_code', roomCode)
    .eq('is_connected', true);
  if (!players || players.length === 0) return false;
  return players.every((p) => p.has_submitted);
}

export async function autoAdvanceIfReady(roomCode: string): Promise<boolean> {
  try {
    const ready = await allPlayersSubmitted(roomCode);
    if (!ready) return false;

    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('*')
      .eq('code', roomCode)
      .single();

    if (!room) return false;

    const currentRound = room.current_round;
    const totalRounds = room.total_rounds;
    const currentPhase = room.current_phase;

    const { data: players } = await supabaseAdmin
      .from('players')
      .select('*')
      .eq('room_code', roomCode)
      .eq('is_connected', true);

    if (!players || players.length === 0) return false;

    const connectedIds = players.map((p) => p.id);

    if (currentPhase === 'writing') {
      const { data: phrases } = await supabaseAdmin
        .from('phrases')
        .select('id, author_id')
        .eq('room_code', roomCode)
        .eq('round_number', currentRound)
        .eq('is_initial', true)
        .in('author_id', connectedIds);

      if (!phrases || phrases.length === 0) return false;
      if (phrases.length !== players.length) return false;

      const phraseIds = phrases.map((p) => p.id);
      const assignments = createAssignments(players, currentRound + 1, 'drawing', phraseIds);

      const { error: aErr } = await supabaseAdmin.from('assignments').insert(
        assignments.map((a) => ({ ...a, room_code: roomCode, round_number: currentRound + 1, phase: 'drawing' }))
      );
      if (aErr) return false;

      await supabaseAdmin.from('players').update({ has_submitted: false }).eq('room_code', roomCode);
      const { error: uErr } = await supabaseAdmin.from('rooms').update({
        current_round: currentRound + 1,
        current_phase: 'drawing',
        phase_end_at: calculatePhaseEnd(180),
      }).eq('code', roomCode).eq('current_phase', currentPhase);
      if (uErr) return false;
      return true;
    }

    if (currentPhase === 'drawing') {
      const { data: drawings } = await supabaseAdmin
        .from('drawings')
        .select('id, drawer_id')
        .eq('room_code', roomCode)
        .eq('round_number', currentRound)
        .in('drawer_id', connectedIds);

      if (!drawings || drawings.length === 0) return false;
      if (drawings.length !== players.length) return false;

      const drawingIds = drawings.map((d) => d.id);
      const assignments = createAssignments(players, currentRound, 'guessing', drawingIds);

      const { error: aErr } = await supabaseAdmin.from('assignments').insert(
        assignments.map((a) => ({ ...a, room_code: roomCode, round_number: currentRound, phase: 'guessing' }))
      );
      if (aErr) return false;

      await supabaseAdmin.from('players').update({ has_submitted: false }).eq('room_code', roomCode);
      const { error: uErr } = await supabaseAdmin.from('rooms').update({
        current_phase: 'guessing',
        phase_end_at: calculatePhaseEnd(60),
      }).eq('code', roomCode).eq('current_phase', currentPhase);
      if (uErr) return false;
      return true;
    }

    if (currentPhase === 'guessing') {
      if (currentRound >= totalRounds) {
        const { error: uErr } = await supabaseAdmin.from('rooms').update({
          current_phase: 'results',
          status: 'finished',
          finished_at: new Date().toISOString(),
        }).eq('code', roomCode).eq('current_phase', currentPhase);
        if (uErr) return false;
        return true;
      }

      const { data: guesses } = await supabaseAdmin
        .from('guesses')
        .select('id, text, guesser_id')
        .eq('room_code', roomCode)
        .eq('round_number', currentRound)
        .in('guesser_id', connectedIds);

      if (!guesses || guesses.length === 0) return false;
      if (guesses.length !== players.length) return false;

      const nextRound = currentRound + 1;
      const { error: pErr } = await supabaseAdmin.from('phrases').insert(
        guesses.map((g) => ({
          room_code: roomCode,
          round_number: nextRound,
          author_id: g.guesser_id,
          text: g.text,
          is_initial: false,
        }))
      );
      if (pErr) return false;

      const { data: newPhrases } = await supabaseAdmin
        .from('phrases')
        .select('id, author_id')
        .eq('room_code', roomCode)
        .eq('round_number', nextRound);

      if (!newPhrases || newPhrases.length === 0) return false;
      if (newPhrases.length !== players.length) return false;

      const newPhraseIds = newPhrases.map((p) => p.id);
      const assignments = createAssignments(players, nextRound, 'drawing', newPhraseIds);

      const { error: aErr } = await supabaseAdmin.from('assignments').insert(
        assignments.map((a) => ({ ...a, room_code: roomCode, round_number: nextRound, phase: 'drawing' }))
      );
      if (aErr) return false;

      await supabaseAdmin.from('players').update({ has_submitted: false }).eq('room_code', roomCode);
      const { error: uErr } = await supabaseAdmin.from('rooms').update({
        current_round: nextRound,
        current_phase: 'drawing',
        phase_end_at: calculatePhaseEnd(180),
      }).eq('code', roomCode).eq('current_phase', currentPhase);
      if (uErr) return false;
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}
