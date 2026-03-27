'use client'

import React, { useEffect, useState, useRef, useContext } from 'react'
import { SurfContext } from './context.js'
import { registerWindowSurfHttp } from './window-surf.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SurfBadgeCommand {
  name: string
  description?: string
  params?: Record<string, { type?: string; required?: boolean; description?: string }>
}

export interface SurfBadgeProps {
  endpoint: string
  name?: string
  description?: string
  commands?: SurfBadgeCommand[]
  /** Badge placement (default: bottom-left to avoid conflict with chat widgets) */
  position?: 'bottom-right' | 'bottom-left' | 'inline'
  /** Force dark or light mode (auto-detects by default) */
  theme?: 'dark' | 'light' | 'auto'
  /** Custom className */
  className?: string
}

// ─── Psychedelic keyframes (injected once) ────────────────────────────────────

const PSYCH_ID = 'surf-psych-fx'
const PSYCH_CSS = `
@keyframes surfSealSpin {
  0% { transform: rotate(0deg) scale(1.1); }
  50% { transform: rotate(180deg) scale(1.18); }
  100% { transform: rotate(360deg) scale(1.1); }
}
@keyframes surfGlowPulse {
  0%, 100% {
    filter: drop-shadow(0 0 10px rgba(255,0,128,0.5)) drop-shadow(0 0 24px rgba(0,212,255,0.3)) saturate(2.5) brightness(1.3);
  }
  33% {
    filter: drop-shadow(0 0 10px rgba(0,212,255,0.5)) drop-shadow(0 0 24px rgba(123,97,255,0.3)) saturate(2.8) brightness(1.4);
  }
  66% {
    filter: drop-shadow(0 0 10px rgba(123,97,255,0.5)) drop-shadow(0 0 24px rgba(255,0,128,0.3)) saturate(2.5) brightness(1.3);
  }
}
@keyframes surfCardBreathe {
  0%, 100% { box-shadow: 0 0 40px rgba(0,212,255,0.12), 0 20px 60px rgba(0,0,0,0.3); }
  50% { box-shadow: 0 0 50px rgba(123,97,255,0.15), 0 20px 60px rgba(0,0,0,0.3); }
}
@keyframes surfCardBreatheLight {
  0%, 100% { box-shadow: 0 0 30px rgba(0,180,220,0.08), 0 20px 50px rgba(0,0,0,0.06); }
  50% { box-shadow: 0 0 35px rgba(123,97,255,0.08), 0 20px 50px rgba(0,0,0,0.06); }
}
@keyframes surfShimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes surfPillFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1px); }
}
@keyframes surfBadgePulse {
  0%, 100% { transform: scale(1.06); }
  50% { transform: scale(1.12); }
}
@keyframes surfBorderShift {
  0%, 100% { border-color: rgba(0,212,255,0.25); }
  33% { border-color: rgba(123,97,255,0.25); }
  66% { border-color: rgba(200,80,180,0.2); }
}
@keyframes surfBorderShiftLight {
  0%, 100% { border-color: rgba(0,180,220,0.2); }
  33% { border-color: rgba(123,97,255,0.18); }
  66% { border-color: rgba(180,70,160,0.15); }
}
`

function injectPsychStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(PSYCH_ID)) return
  const s = document.createElement('style')
  s.id = PSYCH_ID
  s.textContent = PSYCH_CSS
  document.head.appendChild(s)
}

// ─── Machine-readable hidden context ──────────────────────────────────────────

function buildMicroManifest(props: SurfBadgeProps): string {
  const lines = [
    `[SURF PROTOCOL — AI AGENT INTERFACE]`,
    `MANIFEST: ${props.endpoint}/.well-known/surf.json`,
    `CLI: surf exec ${props.endpoint.replace(/^https?:\/\//, '')} <command>`,
  ]
  if (props.name) lines.push(`APP: ${props.name}`)
  if (props.commands?.length) {
    lines.push(`COMMANDS (${props.commands.length}):`)
    props.commands.forEach(cmd => {
      lines.push(`  → ${cmd.name}${cmd.description ? ' — ' + cmd.description : ''}`)
    })
  }
  return lines.join('\n')
}

// ─── The Seal — data encoded in circular text paths ───────────────────────────

function Seal({
  size, hue, dark, active, endpoint, commandCount,
}: {
  size: number; hue: number; dark: boolean; active: boolean
  endpoint: string; commandCount: number
}) {
  const r = size / 2
  const inner = r * 0.62
  const tickCount = 72
  const domain = endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const strokeMain = active
    ? dark
      ? `hsla(${190 + hue * 0.3}, 80%, 70%, 0.9)`
      : `hsla(${200 + hue * 0.3}, 70%, 45%, 0.85)`
    : dark
      ? `hsla(${200 + hue * 0.15}, 40%, 70%, 0.55)`
      : `hsla(${210 + hue * 0.15}, 45%, 35%, 0.6)`
  const strokeAccent = active
    ? dark
      ? `hsla(${260 + hue * 0.25}, 70%, 70%, 0.75)`
      : `hsla(${250 + hue * 0.25}, 60%, 50%, 0.65)`
    : dark
      ? `hsla(${260 + hue * 0.1}, 35%, 65%, 0.35)`
      : `hsla(${250 + hue * 0.1}, 40%, 45%, 0.4)`
  const textColor = active
    ? dark
      ? `hsla(${200 + hue * 0.3}, 60%, 75%, 0.85)`
      : `hsla(${210 + hue * 0.3}, 50%, 40%, 0.75)`
    : dark
      ? `hsla(${200 + hue * 0.15}, 30%, 65%, 0.45)`
      : `hsla(${210 + hue * 0.15}, 30%, 35%, 0.4)`
  const waveColor = active
    ? dark
      ? `hsla(${190 + hue * 0.3}, 85%, 75%, 0.95)`
      : `hsla(${200 + hue * 0.3}, 75%, 45%, 0.9)`
    : dark
      ? `hsla(${200 + hue * 0.15}, 50%, 75%, 0.7)`
      : `hsla(${210 + hue * 0.15}, 50%, 40%, 0.65)`
  const dataColor = active
    ? dark
      ? `hsla(${200 + hue * 0.2}, 40%, 65%, 0.6)`
      : `hsla(${210 + hue * 0.2}, 35%, 45%, 0.5)`
    : dark
      ? `hsla(${200 + hue * 0.15}, 25%, 60%, 0.3)`
      : `hsla(${210 + hue * 0.15}, 25%, 40%, 0.25)`

  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const angle = (i / tickCount) * Math.PI * 2
    const isMain = i % 6 === 0
    const isMid = i % 3 === 0
    const r1 = r * 0.78
    const r2 = isMain ? r * 0.93 : isMid ? r * 0.87 : r * 0.84
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

  const outerText = `SURF ✦ ${domain.toUpperCase()} ✦ ${commandCount} CMD${commandCount !== 1 ? 'S' : ''} ✦`
  const innerText = `/.well-known/surf.json ✦ surf exec ${domain} ✦`
  const uid = useRef(`sb-${Math.random().toString(36).slice(2, 8)}`).current

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <defs>
        <clipPath id={`${uid}-clip`}><circle cx={r} cy={r} r={r * 0.97} /></clipPath>
        <path id={`${uid}-outer`} d={`M ${r},${r} m ${-r * 0.72},0 a ${r * 0.72},${r * 0.72} 0 1,1 ${r * 1.44},0 a ${r * 0.72},${r * 0.72} 0 1,1 ${-r * 1.44},0`} />
        <path id={`${uid}-inner`} d={`M ${r},${r} m ${-r * 0.53},0 a ${r * 0.53},${r * 0.53} 0 1,1 ${r * 1.06},0 a ${r * 0.53},${r * 0.53} 0 1,1 ${-r * 1.06},0`} />
      </defs>
      <g clipPath={`url(#${uid}-clip)`}>
        <polyline points={guilloche(0, inner * 0.14, 9, 200)} fill="none" stroke={strokeAccent} strokeWidth="0.3" opacity="0.3" />
        <polyline points={guilloche(2, inner * 0.11, 13, 200)} fill="none" stroke={strokeMain} strokeWidth="0.25" opacity="0.2" />
        <polyline points={guilloche(4, inner * 0.09, 18, 200)} fill="none" stroke={strokeAccent} strokeWidth="0.2" opacity="0.15" />
        <circle cx={r} cy={r} r={r * 0.96} fill="none" stroke={strokeMain} strokeWidth="0.7" />
        <circle cx={r} cy={r} r={r * 0.76} fill="none" stroke={strokeMain} strokeWidth="0.25" opacity="0.3" />
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={strokeMain} strokeWidth={t.w} opacity={t.o} />
        ))}
        <circle cx={r} cy={r} r={inner} fill="none" stroke={strokeMain} strokeWidth="0.6" opacity="0.6" />
        <g transform={`translate(${r - inner * 0.38}, ${r - inner * 0.06})`}>
          <path
            d={`M0,${inner * 0.06} C${inner * 0.16},${-inner * 0.09} ${inner * 0.28},${inner * 0.22} ${inner * 0.42},${inner * 0.06} C${inner * 0.56},${-inner * 0.09} ${inner * 0.58},${inner * 0.22} ${inner * 0.76},${inner * 0.06}`}
            fill="none" stroke={waveColor} strokeWidth="1.4" strokeLinecap="round"
          />
        </g>
        <text fill={textColor} fontSize={size * 0.075} fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="0.18em" fontWeight="700">
          <textPath href={`#${uid}-outer`} startOffset="2%">{outerText}</textPath>
        </text>
        <text fill={dataColor} fontSize={size * 0.048} fontFamily="'SF Mono', 'JetBrains Mono', monospace" letterSpacing="0.08em" fontWeight="500">
          <textPath href={`#${uid}-inner`} startOffset="0%">{innerText}</textPath>
        </text>
      </g>
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SurfBadge({
  endpoint,
  name,
  description,
  commands = [],
  position = 'bottom-left',
  theme = 'auto',
  className = '',
}: SurfBadgeProps) {
  const [hue, setHue] = useState(0)
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false
    if (theme !== 'auto') return theme === 'dark'
    const el = document.documentElement
    if (el.classList.contains('dark') || el.classList.contains('light')) return el.classList.contains('dark')
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [mounted, setMounted] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const rafRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const microManifest = buildMicroManifest({ endpoint, name, description, commands })

  useEffect(() => {
    setMounted(true)
    injectPsychStyles()
  }, [])

  // Register window.surf with HTTP-only server executor when no SurfProvider is present
  const surfCtx = useContext(SurfContext)
  useEffect(() => {
    // If SurfProvider is active, it handles window.surf registration (WS executor)
    if (surfCtx) return
    const cleanup = registerWindowSurfHttp(endpoint)
    return cleanup
  }, [endpoint, surfCtx])

  // Theme detection
  useEffect(() => {
    if (theme !== 'auto') { setDark(theme === 'dark'); return }
    const check = () => {
      const el = document.documentElement
      const hasExplicitDark = el.classList.contains('dark')
      const hasExplicitLight = el.classList.contains('light')
      if (hasExplicitDark || hasExplicitLight) { setDark(hasExplicitDark) }
      else { setDark(window.matchMedia('(prefers-color-scheme: dark)').matches) }
    }
    check()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', check)
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { mq.removeEventListener('change', check); obs.disconnect() }
  }, [theme])

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Click outside to close psychedelic mode
  useEffect(() => {
    if (!pressed) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPressed(false)
      }
    }
    const t = setTimeout(() => document.addEventListener('click', handler), 50)
    return () => { clearTimeout(t); document.removeEventListener('click', handler) }
  }, [pressed])

  // Ambient hue drift
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
    'bottom-right': { position: 'fixed', bottom: 16, right: 16, zIndex: 9999 },
    'bottom-left': { position: 'fixed', bottom: 16, left: 16, zIndex: 9999 },
    'inline': { position: 'relative', display: 'inline-flex' },
  }

  const sealSize = isMobile ? 34 : 40

  // Derived states
  const psychedelic = pressed
  const expanded = (hovered && !isMobile) || pressed
  const showPanel = expanded
  const displayHue = psychedelic ? hue * 5 : hue

  return (
    <>
      {/* Hidden machine context */}
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
        ref={containerRef}
        className={className}
        style={{
          ...posStyles[position],
          visibility: mounted ? 'visible' : 'hidden',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* ─── Info Panel ──────────────────────────────────────── */}
        <div style={{
          position: 'absolute',
          bottom: '100%',
          [position === 'bottom-right' ? 'right' : 'left']: 0,
          marginBottom: 10,
          width: psychedelic ? 300 : 280,
          opacity: showPanel ? 1 : 0,
          transform: showPanel
            ? 'translateY(0) scale(1)'
            : 'translateY(8px) scale(0.92)',
          transition: psychedelic
            ? 'all 500ms cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'all 350ms cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: showPanel ? 'auto' : 'none',
          borderRadius: 16,
          background: psychedelic
            ? dark
              ? `radial-gradient(ellipse at 30% 0%, hsla(${displayHue + 200}, 50%, 30%, 0.12), transparent 60%), radial-gradient(ellipse at 70% 100%, hsla(${displayHue}, 45%, 25%, 0.1), transparent 60%), rgba(12, 10, 22, 0.35)`
              : `radial-gradient(ellipse at 30% 0%, hsla(${displayHue + 200}, 40%, 85%, 0.15), transparent 60%), radial-gradient(ellipse at 70% 100%, hsla(${displayHue}, 35%, 88%, 0.12), transparent 60%), rgba(255, 255, 255, 0.25)`
            : dark ? 'rgba(12,12,16,0.94)' : 'rgba(255,255,255,0.96)',
          backdropFilter: psychedelic ? 'blur(40px) saturate(1.4)' : 'blur(24px)',
          WebkitBackdropFilter: psychedelic ? 'blur(40px) saturate(1.4)' : 'blur(24px)',
          border: psychedelic
            ? `1px solid ${dark ? 'rgba(0,212,255,0.2)' : 'rgba(0,180,220,0.15)'}`
            : `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
          boxShadow: psychedelic
            ? undefined
            : dark
              ? '0 20px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03)'
              : '0 20px 48px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.04)',
          animation: psychedelic
            ? dark
              ? 'surfCardBreathe 4s ease-in-out infinite, surfBorderShift 6s ease-in-out infinite'
              : 'surfCardBreatheLight 4s ease-in-out infinite, surfBorderShiftLight 6s ease-in-out infinite'
            : 'none',
          padding: '16px 18px',
        }}>
            {/* Title */}
            <div style={{
              fontSize: psychedelic ? 14 : 13,
              fontWeight: psychedelic ? 800 : 700,
              marginBottom: 6,
              lineHeight: 1.3,
              ...(psychedelic ? {
                background: dark
                  ? 'linear-gradient(90deg, rgba(0,212,255,0.9), rgba(160,120,255,0.85), rgba(0,212,255,0.9))'
                  : 'linear-gradient(90deg, rgba(0,160,200,0.85), rgba(120,80,220,0.8), rgba(0,160,200,0.85))',
                backgroundSize: '200% auto',
                animation: 'surfShimmer 4s linear infinite',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              } as React.CSSProperties : {
                color: dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
              }),
            }}>
              {psychedelic ? '✦ This site speaks Surf' : 'This site speaks Surf'}
            </div>

            {/* Description */}
            <div style={{
              fontSize: 11, lineHeight: 1.5,
              marginBottom: commands.length ? 14 : 0,
              color: psychedelic
                ? dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)'
                : dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)',
            }}>
              AI agents can read and interact with this site through structured commands — no scraping needed.
            </div>

            {/* Command pills */}
            {commands.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
                  letterSpacing: '0.1em', marginBottom: 8,
                  color: psychedelic
                    ? dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'
                    : dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)',
                }}>
                  {commands.length} thing{commands.length !== 1 ? 's' : ''} agents can do
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                  {commands.slice(0, 6).map((cmd, i) => {
                    const pillHue = psychedelic ? (195 + (displayHue * 0.15) + i * 12) % 360 : 0
                    return (
                      <span key={cmd.name} style={{
                        fontSize: 10, padding: '3px 8px', borderRadius: 6,
                        background: psychedelic
                          ? dark
                            ? `hsla(${pillHue}, 40%, 20%, 0.35)`
                            : `hsla(${pillHue}, 30%, 92%, 0.5)`
                          : dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                        color: psychedelic
                          ? dark
                            ? `hsla(${pillHue}, 55%, 72%, 0.85)`
                            : `hsla(${pillHue}, 45%, 38%, 0.8)`
                          : dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                        border: `1px solid ${psychedelic
                          ? dark
                            ? `hsla(${pillHue}, 40%, 45%, 0.2)`
                            : `hsla(${pillHue}, 30%, 60%, 0.2)`
                          : dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                        animation: psychedelic ? `surfPillFloat 3s ease-in-out ${i * 0.25}s infinite` : 'none',
                        transition: 'all 500ms ease',
                      }}>
                        {cmd.description || cmd.name}
                      </span>
                    )
                  })}
                  {commands.length > 6 && (
                    <span style={{
                      fontSize: 10, padding: '3px 8px',
                      color: psychedelic
                        ? dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'
                        : dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                    }}>
                      +{commands.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{
              paddingTop: 12,
              borderTop: `1px solid ${psychedelic
                ? dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
                : dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{
                fontSize: 9,
                ...(psychedelic ? {
                  color: dark ? 'rgba(0,212,255,0.4)' : 'rgba(0,160,200,0.35)',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                } : {
                  color: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)',
                }),
              }}>
                Surf Protocol
              </span>
              <a href="https://surf.codes" target="_blank" rel="noopener noreferrer" style={{
                fontSize: 10, fontWeight: 500, textDecoration: 'none',
                color: psychedelic
                  ? dark ? 'rgba(0,212,255,0.85)' : 'rgba(0,150,190,0.8)'
                  : dark ? 'rgba(0,212,255,0.6)' : 'rgba(0,150,190,0.6)',
                ...(psychedelic ? {
                  textShadow: dark
                    ? '0 0 12px rgba(0,212,255,0.4)'
                    : '0 0 8px rgba(0,150,190,0.2)',
                } : {}),
              }}>
                Learn more →
              </a>
            </div>
        </div>

        {/* ─── The Badge ───────────────────────────────────────── */}
        <div
          onClick={() => setPressed(p => !p)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: expanded ? 10 : 0,
            padding: expanded ? '5px 14px 5px 5px' : '0',
            borderRadius: 999,
            cursor: 'pointer',
            background: psychedelic
              ? dark
                ? `linear-gradient(135deg, hsla(${displayHue}, 80%, 25%, 0.4), hsla(${(displayHue + 120) % 360}, 70%, 20%, 0.3), hsla(${(displayHue + 240) % 360}, 80%, 25%, 0.4))`
                : `linear-gradient(135deg, hsla(${displayHue}, 65%, 88%, 0.6), hsla(${(displayHue + 120) % 360}, 55%, 90%, 0.4), hsla(${(displayHue + 240) % 360}, 65%, 88%, 0.6))`
              : expanded
                ? dark
                  ? 'linear-gradient(135deg, rgba(0,212,255,0.12) 0%, rgba(123,97,255,0.08) 50%, rgba(255,107,157,0.06) 100%)'
                  : 'linear-gradient(135deg, rgba(0,180,220,0.12) 0%, rgba(100,80,200,0.08) 50%, rgba(220,90,130,0.04) 100%)'
                : 'transparent',
            border: psychedelic
              ? `1px solid ${dark ? `hsla(${displayHue}, 70%, 55%, 0.4)` : `hsla(${displayHue}, 55%, 60%, 0.35)`}`
              : expanded
                ? `1px solid ${dark ? 'rgba(0,212,255,0.2)' : 'rgba(0,150,200,0.25)'}`
                : '1px solid transparent',
            boxShadow: psychedelic
              ? dark
                ? `0 0 16px hsla(${displayHue}, 80%, 50%, 0.3), 0 0 40px hsla(${(displayHue + 120) % 360}, 70%, 45%, 0.15)`
                : `0 0 12px hsla(${displayHue}, 60%, 55%, 0.2), 0 0 30px hsla(${(displayHue + 120) % 360}, 50%, 55%, 0.1)`
              : expanded
                ? dark
                  ? '0 4px 24px rgba(0,212,255,0.15), 0 8px 40px rgba(123,97,255,0.1)'
                  : '0 4px 24px rgba(0,150,200,0.15), 0 8px 40px rgba(100,80,200,0.08)'
                : 'none',
            transition: 'all 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            transform: expanded ? 'translateY(-2px) scale(1.04)' : 'scale(1)',
            animation: psychedelic ? 'surfBadgePulse 3s ease-in-out infinite' : 'none',
            opacity: expanded ? 1 : dark ? 0.5 : 0.65,
            userSelect: 'none' as const,
            overflow: 'hidden',
          }}
          role="button"
          aria-label={`Surf-enabled: ${name || endpoint}. ${commands.length} commands available for AI agents. Click for details.`}
          aria-expanded={pressed}
        >
          <div style={{
            width: sealSize,
            height: sealSize,
            flexShrink: 0,
            transition: psychedelic ? 'none' : 'all 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            transform: psychedelic ? undefined : expanded ? 'rotate(8deg) scale(1.1)' : 'rotate(0) scale(1)',
            animation: psychedelic ? 'surfSealSpin 6s linear infinite, surfGlowPulse 3s ease-in-out infinite' : 'none',
            filter: !psychedelic && expanded
              ? dark
                ? 'drop-shadow(0 0 8px rgba(0,212,255,0.35)) brightness(1.2)'
                : 'drop-shadow(0 0 8px rgba(0,160,200,0.25)) brightness(1.1)'
              : !psychedelic ? 'none' : undefined,
          }}>
            <Seal
              size={sealSize}
              hue={displayHue}
              dark={dark}
              active={expanded}
              endpoint={endpoint}
              commandCount={commands.length}
            />
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            maxWidth: expanded ? 120 : 0,
            opacity: expanded ? 1 : 0,
            transition: 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)',
            overflow: 'hidden',
            whiteSpace: 'nowrap' as const,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', lineHeight: 1.2,
              ...(psychedelic ? {
                background: `linear-gradient(90deg, hsla(${displayHue}, 85%, 70%, 1), hsla(${(displayHue + 90) % 360}, 80%, 65%, 1))`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              } as React.CSSProperties : {
                color: dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)',
              }),
            }}>
              Surf-Enabled
            </span>
            <span style={{
              fontSize: 8, letterSpacing: '0.04em', lineHeight: 1.2,
              color: psychedelic
                ? dark ? `hsla(${(displayHue + 180) % 360}, 75%, 70%, 0.8)` : `hsla(${(displayHue + 180) % 360}, 55%, 40%, 0.7)`
                : dark ? 'rgba(0,212,255,0.65)' : 'rgba(0,150,190,0.55)',
            }}>
              Open for AI agents
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
