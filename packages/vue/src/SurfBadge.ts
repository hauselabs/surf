import {
  defineComponent,
  ref,
  computed,
  onMounted,
  onUnmounted,
  inject,
  h,
  type PropType,
} from 'vue';
import { initSurf, ensureSurf } from '@surfjs/web';
import {
  registerWindowSurfHttp,
} from './window-surf.js';
import { SURF_INJECTION_KEY } from './provider.js';

export interface SurfBadgeCommand {
  name: string;
  description?: string;
  params?: Record<string, { type?: string; required?: boolean; description?: string }>;
}

export interface SurfBadgeProps {
  endpoint: string;
  name?: string;
  description?: string;
  commands?: SurfBadgeCommand[];
  position?: 'bottom-right' | 'bottom-left' | 'inline';
  theme?: 'dark' | 'light' | 'auto';
  className?: string;
}

/**
 * SurfBadge — a floating badge indicating the site is Surf-enabled.
 *
 * This is a simplified Vue version that shows a text-based badge
 * (the full psychedelic SVG seal from React is kept React-native).
 */
export const SurfBadge = defineComponent({
  name: 'SurfBadge',
  props: {
    endpoint: { type: String, required: true },
    name: { type: String, default: undefined },
    description: { type: String, default: undefined },
    commands: { type: Array as PropType<SurfBadgeCommand[]>, default: () => [] },
    position: {
      type: String as PropType<'bottom-right' | 'bottom-left' | 'inline'>,
      default: 'bottom-left',
    },
    theme: {
      type: String as PropType<'dark' | 'light' | 'auto'>,
      default: 'auto',
    },
    className: { type: String, default: '' },
  },
  setup(props) {
    const mounted = ref(false);
    const hovered = ref(false);
    const expanded = ref(false);
    const dark = ref(false);

    let cleanupHttp: (() => void) | null = null;

    // Check if SurfProvider context exists
    const surfCtx = inject(SURF_INJECTION_KEY, null);

    function detectTheme() {
      if (typeof document === 'undefined') return;
      if (props.theme !== 'auto') {
        dark.value = props.theme === 'dark';
        return;
      }
      const el = document.documentElement;
      if (el.classList.contains('dark') || el.classList.contains('light')) {
        dark.value = el.classList.contains('dark');
      } else {
        dark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    }

    onMounted(() => {
      mounted.value = true;
      detectTheme();

      // Register HTTP executor if no SurfProvider
      if (!surfCtx) {
        cleanupHttp = registerWindowSurfHttp(props.endpoint);
      }
    });

    onUnmounted(() => {
      if (cleanupHttp) cleanupHttp();
    });

    const posStyles: Record<string, Record<string, string>> = {
      'bottom-right': { position: 'fixed', bottom: '16px', right: '16px', zIndex: '9999' },
      'bottom-left': { position: 'fixed', bottom: '16px', left: '16px', zIndex: '9999' },
      'inline': { position: 'relative', display: 'inline-flex' },
    };

    return () => {
      const isExpanded = hovered.value || expanded.value;
      const isDark = dark.value;
      const cmdCount = props.commands?.length ?? 0;

      return h('div', {
        class: props.className,
        style: {
          ...posStyles[props.position ?? 'bottom-left'],
          visibility: mounted.value ? 'visible' : 'hidden',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        },
        onMouseenter: () => { hovered.value = true; },
        onMouseleave: () => { hovered.value = false; },
      }, [
        // Hidden machine context
        h('div', {
          'aria-hidden': 'true',
          'data-surf-badge': 'true',
          'data-surf-endpoint': props.endpoint,
          'data-surf-manifest': `${props.endpoint}/.well-known/surf.json`,
          'data-surf-commands': props.commands?.map(c => c.name).join(',') ?? '',
          style: {
            position: 'absolute',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'pre',
          },
        }, `[SURF PROTOCOL — AI AGENT INTERFACE]\nMANIFEST: ${props.endpoint}/.well-known/surf.json\nCOMMANDS: ${cmdCount}`),

        // Badge button
        h('div', {
          onClick: () => { expanded.value = !expanded.value; },
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: isExpanded ? '8px' : '0',
            padding: isExpanded ? '6px 14px 6px 8px' : '6px 8px',
            borderRadius: '999px',
            cursor: 'pointer',
            background: isDark ? 'rgba(0,212,255,0.08)' : 'rgba(0,150,200,0.06)',
            border: `1px solid ${isDark ? 'rgba(0,212,255,0.2)' : 'rgba(0,150,200,0.2)'}`,
            transition: 'all 300ms ease',
            opacity: isExpanded ? '1' : isDark ? '0.5' : '0.65',
            userSelect: 'none',
          },
          role: 'button',
          'aria-label': `Surf-enabled: ${props.name || props.endpoint}. ${cmdCount} commands available for AI agents.`,
        }, [
          h('span', {
            style: {
              fontSize: '14px',
              lineHeight: '1',
            },
          }, '🌊'),
          isExpanded ? h('span', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '1px',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            },
          }, [
            h('span', {
              style: {
                fontSize: '10px',
                fontWeight: '600',
                letterSpacing: '0.06em',
                color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)',
              },
            }, 'Surf-Enabled'),
            h('span', {
              style: {
                fontSize: '8px',
                letterSpacing: '0.04em',
                color: isDark ? 'rgba(0,212,255,0.65)' : 'rgba(0,150,190,0.55)',
              },
            }, 'Open for AI agents'),
          ]) : null,
        ]),
      ]);
    };
  },
});
