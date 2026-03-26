'use client'

import React, { useEffect, useState, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SurfBadgeCommand {
  name: string
  description?: string
  params?: Record<string, { type?: string; required?: boolean; description?: string }>
}

export interface SurfBadgeProps {
  /** The URL where the Surf manifest is served */
  endpoint: string
  /** App name */
  name?: string
  /** App description */
  description?: string
  /** Commands to embed for vision model discovery */
  commands?: SurfBadgeCommand[]
  /** Badge placement */
  /** Badge placement (default: bottom-left to avoid conflict with chat widgets) */
  position?: 'bottom-right' | 'bottom-left' | 'inline'
  /** Custom className */
  className?: string
  /** Force dark or light mode (auto-detects by default) */
  theme?: 'dark' | 'light' | 'auto'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMicroManifest(props: SurfBadgeProps): string {
  const lines = [
    `[SURF PROTOCOL — AI AGENT INTERFACE]`,
    `This website exposes structured commands for AI agents.`,
    `MANIFEST: ${props.endpoint}/.well-known/surf.json`,
    `CLI: surf exec ${props.endpoint.replace(/^https?:\/\//, '')} <command>`,
    `PING: surf ping ${props.endpoint.replace(/^https?:\/\//, '')}`,
  ]
  if (props.name) lines.push(`APP: ${props.name}`)
  if (props.description) lines.push(`ABOUT: ${props.description}`)
  if (props.commands?.length) {
    lines.push(`COMMANDS (${props.commands.length}):`)
    props.commands.forEach(cmd => {
      lines.push(`  → ${cmd.name}${cmd.description ? ' — ' + cmd.description : ''}`)
    })
  }
  return lines.join('\n')
}

// ─── Seal SVG ─────────────────────────────────────────────────────────────────

function Seal({ size, hue, dark, active }: { size: number; hue: number; dark: boolean; active: boolean }) {
  const r = size / 2
  const inner = r * 0.65
  const tickCount = 72

  const strokeMain = active
    ? dark
      ? `hsla(${190 + hue * 0.3}, 80%, 70%, 0.85)`
      : `hsla(${200 + hue * 0.3}, 70%, 45%, 0.8)`
    : dark
      ? `hsla(${200 + hue * 0.15}, 40%, 70%, 0.55)`
      : `hsla(${210 + hue * 0.15}, 45%, 35%, 0.6)`
  const strokeAccent = active
    ? dark
      ? `hsla(${260 + hue * 0.25}, 70%, 70%, 0.7)`
      : `hsla(${250 + hue * 0.25}, 60%, 50%, 0.6)`
    : dark
      ? `hsla(${260 + hue * 0.1}, 35%, 65%, 0.35)`
      : `hsla(${250 + hue * 0.1}, 40%, 45%, 0.4)`
  const textColor = active
    ? dark
      ? `hsla(${200 + hue * 0.3}, 60%, 75%, 0.8)`
      : `hsla(${210 + hue * 0.3}, 50%, 40%, 0.7)`
    : dark
      ? `hsla(${200 + hue * 0.15}, 30%, 65%, 0.5)`
      : `hsla(${210 + hue * 0.15}, 30%, 35%, 0.45)`
  const waveColor = active
    ? dark
      ? `hsla(${190 + hue * 0.3}, 85%, 75%, 0.95)`
      : `hsla(${200 + hue * 0.3}, 75%, 45%, 0.85)`
    : dark
      ? `hsla(${200 + hue * 0.15}, 50%, 75%, 0.7)`
      : `hsla(${210 + hue * 0.15}, 50%, 40%, 0.65)`

  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const angle = (i / tickCount) * Math.PI * 2
    const isMain = i % 6 === 0
    const isMid = i % 3 === 0
    const r1 = r * 0.80
    const r2 = isMain ? r * 0.94 : isMid ? r * 0.88 : r * 0.85
    return {
      x1: r + Math.cos(angle) * r1, y1: r + Math.sin(angle) * r1,
      x2: r + Math.cos(angle) * r2, y2: r + Math.sin(angle) * r2,
      w: isMain ? 0.6 : 0.25,
      o: isMain ? 0.7 : isMid ? 0.4 : 0.2,
    }
  })

  const guilloche = (offset: number, amp: number, freq: number, steps: number) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = (i / steps) * Math.PI * 2
      const wave = amp * Math.sin(a * freq + offset)
      const rad = inner * 0.45 + wave
      return `${r + Math.cos(a) * rad},${r + Math.sin(a) * rad}`
    }).join(' ')

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <defs>
        <clipPath id="sb-c"><circle cx={r} cy={r} r={r * 0.96} /></clipPath>
      </defs>
      <g clipPath="url(#sb-c)">
        <polyline points={guilloche(0, inner * 0.14, 9, 200)} fill="none" stroke={strokeAccent} strokeWidth="0.3" opacity="0.3" />
        <polyline points={guilloche(2, inner * 0.11, 13, 200)} fill="none" stroke={strokeMain} strokeWidth="0.25" opacity="0.2" />
        <polyline points={guilloche(4, inner * 0.09, 18, 200)} fill="none" stroke={strokeAccent} strokeWidth="0.2" opacity="0.15" />
        <circle cx={r} cy={r} r={r * 0.96} fill="none" stroke={strokeMain} strokeWidth="0.7" />
        <circle cx={r} cy={r} r={r * 0.78} fill="none" stroke={strokeMain} strokeWidth="0.25" opacity="0.3" />
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={strokeMain} strokeWidth={t.w} opacity={t.o} />
        ))}
        <circle cx={r} cy={r} r={inner} fill="none" stroke={strokeMain} strokeWidth="0.6" opacity="0.6" />
        <g transform={`translate(${r - inner * 0.4}, ${r - inner * 0.08})`}>
          <path
            d={`M0,${inner * 0.08} C${inner * 0.18},${-inner * 0.1} ${inner * 0.3},${inner * 0.26} ${inner * 0.44},${inner * 0.08} C${inner * 0.58},${-inner * 0.1} ${inner * 0.62},${inner * 0.26} ${inner * 0.8},${inner * 0.08}`}
            fill="none" stroke={waveColor} strokeWidth="1.4" strokeLinecap="round"
          />
        </g>
        <defs>
          <path id="sb-ct" d={`M ${r},${r} m ${-r * 0.7},0 a ${r * 0.7},${r * 0.7} 0 1,1 ${r * 1.4},0 a ${r * 0.7},${r * 0.7} 0 1,1 ${-r * 1.4},0`} />
        </defs>
        <text fill={textColor} fontSize={size * 0.08} fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="0.2em" fontWeight="600">
          <textPath href="#sb-ct" startOffset="3%">
            SURF PROTOCOL ✦ VERIFIED ✦ AI-NATIVE ✦
          </textPath>
        </text>
      </g>
    </svg>
  )
}

// ─── SurfBadge ────────────────────────────────────────────────────────────────

export function SurfBadge({
  endpoint,
  name,
  description,
  commands = [],
  position = 'bottom-left',
  className = '',
  theme = 'auto',
}: SurfBadgeProps) {
  const [hue, setHue] = useState(0)
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false
    if (theme !== 'auto') return theme === 'dark'
    const el = document.documentElement
    if (el.classList.contains('dark') || el.classList.contains('light')) {
      return el.classList.contains('dark')
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [mounted, setMounted] = useState(false)
  const [hovered, setHovered] = useState(false)
  const rafRef = useRef(0)
  const microManifest = buildMicroManifest({ endpoint, name, description, commands })
  const cleanEndpoint = endpoint.replace(/^https?:\/\//, '')

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (theme !== 'auto') { setDark(theme === 'dark'); return }
    const check = () => {
      const el = document.documentElement
      const hasExplicitDark = el.classList.contains('dark')
      const hasExplicitLight = el.classList.contains('light')
      if (hasExplicitDark || hasExplicitLight) {
        setDark(hasExplicitDark)
      } else {
        setDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
      }
    }
    check()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', check)
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { mq.removeEventListener('change', check); obs.disconnect() }
  }, [theme])

  useEffect(() => {
    let start: number | null = null
    const tick = (ts: number) => {
      if (!start) start = ts
      setHue(((ts - start) / 120) % 360)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const posStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { position: 'fixed', bottom: 18, right: 18, zIndex: 9999 },
    'bottom-left': { position: 'fixed', bottom: 18, left: 18, zIndex: 9999 },
    'inline': { position: 'relative', display: 'inline-flex' },
  }

  const sealSize = 38

  return (
    <>
      <div
        aria-hidden="true"
        data-surf-badge="true"
        data-surf-endpoint={endpoint}
        data-surf-manifest={`${endpoint}/.well-known/surf.json`}
        data-surf-commands={commands.map(c => c.name).join(',')}
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'pre' }}
      >
        {microManifest}
      </div>

      <div
        className={className}
        style={{
          ...posStyles[position],
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          visibility: mounted ? 'visible' : 'hidden',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* ─── Hover Panel ─────────────────────────────────────── */}
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 10,
          width: 280,
          opacity: hovered ? 1 : 0,
          transform: hovered ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.97)',
          transition: 'all 350ms cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: hovered ? 'auto' : 'none',
          background: dark ? 'rgba(12,12,16,0.94)' : 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: 14,
          border: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
          boxShadow: dark
            ? '0 20px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03)'
            : '0 20px 48px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04)',
          padding: '16px 18px',
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700, marginBottom: 6, lineHeight: 1.3,
            color: dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
          }}>
            This site speaks Surf
          </div>
          <div style={{
            fontSize: 11, lineHeight: 1.5, marginBottom: 14,
            color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)',
          }}>
            AI agents can read and interact with this site through structured commands — no scraping needed.
          </div>

          {commands.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
                letterSpacing: '0.1em', marginBottom: 8,
                color: dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
              }}>
                {commands.length} thing{commands.length !== 1 ? 's' : ''} agents can do
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                {commands.slice(0, 6).map(cmd => (
                  <span key={cmd.name} style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 6,
                    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                    border: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                  }}>
                    {cmd.description || cmd.name}
                  </span>
                ))}
                {commands.length > 6 && (
                  <span style={{ fontSize: 10, padding: '3px 8px', color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}>
                    +{commands.length - 6} more
                  </span>
                )}
              </div>
            </div>
          )}

          <div style={{
            paddingTop: 12,
            borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 9, color: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)' }}>
              Surf Protocol
            </span>
            <a href="https://surf.codes" target="_blank" rel="noopener noreferrer" style={{
              fontSize: 10, fontWeight: 500, textDecoration: 'none',
              color: dark ? 'rgba(0,212,255,0.6)' : 'rgba(0,150,190,0.6)',
            }}>
              Learn more →
            </a>
          </div>
        </div>

        {/* ─── Badge Pill ──────────────────────────────────────── */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '5px 14px 5px 5px', borderRadius: sealSize, cursor: 'default',
          background: hovered
            ? dark
              ? 'linear-gradient(135deg, rgba(0,212,255,0.12) 0%, rgba(123,97,255,0.08) 50%, rgba(255,107,157,0.06) 100%)'
              : 'linear-gradient(135deg, rgba(0,180,220,0.12) 0%, rgba(100,80,200,0.08) 50%, rgba(220,90,130,0.04) 100%)'
            : dark ? 'rgba(255,255,255,0.03)' : 'rgba(240,243,248,0.95)',
          border: hovered
            ? `1px solid ${dark ? 'rgba(0,212,255,0.2)' : 'rgba(0,150,200,0.25)'}`
            : `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)'}`,
          boxShadow: hovered
            ? dark
              ? '0 4px 24px rgba(0,212,255,0.15), 0 8px 40px rgba(123,97,255,0.1), inset 0 1px 0 rgba(255,255,255,0.06)'
              : '0 4px 24px rgba(0,150,200,0.15), 0 8px 40px rgba(100,80,200,0.08), 0 0 0 1px rgba(0,150,200,0.1)'
            : dark ? 'none' : '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)',
          transition: 'all 500ms cubic-bezier(0.16, 1, 0.3, 1)',
          transform: hovered ? 'translateY(-2px) scale(1.04)' : 'scale(1)',
          opacity: hovered ? 1 : dark ? 0.55 : 1,
          userSelect: 'none' as const,
        }}
          role="status"
          aria-label={`Surf-enabled: ${name || endpoint}. ${commands.length} commands available for AI agents.`}
        >
          <div style={{
            width: sealSize, height: sealSize, flexShrink: 0,
            opacity: hovered ? 1 : 0.65,
            transition: 'all 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            transform: hovered ? 'rotate(8deg) scale(1.12)' : 'rotate(0) scale(1)',
            filter: hovered
              ? dark
                ? 'drop-shadow(0 0 8px rgba(0,212,255,0.35)) brightness(1.2)'
                : 'drop-shadow(0 0 8px rgba(0,160,200,0.25)) brightness(1.1)'
              : 'none',
          }}>
            <Seal size={sealSize} hue={hue} dark={dark} active={hovered} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', lineHeight: 1.2,
              transition: 'color 400ms ease',
              color: hovered
                ? dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)'
                : dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.5)',
            }}>
              Surf-Enabled
            </span>
            <span style={{
              fontSize: 8, letterSpacing: '0.04em', lineHeight: 1.2,
              transition: 'color 400ms ease',
              color: hovered
                ? dark ? 'rgba(0,212,255,0.65)' : 'rgba(0,150,190,0.55)'
                : dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.3)',
            }}>
              Open for AI agents
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
