'use client'

import React, { useEffect, useState, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SurfBadgeCommand {
  name: string
  description?: string
  params?: Record<string, { type?: string; required?: boolean; description?: string }>
}

export interface SurfBadgeProps {
  /** The URL where the Surf manifest is served (e.g. "https://myapp.com") */
  endpoint: string
  /** App name shown on the badge */
  name?: string
  /** App description */
  description?: string
  /** Commands to embed in the badge for vision model discovery */
  commands?: SurfBadgeCommand[]
  /** Badge placement */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'inline'
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Custom className for the outer container */
  className?: string
  /** Show expanded detail view on hover (default true) */
  expandOnHover?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compactParams(params?: SurfBadgeCommand['params']): string {
  if (!params) return ''
  return Object.entries(params)
    .map(([k, v]) => `${k}${v.required ? '*' : ''}:${v.type || 'any'}`)
    .join(',')
}

function buildMicroManifest(props: SurfBadgeProps): string {
  const lines: string[] = [
    `SURF_ENDPOINT=${props.endpoint}/.well-known/surf.json`,
    `SURF_CLI=surf exec ${props.endpoint}`,
  ]
  if (props.name) lines.push(`APP=${props.name}`)
  if (props.description) lines.push(`DESC=${props.description}`)
  if (props.commands?.length) {
    lines.push(`COMMANDS=${props.commands.length}`)
    props.commands.forEach((cmd) => {
      const p = compactParams(cmd.params)
      lines.push(`  ${cmd.name}(${p})${cmd.description ? ' — ' + cmd.description : ''}`)
    })
  }
  return lines.join('\n')
}

// ─── Badge dimensions ─────────────────────────────────────────────────────────

const SIZES = {
  sm: { w: 200, h: 56, seal: 36, fontSize: 9, labelSize: 7 },
  md: { w: 260, h: 68, seal: 44, fontSize: 10, labelSize: 8 },
  lg: { w: 320, h: 80, seal: 52, fontSize: 11, labelSize: 9 },
}

// ─── Holographic Seal SVG ─────────────────────────────────────────────────────

function HolographicSeal({ size, animate }: { size: number; animate: boolean }) {
  const r = size / 2
  const inner = r * 0.7
  const tickCount = 48
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const angle = (i / tickCount) * Math.PI * 2
    const r1 = r * 0.82
    const r2 = i % 3 === 0 ? r * 0.92 : r * 0.87
    return {
      x1: r + Math.cos(angle) * r1,
      y1: r + Math.sin(angle) * r1,
      x2: r + Math.cos(angle) * r2,
      y2: r + Math.sin(angle) * r2,
    }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="surf-holo-1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.9" />
          <stop offset="25%" stopColor="#7B61FF" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#FF6B9D" stopOpacity="0.7" />
          <stop offset="75%" stopColor="#00E5A0" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#00D4FF" stopOpacity="0.9" />
          {animate && (
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              values="0 0.5 0.5;360 0.5 0.5"
              dur="8s"
              repeatCount="indefinite"
            />
          )}
        </linearGradient>
        <linearGradient id="surf-holo-2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#FF6B9D" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#7B61FF" stopOpacity="0.6" />
          {animate && (
            <animateTransform
              attributeName="gradientTransform"
              type="rotate"
              values="360 0.5 0.5;0 0.5 0.5"
              dur="12s"
              repeatCount="indefinite"
            />
          )}
        </linearGradient>
        <filter id="surf-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer ring with ticks — like a coin edge */}
      <circle cx={r} cy={r} r={r * 0.95} fill="none" stroke="url(#surf-holo-1)" strokeWidth="0.8" opacity="0.6" />
      <circle cx={r} cy={r} r={r * 0.80} fill="none" stroke="url(#surf-holo-2)" strokeWidth="0.5" opacity="0.4" />

      {/* Precision ticks */}
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke="url(#surf-holo-1)"
          strokeWidth={i % 6 === 0 ? '0.8' : '0.4'}
          opacity={i % 6 === 0 ? 0.8 : 0.4}
        />
      ))}

      {/* Inner circle */}
      <circle cx={r} cy={r} r={inner} fill="none" stroke="url(#surf-holo-1)" strokeWidth="1" filter="url(#surf-glow)" />

      {/* Surf wave glyph */}
      <g transform={`translate(${r - inner * 0.5}, ${r - inner * 0.15})`}>
        <path
          d={`M0,${inner * 0.15} Q${inner * 0.25},${-inner * 0.15} ${inner * 0.5},${inner * 0.15} Q${inner * 0.75},${inner * 0.45} ${inner},${inner * 0.15}`}
          fill="none"
          stroke="url(#surf-holo-1)"
          strokeWidth="1.5"
          strokeLinecap="round"
          filter="url(#surf-glow)"
        />
      </g>

      {/* Circular text: "SURF PROTOCOL • VERIFIED •" */}
      <defs>
        <path
          id="surf-circle-text"
          d={`M ${r},${r} m ${-r * 0.66},0 a ${r * 0.66},${r * 0.66} 0 1,1 ${r * 1.32},0 a ${r * 0.66},${r * 0.66} 0 1,1 ${-r * 1.32},0`}
        />
      </defs>
      <text fill="url(#surf-holo-1)" fontSize={size * 0.115} fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="0.15em" fontWeight="600">
        <textPath href="#surf-circle-text" startOffset="0%">
          SURF PROTOCOL • VERIFIED • AI-READY •
        </textPath>
      </text>
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SurfBadge({
  endpoint,
  name,
  description,
  commands = [],
  position = 'bottom-right',
  size = 'md',
  className = '',
  expandOnHover = true,
}: SurfBadgeProps) {
  const [expanded, setExpanded] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const badgeRef = useRef<HTMLDivElement>(null)
  const dims = SIZES[size]
  const microManifest = buildMicroManifest({ endpoint, name, description, commands })

  // Track mouse for holographic shimmer
  useEffect(() => {
    if (!badgeRef.current) return
    const el = badgeRef.current
    const handler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      setMousePos({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      })
    }
    el.addEventListener('mousemove', handler)
    return () => el.removeEventListener('mousemove', handler)
  }, [])

  const positionStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { position: 'fixed', bottom: 16, right: 16, zIndex: 9999 },
    'bottom-left': { position: 'fixed', bottom: 16, left: 16, zIndex: 9999 },
    'top-right': { position: 'fixed', top: 16, right: 16, zIndex: 9999 },
    'top-left': { position: 'fixed', top: 16, left: 16, zIndex: 9999 },
    'inline': { position: 'relative' },
  }

  return (
    <>
      {/* Machine-readable context for vision models — rendered but visually hidden */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'pre',
        }}
        data-surf-badge="true"
        data-surf-endpoint={endpoint}
        data-surf-manifest={`${endpoint}/.well-known/surf.json`}
      >
        {microManifest}
      </div>

      <div
        ref={badgeRef}
        className={className}
        style={{
          ...positionStyles[position],
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
        onMouseEnter={() => expandOnHover && setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* ─── Expanded Panel ─────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 8,
            width: Math.max(dims.w + 40, 300),
            opacity: expanded ? 1 : 0,
            transform: expanded ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.96)',
            transition: 'all 250ms cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: expanded ? 'auto' : 'none',
            background: 'rgba(10, 10, 14, 0.92)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: 14,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
            padding: '16px 18px',
            color: '#e8e8e6',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5A0', boxShadow: '0 0 8px rgba(0, 229, 160, 0.5)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
              Surf-Enabled Application
            </span>
          </div>

          {name && (
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, color: '#fff' }}>{name}</div>
          )}
          {description && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 12, lineHeight: 1.4 }}>{description}</div>
          )}

          {/* CLI entry point */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            borderRadius: 8,
            padding: '8px 10px',
            marginBottom: commands.length ? 12 : 0,
            fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
            fontSize: 10,
            color: '#00D4FF',
            border: '1px solid rgba(0, 212, 255, 0.12)',
          }}>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginBottom: 4, fontFamily: 'system-ui, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              CLI / Agent Entry
            </div>
            <div>surf exec {endpoint.replace(/^https?:\/\//, '')} &lt;command&gt;</div>
            <div style={{ color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
              surf ping {endpoint.replace(/^https?:\/\//, '')}
            </div>
          </div>

          {/* Commands list */}
          {commands.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
                {commands.length} Available Command{commands.length > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {commands.map((cmd) => (
                  <div key={cmd.name} style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    fontSize: 10,
                    padding: '3px 0',
                  }}>
                    <code style={{
                      fontFamily: '"JetBrains Mono", "SF Mono", monospace',
                      color: '#7B61FF',
                      fontSize: 10,
                      flexShrink: 0,
                    }}>
                      {cmd.name}
                    </code>
                    {cmd.description && (
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, lineHeight: 1.3 }}>
                        {cmd.description}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manifest link */}
          <div style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 9,
            color: 'rgba(255,255,255,0.25)',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>Protocol: Surf v0.3</span>
            <a
              href={`${endpoint}/.well-known/surf.json`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'rgba(0, 212, 255, 0.6)', textDecoration: 'none' }}
            >
              View Manifest →
            </a>
          </div>
        </div>

        {/* ─── Main Badge ─────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 14px 6px 6px',
            borderRadius: dims.seal + 4,
            cursor: 'pointer',
            background: `radial-gradient(ellipse at ${mousePos.x}% ${mousePos.y}%, rgba(0, 212, 255, 0.08) 0%, rgba(10, 10, 14, 0.88) 60%)`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            transition: 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)',
            transform: expanded ? 'scale(1.02)' : 'scale(1)',
            userSelect: 'none',
          }}
          role="button"
          tabIndex={0}
          aria-label={`Surf-enabled: ${name || endpoint}. ${commands.length} commands available.`}
          title={`This app supports the Surf protocol.\n${microManifest}`}
        >
          {/* Holographic seal */}
          <div style={{
            width: dims.seal,
            height: dims.seal,
            flexShrink: 0,
            filter: `hue-rotate(${mousePos.x * 0.5}deg)`,
            transition: 'filter 500ms ease',
          }}>
            <HolographicSeal size={dims.seal} animate={true} />
          </div>

          {/* Text */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <div style={{
              fontSize: dims.fontSize,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#f0f0ee',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}>
              Surf-Enabled
            </div>
            <div style={{
              fontSize: dims.labelSize,
              color: 'rgba(255, 255, 255, 0.35)',
              letterSpacing: '0.03em',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {commands.length} command{commands.length !== 1 ? 's' : ''} • AI-ready
            </div>
          </div>

          {/* Pulse dot */}
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#00E5A0',
            boxShadow: '0 0 6px rgba(0, 229, 160, 0.6)',
            flexShrink: 0,
            animation: 'surf-pulse 3s ease-in-out infinite',
          }} />
        </div>

        {/* Keyframe animation */}
        <style>{`
          @keyframes surf-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.85); }
          }
        `}</style>
      </div>
    </>
  )
}
