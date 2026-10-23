/**
 * dsh-chart client stylesheet.
 *
 * Colors ride the DeepSeek `--dsw-*` theme tokens with bright blue-white
 * fallbacks, and the dark branch keys off `body[data-ds-dark-theme]`, so the
 * view follows whichever theme the shell resolved. No glows, no neon — ink on
 * ice, with the DeepSeek blue as the only accent.
 */
const STYLE_ID = 'dsh-chart-styles'

const CSS = `
.c-root{--c-bg:var(--dsw-alias-bg-layer-2,#f3f8fe);--c-deep:var(--dsw-alias-bg-base,#eaf2fc);--c-surface:var(--dsw-alias-bg-layer-1,#fff);--c-line:var(--dsw-alias-border-l1,#e4eef9);--c-line-2:var(--dsw-alias-border-l2,#d6e4f5);--c-ink:var(--dsw-alias-label-primary,#0b2347);--c-ink-2:var(--dsw-alias-label-secondary,#334f75);--c-ink-3:var(--dsw-alias-label-tertiary,#607a9d);--c-blue:var(--dsw-alias-brand-primary,#3d5af1);--c-blue-soft:var(--dsw-alias-button-info-fill,#eaf1ff);--c-green:var(--dsw-alias-state-success-primary,#0b8a68);--c-amber:var(--dsw-alias-state-warn-primary,#a96c17);--c-rose:var(--dsw-alias-state-error-primary,#b05a64);
position:relative;min-height:100%;background:linear-gradient(180deg,var(--c-deep),var(--c-bg));color:var(--c-ink);font:13px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
body[data-ds-dark-theme] .c-root{--c-bg:var(--dsw-alias-bg-layer-2,#0f1f33);--c-ink:var(--dsw-alias-label-primary,#e9f2fd);--c-ink-2:var(--dsw-alias-label-secondary,#b6cee8);--c-ink-3:var(--dsw-alias-label-tertiary,#89a8cb);--c-surface:var(--dsw-alias-bg-layer-1,#12233a);--c-deep:var(--dsw-alias-bg-base,#0c1a2c);--c-line:var(--dsw-alias-border-l1,#1c3554);--c-line-2:var(--dsw-alias-border-l2,#24446b);--c-blue:var(--dsw-alias-brand-primary,#8ea4ff);--c-blue-soft:var(--dsw-alias-button-info-fill,#16294a);--c-green:var(--dsw-alias-state-success-primary,#5fd3ad);--c-amber:var(--dsw-alias-state-warn-primary,#e3b46b);--c-rose:var(--dsw-alias-state-error-primary,#f0a3ac)}
.c-inner{max-width:1180px;margin:0 auto;padding:16px 18px 40px}
.c-state{display:flex;gap:10px;align-items:center;padding:22px 14px;color:var(--c-ink-3)}
.c-spin{width:14px;height:14px;border:2px solid var(--c-line-2);border-top-color:var(--c-blue);border-radius:50%;animation:c-spin .8s linear infinite}
@keyframes c-spin{to{transform:rotate(360deg)}}
.c-bar{position:sticky;top:0;z-index:3;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0;background:linear-gradient(180deg,var(--c-bg) 72%,transparent);backdrop-filter:blur(2px)}
.c-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border:1px solid var(--c-line-2);border-radius:9px;background:var(--c-surface);color:var(--c-ink-2);font:inherit;font-size:12px;cursor:pointer;transition:border-color .15s,color .15s,transform .1s}
.c-btn:hover{border-color:var(--c-blue);color:var(--c-blue)}
.c-btn:active{transform:translateY(1px)}
.c-btn.primary{background:var(--c-blue);border-color:var(--c-blue);color:#fff}
.c-btn.primary:hover{color:#fff;filter:brightness(1.06)}
.c-btn[disabled]{opacity:.5;cursor:default;transform:none;border-color:var(--c-line-2);color:var(--c-ink-2)}
.c-btn.primary[disabled]{border-color:var(--c-blue);color:#fff}
body[data-ds-dark-theme] .c-btn.primary,body[data-ds-dark-theme] .c-btn.primary:hover{color:#08182c}
.c-spacer{flex:1 1 24px}
.c-empty{padding:26px 14px;text-align:center;color:var(--c-ink-3);background:var(--c-surface);border:1px dashed var(--c-line-2);border-radius:13px}
.c-empty.inline{padding:14px;margin-bottom:12px;text-align:left;font-size:12px}
.c-hero{display:flex;gap:12px;align-items:flex-start;margin:2px 0 14px}
.c-mark{flex:none;color:var(--c-blue);margin-top:3px}
.c-hero h2{margin:0;font-size:17px;font-weight:600;letter-spacing:.2px;word-break:break-word}
.c-sub{margin:3px 0 0;color:var(--c-ink-3);font-size:11.5px;word-break:break-all}
.c-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}
.c-chip{padding:2px 9px;border-radius:999px;background:var(--c-blue-soft);color:var(--c-blue);font-size:11.5px}
.c-chip.warn{background:color-mix(in srgb,var(--c-amber) 14%,transparent);color:var(--c-amber)}
.c-chip.ok{background:color-mix(in srgb,var(--c-green) 14%,transparent);color:var(--c-green)}
.c-chip.bad{background:color-mix(in srgb,var(--c-rose) 14%,transparent);color:var(--c-rose)}
.c-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:9px;margin:4px 0 16px}
.c-cell{padding:10px 12px;background:var(--c-surface);border:1px solid var(--c-line);border-radius:12px}
.c-cell b{display:block;font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.c-cell span{color:var(--c-ink-3);font-size:11px}
.c-cell.warn b{color:var(--c-amber)}
.c-cols{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
@media (max-width:1000px){.c-cols{grid-template-columns:minmax(0,1fr)}.c-side{position:static}}
@media (min-width:1001px){.c-side{position:sticky;top:8px}}
.c-h{margin:0 0 9px;font-size:13px;font-weight:600;color:var(--c-ink-2)}
.c-panel{background:var(--c-surface);border:1px solid var(--c-line);border-radius:13px;padding:12px 13px;margin-bottom:12px}
.c-panel h4{margin:0 0 8px;font-size:12px;font-weight:600;color:var(--c-ink-2);display:flex;align-items:center;gap:6px}
.c-count{font-weight:500;color:var(--c-ink-3);font-size:10.5px;background:var(--c-deep);border-radius:999px;padding:0 7px;font-variant-numeric:tabular-nums}
.c-goal{margin:0;color:var(--c-ink-2);white-space:pre-wrap;word-break:break-word;font-size:12.5px}
.c-hint{margin:5px 0 0;color:var(--c-ink-3);font-size:11px;line-height:1.5}
.c-hint.bad{color:var(--c-rose)}
.c-hint.warn{color:var(--c-amber)}
.c-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:11px;background:var(--c-deep);border:1px solid var(--c-line);border-radius:5px;padding:1px 5px;color:var(--c-ink-2);word-break:break-all}
.c-pre{margin:0;padding:8px 10px;background:var(--c-deep);border:1px solid var(--c-line);border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:11px;line-height:1.55;color:var(--c-ink-2);white-space:pre-wrap;word-break:break-all;overflow-x:auto}
.c-steps{list-style:none;margin:0;padding:0}
.c-step{display:flex;gap:9px;padding:8px 0;border-top:1px dashed var(--c-line)}
.c-step:first-child{border-top:0;padding-top:2px}
.c-step-n{flex:none;width:20px;height:20px;border-radius:50%;background:var(--c-blue-soft);color:var(--c-blue);font-size:10.5px;font-weight:600;display:flex;align-items:center;justify-content:center;margin-top:1px;font-variant-numeric:tabular-nums}
.c-step-b{min-width:0;flex:1}
.c-step-d{margin:0 0 4px;font-size:12px;color:var(--c-ink-2);white-space:pre-wrap;word-break:break-word}
.c-turn{display:inline-block;margin-top:4px;color:var(--c-ink-3);font-size:10.5px;font-variant-numeric:tabular-nums}
.c-rows-list{list-style:none;margin:0;padding:0}
.c-rows-list li{padding:7px 0;border-top:1px dashed var(--c-line)}
.c-rows-list li:first-child{border-top:0;padding-top:0}
.c-rows-list .c-sub{display:block;margin-top:3px;font-size:10.5px}
.c-pit .c-err-text{margin:5px 0 5px;color:var(--c-rose);font-size:11.5px;word-break:break-word;white-space:pre-wrap}
.c-pit-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.c-pit-meta .c-turn{margin-top:0}
.c-facts{margin:0;padding:0}
.c-facts>div{display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px;padding:5px 0;border-top:1px dashed var(--c-line);font-size:11.5px}
.c-facts>div:first-child{border-top:0;padding-top:0}
.c-facts dt{color:var(--c-ink-3)}
.c-facts dd{margin:0;color:var(--c-ink-2);word-break:break-all}
.c-local{margin:2px 0 0;color:var(--c-ink-3);font-size:10.5px}
.c-field{margin:0 0 12px}
.c-flabel{display:block;margin-bottom:6px;font-size:11.5px;color:var(--c-ink-3)}
.c-input{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid var(--c-line-2);border-radius:8px;background:var(--c-deep);color:var(--c-ink);font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}
.c-input:focus{outline:none;border-color:var(--c-blue);box-shadow:0 0 0 2px color-mix(in srgb,var(--c-blue) 18%,transparent)}
.c-input.bad{border-color:var(--c-rose)}
.c-checks{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px}
.c-check{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--c-ink-2);cursor:pointer;margin:2px 0}
.c-check input{accent-color:var(--c-blue);margin:0}
.c-editor-h{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:2px 0 7px}
.c-editor-h .c-flabel{margin:0}
.c-editor{display:block;width:100%;box-sizing:border-box;min-height:300px;resize:vertical;padding:10px 11px;border:1px solid var(--c-line-2);border-radius:10px;background:var(--c-deep);color:var(--c-ink);font:11.5px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;tab-size:2}
.c-editor:focus{outline:none;border-color:var(--c-blue);box-shadow:0 0 0 2px color-mix(in srgb,var(--c-blue) 18%,transparent)}
.c-actions{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end;margin-top:12px}
.c-actions.start{justify-content:flex-start}
.c-warn{margin:8px 0;padding:8px 10px;border:1px solid color-mix(in srgb,var(--c-amber) 30%,transparent);border-radius:9px;background:color-mix(in srgb,var(--c-amber) 9%,transparent);color:var(--c-amber);font-size:11.5px;line-height:1.55}
.c-warn p{margin:0 0 6px}
.c-warn .c-check{color:var(--c-ink-2)}
.c-link{background:none;border:0;padding:0;color:var(--c-blue);font:inherit;text-decoration:underline;cursor:pointer}
.c-veil{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:20px;background:color-mix(in srgb,var(--c-ink) 28%,transparent)}
.c-modal{width:min(480px,100%);max-height:88vh;overflow:auto;background:var(--c-surface);border:1px solid var(--c-line-2);border-radius:16px;padding:18px;box-shadow:0 18px 44px -22px color-mix(in srgb,var(--c-ink) 55%,transparent)}
.c-modal h3{margin:0 0 4px;font-size:15px}
.c-modal p.hint{margin:0 0 14px;color:var(--c-ink-3);font-size:11.5px}
.c-path{display:block;padding:7px 9px;background:var(--c-deep);border:1px solid var(--c-line);border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:11px;color:var(--c-ink-2);word-break:break-all}
.c-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:50;max-width:min(92vw,760px);padding:8px 16px;border-radius:14px;background:var(--c-ink);color:var(--c-surface);font-size:12px;line-height:1.5;text-align:center;box-shadow:0 10px 28px -16px color-mix(in srgb,var(--c-ink) 70%,transparent)}
`

/** Inject the view stylesheet once. */
export function adoptStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
