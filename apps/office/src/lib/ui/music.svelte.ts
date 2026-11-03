// The office's music player: one player for the whole page, so the controls can
// sit in the start panel or on the folded plate without the track restarting.
// Tracks play in a random order, never one of the last few again. A loved track
// comes up twice as often, and a passed one never, unless the owner passed on
// all of them. A new owner's first visit opens on "Good Morning, Neighbor".
// After that the music plays on each visit if the owner left it on. A browser
// keeps a page quiet until the visitor clicks or types, so a play the browser
// refuses waits for that. Every choice here is remembered per viewer.
import { OPENING, TRACKS, trackSrc } from './tracks.ts';

const ON = 'oddboro.music';
const VOLUME = 'oddboro.volume';
const REPEAT = 'oddboro.music.repeat';
const LOVED = 'oddboro.music.loved';
const PASSED = 'oddboro.music.passed';

/** Back restarts the track once it has played this long, in seconds. */
const RESTART_AFTER = 3;

export const music = $state<{
  audio?: HTMLAudioElement;
  /** The track loaded, playing or not. */
  current?: string;
  playing: boolean;
  /** Where the track is and how long it runs, in seconds. */
  time: number;
  duration: number;
  /** 0 to 1. */
  volume: number;
  /** Play the current track again when it ends. */
  repeat: boolean;
  loved: string[];
  passed: string[];
}>({ playing: false, time: 0, duration: 0, volume: 0.6, repeat: false, loved: [], passed: [] });

/** The owner's word on the music: 'on', 'off', or never said. */
let choice: string | null = null;
/** The volume the speaker brings back after a mute. */
let lastVolume = 0.6;
/** The tracks played before this one, oldest first. */
const history: string[] = [];

function ids(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? '[]');
    const known = new Set(TRACKS.map((t) => t.id));
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && known.has(x))
      : [];
  } catch {
    return [];
  }
}

try {
  choice = localStorage.getItem(ON);
  const v = Number(localStorage.getItem(VOLUME));
  if (localStorage.getItem(VOLUME) !== null && v >= 0 && v <= 1) music.volume = v;
  if (music.volume > 0) lastVolume = music.volume;
  music.repeat = localStorage.getItem(REPEAT) === '1';
  music.loved = ids(localStorage.getItem(LOVED));
  music.passed = ids(localStorage.getItem(PASSED));
} catch {
  // No storage: the defaults hold, and the controls work for this visit.
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private window: remembered for this visit only.
  }
}

function choose(on: boolean): void {
  choice = on ? 'on' : 'off';
  remember(ON, choice);
}

export const titleOf = (id: string | undefined): string | undefined =>
  TRACKS.find((t) => t.id === id)?.title;

/** The next track: random, weighted to the loved, skipping the passed and the last few played. */
function pick(): string {
  let pool = TRACKS.map((t) => t.id).filter((id) => !music.passed.includes(id));
  if (!pool.length) pool = TRACKS.map((t) => t.id);
  const recent = new Set([...history, music.current].slice(-Math.min(5, pool.length - 1)));
  const fresh = pool.filter((id) => !recent.has(id));
  if (fresh.length) pool = fresh;
  const weighted = pool.flatMap((id) => (music.loved.includes(id) ? [id, id] : [id]));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function show(id: string, a: HTMLAudioElement): void {
  music.current = id;
  a.src = trackSrc(id);
  if ('mediaSession' in navigator)
    navigator.mediaSession.metadata = new MediaMetadata({
      title: titleOf(id),
      artist: 'Oddboro'
    });
}

function load(id: string): void {
  const a = music.audio;
  if (!a) return;
  if (music.current && music.current !== id) history.push(music.current);
  if (history.length > 50) history.shift();
  show(id, a);
}

function play(): void {
  const a = music.audio;
  if (!a) return;
  if (!music.current) load(pick());
  a.volume = music.volume;
  void a.play().then(
    () => (music.playing = true),
    () => {}
  );
}

/** The Mac's media keys and Control Center skip tracks too. */
function mediaKeys(): void {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('nexttrack', next);
  navigator.mediaSession.setActionHandler('previoustrack', back);
}

/**
 * On page load: a first visit plays the opening track, a later one plays if
 * the owner left the music on. Now if the browser lets it, else at the first
 * click or key.
 */
export function startMusic(firstRun: boolean): void {
  if (!music.audio) return;
  mediaKeys();
  if (choice === 'off' || (!firstRun && choice !== 'on')) return;
  load(firstRun && !music.passed.includes(OPENING) ? OPENING : pick());
  play();
  const first = () => {
    if (!music.playing && choice !== 'off') play();
  };
  window.addEventListener('pointerdown', first, { once: true });
  window.addEventListener('keydown', first, { once: true });
}

export function togglePlay(): void {
  if (music.playing) {
    music.audio?.pause();
    choose(false);
    return;
  }
  choose(true);
  if (music.volume === 0) setVolume(lastVolume);
  play();
}

/** A new random track, playing. */
export function next(): void {
  load(pick());
  choose(true);
  play();
}

/** The start of this track, or the one before it if this one only just began. */
export function back(): void {
  const a = music.audio;
  if (!a) return;
  const before = history.pop();
  if (a.currentTime > RESTART_AFTER || !before) {
    if (before) history.push(before);
    a.currentTime = 0;
  } else {
    show(before, a);
  }
  choose(true);
  play();
}

export function toggleRepeat(): void {
  music.repeat = !music.repeat;
  remember(REPEAT, music.repeat ? '1' : '0');
}

export function toggleLove(): void {
  const id = music.current;
  if (!id) return;
  music.loved = music.loved.includes(id)
    ? music.loved.filter((x) => x !== id)
    : [...music.loved, id];
  music.passed = music.passed.filter((x) => x !== id);
  remember(LOVED, JSON.stringify(music.loved));
  remember(PASSED, JSON.stringify(music.passed));
}

/** Pass on the current track: the player moves on, and the shuffle leaves it out. Again takes it back. */
export function togglePass(): void {
  const id = music.current;
  if (!id) return;
  const passing = !music.passed.includes(id);
  music.passed = passing ? [...music.passed, id] : music.passed.filter((x) => x !== id);
  music.loved = music.loved.filter((x) => x !== id);
  remember(PASSED, JSON.stringify(music.passed));
  remember(LOVED, JSON.stringify(music.loved));
  if (!passing) return;
  const wasPlaying = music.playing;
  load(pick());
  if (wasPlaying) play();
}

/** The seek bar. */
export function seek(t: number): void {
  const a = music.audio;
  if (!a || !music.duration) return;
  a.currentTime = Math.max(0, Math.min(music.duration, t));
  music.time = a.currentTime;
}

/** The volume slider. All the way down silences the music without stopping it. */
export function setVolume(v: number): void {
  music.volume = Math.max(0, Math.min(1, v));
  if (music.volume > 0) lastVolume = music.volume;
  remember(VOLUME, String(music.volume));
  if (music.audio) music.audio.volume = music.volume;
}

/** The speaker: silence the music, or bring back the volume it had. */
export function toggleMute(): void {
  setVolume(music.volume > 0 ? 0 : lastVolume);
}

/** A track came to its end: again on repeat, else the next one. */
export function musicEnded(): void {
  const a = music.audio;
  if (music.repeat && a) {
    a.currentTime = 0;
    play();
    return;
  }
  load(pick());
  play();
}
