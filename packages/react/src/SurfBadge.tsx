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

// ─── Brand ────────────────────────────────────────────────────────────────────

const SURF_BLUE = '#0057FF'

// ─── Minimal CSS (injected once) ──────────────────────────────────────────────

const STYLE_ID = 'surf-badge-css'
const BADGE_CSS = `
@keyframes surfExpand {
  from { opacity: 0; transform: translateY(6px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
`

function injectStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = BADGE_CSS
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

// ─── Inline wave mark (Surf brand symbol) ─────────────────────────────────────

function WaveMark({ size = 14, color = SURF_BLUE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
      <path d="M5 30 C9 30, 15 22, 20 18 C25 14, 31 10, 35 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <path d="M5 36 C11 36, 17 28, 22 24 C27 20, 33 16, 35 16" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
      <circle cx="35" cy="10" r="2.5" fill={color} />
    </svg>
  )
}

// ─── The Seal — circular text with domain info ────────────────────────────────

function Seal({ size, dark, endpoint, commandCount }: {
  size: number; dark: boolean; endpoint: string; commandCount: number
}) {
  const r = size / 2
  const inner = r * 0.62
  const tickCount = 72
  const domain = endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const strokeMain = dark ? 'rgba(0,87,255,0.7)' : 'rgba(0,87,255,0.65)'
  const strokeAccent = dark ? 'rgba(0,87,255,0.4)' : 'rgba(0,87,255,0.35)'
  const textColor = dark ? 'rgba(0,130,255,0.75)' : 'rgba(0,70,200,0.65)'
  const waveColor = dark ? 'rgba(0,120,255,0.9)' : 'rgba(0,87,255,0.85)'
  const dataColor = dark ? 'rgba(0,100,255,0.45)' : 'rgba(0,70,200,0.35)'

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
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false
    if (theme !== 'auto') return theme === 'dark'
    const el = document.documentElement
    if (el.classList.contains('dark') || el.classList.contains('light')) return el.classList.contains('dark')
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [mounted, setMounted] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const microManifest = buildMicroManifest({ endpoint, name, description, commands })

  useEffect(() => { setMounted(true); injectStyles() }, [])

  // Register window.surf when no SurfProvider present
  const surfCtx = useContext(SurfContext)
  useEffect(() => {
    if (surfCtx) return
    return registerWindowSurfHttp(endpoint)
  }, [endpoint, surfCtx])

  // Theme detection
  useEffect(() => {
    if (theme !== 'auto') { setDark(theme === 'dark'); return }
    const check = () => {
      const el = document.documentElement
      if (el.classList.contains('dark') || el.classList.contains('light')) {
        setDark(el.classList.contains('dark'))
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

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Click outside to collapse
  useEffect(() => {
    if (!expanded) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    const t = setTimeout(() => document.addEventListener('click', handler), 50)
    return () => { clearTimeout(t); document.removeEventListener('click', handler) }
  }, [expanded])

  const posStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { position: 'fixed', bottom: 16, right: 16, zIndex: 9999 },
    'bottom-left': { position: 'fixed', bottom: 16, left: 16, zIndex: 9999 },
    'inline': { position: 'relative', display: 'inline-flex' },
  }

  const sealSize = isMobile ? 34 : 40
  const isOpen = (hovered && !isMobile) || expanded

  const handleClick = () => {
    if (isMobile) {
      setExpanded(p => !p)
    } else {
      setExpanded(p => !p)
    }
  }

  // Colors derived from theme
  const blue = SURF_BLUE
  const blueAlpha = (a: number) => `rgba(0,87,255,${a})`

  return (
    <>
      {/* Hidden machine-readable context for AI agents */}
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
        onMouseLeave={() => { setHovered(false) }}
      >
        {/* ─── Info Panel ──────────────────────────────────────── */}
        <div style={{
          position: 'absolute',
          bottom: '100%',
          [position === 'bottom-right' ? 'right' : 'left']: 0,
          marginBottom: 10,
          width: 280,
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.95)',
          transition: 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: isOpen ? 'auto' : 'none',
          borderRadius: 14,
          background: dark ? 'rgba(12,12,20,0.92)' : 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: `1px solid ${dark ? blueAlpha(0.15) : blueAlpha(0.1)}`,
          boxShadow: dark
            ? `0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px ${blueAlpha(0.06)}`
            : `0 16px 48px rgba(0,0,0,0.1), 0 0 0 1px ${blueAlpha(0.06)}`,
          padding: '16px 18px',
        }}>
          {/* Title with wave mark */}
          <div style={{
            fontSize: 13, fontWeight: 700, marginBottom: 6, lineHeight: 1.3,
            color: dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center',
          }}>
            <WaveMark size={15} color={dark ? blueAlpha(0.9) : blue} />
            This site speaks Surf
          </div>

          {/* Description */}
          <div style={{
            fontSize: 11, lineHeight: 1.5,
            marginBottom: commands.length ? 14 : 0,
            color: dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)',
          }}>
            AI agents can read and interact with this site through structured commands — no scraping needed.
          </div>

          {/* Command pills */}
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
                    background: dark ? blueAlpha(0.08) : blueAlpha(0.05),
                    color: dark ? blueAlpha(0.7) : blueAlpha(0.65),
                    border: `1px solid ${dark ? blueAlpha(0.1) : blueAlpha(0.08)}`,
                    transition: 'all 200ms ease',
                  }}>
                    {cmd.description || cmd.name}
                  </span>
                ))}
                {commands.length > 6 && (
                  <span style={{
                    fontSize: 10, padding: '3px 8px',
                    color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
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
            borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{
              fontSize: 9,
              color: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)',
            }}>
              Surf Protocol
            </span>
            <a href="https://surf.codes" target="_blank" rel="noopener noreferrer" style={{
              fontSize: 10, fontWeight: 500, textDecoration: 'none',
              color: dark ? blueAlpha(0.75) : blueAlpha(0.7),
            }}>
              Learn more →
            </a>
          </div>
        </div>

        {/* ─── The Badge ───────────────────────────────────────── */}
        <div
          onClick={handleClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: isOpen ? 10 : 0,
            padding: isOpen ? '5px 14px 5px 5px' : '0',
            borderRadius: 999,
            cursor: 'pointer',
            background: isOpen
              ? dark
                ? `linear-gradient(135deg, ${blueAlpha(0.12)}, ${blueAlpha(0.06)})`
                : `linear-gradient(135deg, ${blueAlpha(0.1)}, ${blueAlpha(0.04)})`
              : 'transparent',
            border: isOpen
              ? `1px solid ${dark ? blueAlpha(0.2) : blueAlpha(0.15)}`
              : '1px solid transparent',
            boxShadow: isOpen
              ? dark
                ? `0 4px 20px ${blueAlpha(0.15)}`
                : `0 4px 20px ${blueAlpha(0.1)}`
              : 'none',
            transition: 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)',
            transform: isOpen ? 'translateY(-2px)' : 'none',
            opacity: isOpen ? 1 : dark ? 0.5 : 0.65,
            userSelect: 'none' as const,
            overflow: 'hidden',
          }}
          role="button"
          aria-label={`Surf-enabled: ${name || endpoint}. ${commands.length} commands available for AI agents. Click for details.`}
          aria-expanded={isOpen}
        >
          <div style={{
            width: sealSize,
            height: sealSize,
            flexShrink: 0,
            transition: 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)',
            transform: isOpen ? 'rotate(8deg) scale(1.08)' : 'rotate(0) scale(1)',
            filter: isOpen
              ? `drop-shadow(0 0 6px ${blueAlpha(0.3)})`
              : 'none',
          }}>
            <Seal
              size={sealSize}
              dark={dark}
              endpoint={endpoint}
              commandCount={commands.length}
            />
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            maxWidth: isOpen ? 120 : 0,
            opacity: isOpen ? 1 : 0,
            transition: 'all 350ms cubic-bezier(0.16, 1, 0.3, 1)',
            overflow: 'hidden',
            whiteSpace: 'nowrap' as const,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', lineHeight: 1.2,
              color: dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)',
            }}>
              Surf-Enabled
            </span>
            <span style={{
              fontSize: 8, letterSpacing: '0.04em', lineHeight: 1.2,
              color: dark ? blueAlpha(0.7) : blueAlpha(0.6),
            }}>
              Open for AI agents
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
