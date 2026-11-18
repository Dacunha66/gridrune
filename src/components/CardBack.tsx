// Back of a face-down card (pack opening in the shop and in the Postfach): the GridRune logo with the game's name,
// on the colours of the player's card skin (--b1…--b3).
import { CSSProperties } from 'react';
import { LogoMark } from './LogoMark';

export function CardBack({ colors }: { colors: readonly [string, string, string] | readonly string[] }) {
  return (
    <span className="flip-face flip-back" aria-hidden="true" style={{ '--b1': colors[0], '--b2': colors[1], '--b3': colors[2] } as CSSProperties}>
      <span className="back-pattern" />
      <span className="back-emblem">
        <span className="back-halo" />
        <LogoMark className="back-logo" />
        <span className="back-name">GridRune</span>
      </span>
    </span>
  );
}
