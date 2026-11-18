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
  const cacheKey =
    kind === 'tip'
      ? `part_tip_v7_${value}`
      : `part_${kind}_${value}_${colorTrunk}_${colorMain}_${colorFlower}`;
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

    if (kind === 'tip') {
      const t = value as SynthesizedTipPrimitive;
      switch (t) {
        case 'iridescent_bubble':
          return (
            <g>
              <circle cx="32" cy="28" r="15" fill="#38bdf8" opacity="0.65" stroke="#7dd3fc" strokeWidth="2" />
              <circle cx="26" cy="22" r="4.5" fill="#ffffff" opacity="0.85" />
              <circle cx="41" cy="35" r="5.5" fill="#c084fc" opacity="0.75" />
              <path d="M32 43 L32 58" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" />
            </g>
          );
        case 'dewy_droplet':
          return (
            <g>
              <path d="M32 14 C22 28, 19 36, 19 40 C19 47.5, 24.8 52, 32 52 C39.2 52, 45 47.5, 45 40 C45 36, 42 28, 32 14 Z" fill="#fbbf24" opacity="0.8" stroke="#f59e0b" strokeWidth="2" />
              <circle cx="27" cy="38" r="3.5" fill="#ffffff" opacity="0.9" />
            </g>
          );
        case 'micro_floret_star':
          return (
            <g>
              <path d="M32 14 L35 27 L48 27 L37 35 L41 48 L32 40 L23 48 L27 35 L16 27 L29 27 Z" fill="#f43f5e" stroke="#ffe4e6" strokeWidth="1.5" />
              <circle cx="32" cy="33" r="5" fill="#facc15" />
              <path d="M32 48 L32 58" stroke="#166534" strokeWidth="2.5" />
            </g>
          );
        case 'cupped_bell_calyx':
          return (
            <g>
              <path d="M20 22 C22 36, 26 44, 32 48 C38 44, 42 36, 44 22 C37 25, 27 25, 20 22 Z" fill="#06b6d4" stroke="#22d3ee" strokeWidth="2" />
              <circle cx="32" cy="30" r="4" fill="#f43f5e" />
              <path d="M32 48 L32 58" stroke="#1e3a5f" strokeWidth="3" strokeLinecap="round" />
            </g>
          );
        case 'faceted_crystal_gem':
          return (
            <g>
              <polygon points="32,10 46,24 40,50 24,50 18,24" fill="#a855f7" stroke="#38bdf8" strokeWidth="2" />
              <line x1="32" y1="10" x2="32" y2="50" stroke="#c084fc" strokeWidth="1.5" />
              <polygon points="32,10 46,24 32,28 18,24" fill="#c084fc" opacity="0.6" />
            </g>
          );
        case 'spotted_spore_dome':
          return (
            <g>
              <path d="M16 38 C16 22, 48 22, 48 38 Z" fill="#ef4444" stroke="#dc2626" strokeWidth="2" />
              <circle cx="25" cy="30" r="2.8" fill="#fef9c3" />
              <circle cx="34" cy="27" r="3" fill="#fef9c3" />
              <circle cx="41" cy="32" r="2.2" fill="#fef9c3" />
              <path d="M30 38 L30 54 M34 38 L34 54" stroke="#cbd5e1" strokeWidth="2.5" />
            </g>
          );
        case 'lanceolate_blade':
          return (
            <g fill="none" strokeLinecap="round">
              <path d="M32 56 C26 42, 16 32, 22 14 C30 26, 32 42, 32 56" fill="#059669" stroke="#84cc16" strokeWidth="2" />
              <path d="M32 56 C38 42, 48 32, 42 14 C34 26, 32 42, 32 56" fill="#10b981" stroke="#84cc16" strokeWidth="2" />
            </g>
          );
        case 'bryophyte_moss_pad':
          return (
            <g>
              <ellipse cx="32" cy="38" rx="16" ry="10" fill="#4d7c0f" />
              <circle cx="24" cy="32" r="6" fill="#84cc16" />
              <circle cx="32" cy="28" r="7.5" fill="#a3e635" />
              <circle cx="40" cy="33" r="6" fill="#84cc16" />
              <path d="M32 48 L32 58" stroke="#78350f" strokeWidth="3" />
            </g>
          );
        case 'scifi_plasma_orb':
          return (
            <g>
              <circle cx="32" cy="30" r="11" fill="#00f0ff" stroke="#ffffff" strokeWidth="1.5" />
              <ellipse cx="32" cy="30" rx="18" ry="6" fill="none" stroke="#a855f7" strokeWidth="2" strokeDasharray="3 2" transform="rotate(-20 32 30)" />
              <path d="M32 42 L32 58" stroke="#0f172a" strokeWidth="3" />
            </g>
          );
        case 'spiked_seed_burr':
          return (
            <g>
              <g stroke="#d97706" strokeWidth="2" strokeLinecap="round">
                <line x1="32" y1="12" x2="32" y2="48" />
                <line x1="14" y1="30" x2="50" y2="30" />
                <line x1="19" y1="17" x2="45" y2="43" />
                <line x1="45" y1="17" x2="19" y2="43" />
              </g>
              <circle cx="32" cy="30" r="8" fill="#92400e" stroke="#fde047" strokeWidth="1.5" />
            </g>
          );
        case 'winged_helicoid_seed':
          return (
            <g>
              <ellipse cx="32" cy="42" rx="6" ry="7" fill="#92400e" />
              <path d="M32 40 C34 26, 46 16, 44 10 C40 16, 32 26, 32 40" fill="#10b981" stroke="#a3e635" strokeWidth="1.5" />
              <path d="M30 40 C28 28, 18 20, 20 14 C24 18, 30 28, 30 40" fill="#059669" stroke="#84cc16" strokeWidth="1.5" />
            </g>
          );
        case 'crowned_pomegranate_pod':
          return (
            <g>
              <circle cx="32" cy="36" r="13" fill="#e11d48" stroke="#991b1b" strokeWidth="2" />
              <polygon points="24,24 26,16 29,22 32,14 35,22 38,16 40,24" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
              <path d="M32 49 L32 58" stroke="#78350f" strokeWidth="3" />
            </g>
          );
        case 'recurved_thorn_claw':
          return (
            <g>
              <path d="M22 52 C24 38, 30 24, 46 16 C38 28, 36 42, 34 52 Z" fill="#b91c1c" stroke="#fca5a5" strokeWidth="1.5" />
              <circle cx="26" cy="50" r="4" fill="#1e293b" />
            </g>
          );
        case 'feathery_pappus_plume':
          return (
            <g stroke="#f8fafc" strokeLinecap="round">
              <line x1="32" y1="36" x2="32" y2="54" stroke="#475569" strokeWidth="2.5" />
              <line x1="32" y1="36" x2="16" y2="16" strokeWidth="1.5" opacity="0.85" />
              <line x1="32" y1="36" x2="24" y2="12" strokeWidth="1.5" opacity="0.85" />
              <line x1="32" y1="36" x2="32" y2="10" strokeWidth="1.5" opacity="0.85" />
              <line x1="32" y1="36" x2="40" y2="12" strokeWidth="1.5" opacity="0.85" />
              <line x1="32" y1="36" x2="48" y2="16" strokeWidth="1.5" opacity="0.85" />
            </g>
          );
        case 'sucker_tentacle_cup':
          return (
            <g>
              <ellipse cx="32" cy="30" rx="14" ry="9" fill="#fb7185" stroke="#fda4af" strokeWidth="2" />
              <ellipse cx="32" cy="30" rx="7" ry="4.5" fill="#881337" />
              <path d="M32 39 C30 46, 32 52, 32 58" stroke="#f43f5e" strokeWidth="3.5" strokeLinecap="round" />
            </g>
          );
        case 'granulated_berry_cluster':
          return (
            <g>
              <circle cx="28" cy="26" r="5" fill="#c026d3" />
              <circle cx="36" cy="26" r="5" fill="#a21caf" />
              <circle cx="32" cy="33" r="5.5" fill="#e879f9" />
              <circle cx="25" cy="35" r="4.5" fill="#9333ea" />
              <circle cx="39" cy="35" r="4.5" fill="#7e22ce" />
              <circle cx="32" cy="42" r="5" fill="#a21caf" />
              <path d="M32 18 L32 24" stroke="#15803d" strokeWidth="2.5" />
            </g>
          );
        case 'fuzzy_pom_floret_tuft':
          return (
            <g>
              <circle cx="32" cy="30" r="13" fill="#facc15" stroke="#fde047" strokeWidth="2" strokeDasharray="3 2" />
              <circle cx="32" cy="30" r="7" fill="#eab308" />
              <path d="M32 43 L32 58" stroke="#15803d" strokeWidth="3" />
            </g>
          );
        default:
          return <circle cx="32" cy="32" r="12" fill={colorAccent} opacity="0.8" />;
      }
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
