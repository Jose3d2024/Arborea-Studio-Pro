import React, { useEffect, useState } from 'react';
import {
  BarkType,
  CanopyElementType,
  HangingElementType,
  StemStructureType,
  SurfaceElementType,
  SynthesizedBasalFoliageType,
  SynthesizedTipPrimitive,
} from '../types/botany';
import {
  enqueueReal3DPartThumbnail,
  getCachedReal3DThumb,
} from '../utils/real3DThumbRenderer';

export type PartThumbKind =
  | 'stem'
  | 'canopy'
  | 'surface'
  | 'hanging'
  | 'tip'
  | 'basal'
  | 'bark';

interface PartVisualThumbProps {
  kind: PartThumbKind;
  value: string;
  colorTrunk?: string;
  colorMain?: string;
  colorTip?: string;
  colorFlower?: string;
  colorAccent?: string;
  size?: number;
  className?: string;
}

export const PartVisualThumb: React.FC<PartVisualThumbProps> = ({
  kind,
  value,
  colorTrunk = '#6b4c35',
  colorMain = '#22c55e',
  colorTip = '#86efac',
  colorFlower = '#f472b6',
  colorAccent = '#38bdf8',
  size = 38,
  className = '',
}) => {
  const cacheKey = `part_${kind}_${value}_${colorTrunk}_${colorMain}_${colorFlower}`;
  const [real3DUrl, setReal3DUrl] = useState<string | null>(
    () => getCachedReal3DThumb(cacheKey) || null
  );

  useEffect(() => {
    const cached = getCachedReal3DThumb(cacheKey);
    if (cached) {
      setReal3DUrl(cached);
      return;
    }
    let cancelled = false;
    const cancelQueue = enqueueReal3DPartThumbnail(
      kind,
      value,
      {
        trunk: colorTrunk,
        main: colorMain,
        tip: colorTip,
        flower: colorFlower,
        accent: colorAccent,
      },
      (rendered) => {
        if (!cancelled && rendered) {
          setReal3DUrl(rendered);
        }
      }
    );
    return () => {
      cancelled = true;
      cancelQueue();
    };
  }, [cacheKey, kind, value, colorTrunk, colorMain, colorTip, colorFlower, colorAccent]);

  if (real3DUrl) {
    return (
      <img
        src={real3DUrl}
        alt={value}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`rounded-md bg-[#090f18] border border-slate-700/80 object-cover shrink-0 ${className}`}
      />
    );
  }

  const renderGlyph = () => {
    if (kind === 'stem') {
      const s = value as StemStructureType;
      switch (s) {
        case 'herbaceous_curved_stalk':
          return (
            <path
              d="M32 56 C26 42, 38 28, 30 12"
              stroke="#4ade80"
              strokeWidth="4.5"
              strokeLinecap="round"
              fill="none"
            />
          );
        case 'multi_stalk_umbel_colony':
          return (
            <g stroke={colorTrunk} strokeWidth="2.8" strokeLinecap="round" fill="none">
              <path d="M32 56 C30 40, 20 30, 18 16" />
              <path d="M32 56 C32 38, 34 24, 32 10" />
              <path d="M32 56 C35 42, 44 32, 46 18" />
            </g>
          );
        case 'serpentine_mossy_deadwood':
          return (
            <g fill="none" strokeLinecap="round">
              <path d="M22 56 C44 44, 14 28, 42 12" stroke={colorTrunk} strokeWidth="6" />
              <path d="M26 36 L14 28 M36 22 L48 16" stroke={colorTrunk} strokeWidth="3" />
              <circle cx="30" cy="34" r="3.5" fill="#65a30d" />
              <circle cx="37" cy="18" r="4" fill="#84cc16" />
            </g>
          );
        default:
          return (
            <g stroke={colorTrunk} fill="none" strokeLinecap="round">
              <path d="M32 56 L32 30" strokeWidth="5" />
              <path d="M32 32 L18 16 M32 32 L46 16 M32 24 L32 10" strokeWidth="2.8" />
            </g>
          );
      }
    }

    if (kind === 'canopy') {
      return (
        <g>
          <circle cx="32" cy="26" r="14" fill={colorMain} opacity="0.85" />
          <circle cx="24" cy="30" r="9" fill={colorTip} opacity="0.75" />
          <circle cx="40" cy="28" r="8" fill={colorFlower} opacity="0.75" />
        </g>
      );
    }

    if (kind === 'bark') {
      const b = value as BarkType;
      const col = b === 'birch_paper' ? '#cbd5e1' : b === 'scifi_biolum_veins' ? '#1e1b4b' : colorTrunk;
      return <rect x="18" y="8" width="28" height="48" rx="5" fill={col} />;
    }

    return <circle cx="32" cy="32" r="12" fill={colorAccent} opacity="0.8" />;
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`rounded-md bg-[#090f18] border border-slate-700/80 shrink-0 ${className}`}
    >
      {renderGlyph()}
    </svg>
  );
};
