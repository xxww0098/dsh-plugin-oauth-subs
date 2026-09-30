// Settings UI part — inlined into the client.ts factory by scripts/ui-bundle.ts.
// Quota rows and meters, rail / tab chrome, dialogs, auth panel, reset-card bank.

    function formatQuotaError(raw, limit = 160) {
      const text = String(raw ?? '').replace(/\s+/g, ' ').trim()
      if (!text) return ''
      const http = text.match(/\bHTTP\s+(\d{3})\b/i)?.[1]
      const jsonAt = text.indexOf('{')
      let human = ''
      if (jsonAt >= 0) {
        const blob = text.slice(jsonAt)
        let parsed
        try { parsed = JSON.parse(blob) } catch { parsed = undefined }
        const err = parsed && typeof parsed === 'object' ? parsed.error : undefined
        if (err && typeof err === 'object') {
          if (typeof err.message === 'string' && err.message.trim()) human = err.message.trim()
          else if (typeof err.code === 'string' && err.code.trim()) human = err.code.trim()
        } else if (typeof err === 'string' && err.trim()) {
          human = err.trim()
        }
        if (!human && parsed && typeof parsed === 'object') {
          if (typeof parsed.message === 'string' && parsed.message.trim()) human = parsed.message.trim()
          else if (typeof parsed.code === 'string' && parsed.code.trim()) human = parsed.code.trim()
        }
        if (!human) {
          const named = blob.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/)
          const coded = blob.match(/"code"\s*:\s*"((?:\\.|[^"\\])*)"/)
          const pick = named?.[1] || coded?.[1]
          if (pick) {
            try { human = JSON.parse(`"${pick}"`) } catch { human = pick }
          }
        }
      }
      if (!human) {
        human = (jsonAt >= 0 ? text.slice(0, jsonAt) : text).replace(/:\s*$/, '').trim()
      }
      if (http && human && !new RegExp(`\\bHTTP\\s+${http}\\b`, 'i').test(human)) {
        human = `${human} (HTTP ${http})`
      }
      if (human.length <= limit) return human
      return `${human.slice(0, limit).trimEnd()}…`
    }

    function remainingPercentOf(row) {
      if (typeof row?.remainingPercent === 'number' && Number.isFinite(row.remainingPercent)) {
        return Math.max(0, Math.min(100, row.remainingPercent))
      }
      if (typeof row?.usedPercent === 'number' && Number.isFinite(row.usedPercent)) {
        return Math.max(0, Math.min(100, 100 - row.usedPercent))
      }
      return undefined
    }

    function quotaTone(remaining) {
      if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return null
      if (remaining <= 15) return 'bad'
      if (remaining <= 40) return 'warn'
      // Healthy windows read in ink: color is reserved for a warning.
      return null
    }

    /* Bar fill ramp: 100% remaining = --osubs-ok (green), 50% = --osubs-warn,
       0% = --osubs-bad (red). HSL keeps the midpoint a clean amber instead
       of the muddy brown an oklab mix of the endpoints would give. */
    function quotaFillColor(remaining) {
      if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return undefined
      const pct = Math.max(0, Math.min(100, remaining))
      return pct >= 50
        ? `color-mix(in hsl, var(--osubs-ok) ${Math.round((pct - 50) * 2)}%, var(--osubs-warn))`
        : `color-mix(in hsl, var(--osubs-warn) ${Math.round(pct * 2)}%, var(--osubs-bad))`
    }

    function Button({ label, onClick, variant, size, type = 'button', disabled, mark }) {
      const classes = ['osubs-btn']
      if (variant) classes.push(`osubs-btn--${variant}`)
      if (size) classes.push(`osubs-btn--${size}`)
      if (mark) classes.push('osubs-btn--update')
      return h('button', { type, onClick, disabled, className: classes.join(' ') }, label)
    }

    const HOLD_TIP_MS = 450

    function HoldTip({ label, children }) {
      const [open, setOpen] = useState(false)
      const timer = useRef(0)
      const shown = useRef(false)
      const clear = () => {
        clearTimeout(timer.current)
        timer.current = 0
        if (!shown.current) return
        shown.current = false
        setOpen(false)
      }
      const start = (event) => {
        if (event.button != null && event.button !== 0) return
        clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          shown.current = true
          setOpen(true)
        }, HOLD_TIP_MS)
      }
      useEffect(() => () => clearTimeout(timer.current), [])
      if (!label) return children
      return h('span', {
        className: 'osubs-hold',
        onPointerDown: start,
        onPointerUp: clear,
        onPointerCancel: clear,
        onPointerLeave: clear,
      }, children, open && h('span', { className: 'osubs-hold-tip', role: 'tooltip' }, label))
    }

    // LobeHub icons from @lobehub/icons-static-svg@1.95.1
    // https://unpkg.com/@lobehub/icons-static-svg@1.95.1/icons/{grok,zai,cursor,ollama,cline,github,opencode,openai}.svg
    // `raw` entries are the official colored variants (icons/{codex,kiro,antigravity,kimi,copilot,devin,deepseek}-color.svg)
    // inlined verbatim so the rail shows real brand marks without a dep.
    const TAB_ICONS = {
      // Usage view only: the host's own DeepSeek providers (not a plugin family).
      deepseek: { raw: '<path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" fill="#4D6BFE"/>' },
      // LobeHub `OpenAI` (icons/openai.svg; no -color variant, brand is monochrome)
      openai: { d: 'M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z', clip: true },
      codex: { raw: '<path d="M19.503 0H4.496A4.496 4.496 0 000 4.496v15.007A4.496 4.496 0 004.496 24h15.007A4.496 4.496 0 0024 19.503V4.496A4.496 4.496 0 0019.503 0z" fill="#fff"/><path d="M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388zm3.482 10.565a.637.637 0 000 1.272h3.636a.637.637 0 100-1.272h-3.636zM8.462 9.23a.637.637 0 00-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 101.095.649l1.454-2.455a.636.636 0 00.005-.64L8.462 9.23z" fill="url(#osubs-lg-codex)"/><defs><linearGradient gradientUnits="userSpaceOnUse" id="osubs-lg-codex" x1="12" x2="12" y1="3" y2="21"><stop stop-color="#B1A7FF"/><stop offset=".5" stop-color="#7A9DFF"/><stop offset="1" stop-color="#3941FF"/></linearGradient></defs>' },
      grok: { d: 'M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815' },
      zai: { d: 'M12.105 2L9.927 4.953H.653L2.83 2h9.276zM23.254 19.048L21.078 22h-9.242l2.174-2.952h9.244zM24 2L9.264 22H0L14.736 2H24z' },
      kiro: { raw: '<path d="M18.8 0H5.2A5.2 5.2 0 000 5.2v13.6A5.2 5.2 0 005.2 24h13.6a5.2 5.2 0 005.2-5.2V5.2A5.2 5.2 0 0018.8 0z" fill="#9046FF"/><path d="M7.97 16.376c-1.644 3.642 1.86 4.556 4.443 2.424.76 2.39 3.608.607 4.631-1.247 2.251-4.084 1.342-8.249 1.108-9.108-1.6-5.859-9.6-5.869-10.976.03-.323 1.033-.328 2.206-.507 3.423-.09.617-.16 1.009-.393 1.655-.139.373-.323.7-.62 1.257-.458.865-.264 2.53 2.101 1.665l.224-.1h-.01l-.001.001z" fill="#fff"/><path d="M12.722 10.985c-.656 0-.755-.785-.755-1.252 0-.423.074-.756.218-.97a.61.61 0 01.537-.283c.229 0 .428.095.567.289.159.218.243.55.243.964 0 .785-.303 1.252-.805 1.252h-.005zm2.703 0c-.656 0-.755-.785-.755-1.252 0-.423.074-.756.219-.97a.61.61 0 01.536-.283c.229 0 .428.095.567.289.159.218.243.55.243.964 0 .785-.303 1.252-.805 1.252h-.005z" fill="#000"/>' },
      // LobeHub `Antigravity` colored icon (`@lobehub/icons-static-svg` icons/antigravity-color.svg)
      antigravity: { raw: '<mask height="23" id="osubs-ag-0" maskUnits="userSpaceOnUse" width="24" x="0" y="1"><path d="M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z" fill="#fff"></path></mask><g mask="url(#osubs-ag-0)"><g filter="url(#osubs-ag-1)"><path d="M-1.018-3.992c-.408 3.591 2.686 6.89 6.91 7.37 4.225.48 7.98-2.043 8.387-5.633.408-3.59-2.686-6.89-6.91-7.37-4.225-.479-7.98 2.043-8.387 5.633z" fill="#FFE432"></path></g><g filter="url(#osubs-ag-2)"><path d="M15.269 7.747c1.058 4.557 5.691 7.374 10.348 6.293 4.657-1.082 7.575-5.653 6.516-10.21-1.058-4.556-5.691-7.374-10.348-6.292-4.657 1.082-7.575 5.653-6.516 10.21z" fill="#FC413D"></path></g><g filter="url(#osubs-ag-3)"><path d="M-12.443 10.804c1.338 4.703 7.36 7.11 13.453 5.378 6.092-1.733 9.947-6.95 8.61-11.652C8.282-.173 2.26-2.58-3.833-.848-9.925.884-13.78 6.1-12.443 10.804z" fill="#00B95C"></path></g><g filter="url(#osubs-ag-4)"><path d="M-12.443 10.804c1.338 4.703 7.36 7.11 13.453 5.378 6.092-1.733 9.947-6.95 8.61-11.652C8.282-.173 2.26-2.58-3.833-.848-9.925.884-13.78 6.1-12.443 10.804z" fill="#00B95C"></path></g><g filter="url(#osubs-ag-5)"><path d="M-7.608 14.703c3.352 3.424 9.126 3.208 12.896-.483 3.77-3.69 4.108-9.459.756-12.883C2.69-2.087-3.083-1.871-6.853 1.82c-3.77 3.69-4.108 9.458-.755 12.883z" fill="#00B95C"></path></g><g filter="url(#osubs-ag-6)"><path d="M9.932 27.617c1.04 4.482 5.384 7.303 9.7 6.3 4.316-1.002 6.971-5.448 5.93-9.93-1.04-4.483-5.384-7.304-9.7-6.301-4.316 1.002-6.971 5.448-5.93 9.93z" fill="#3186FF"></path></g><g filter="url(#osubs-ag-7)"><path d="M2.572-8.185C.392-3.329 2.778 2.472 7.9 4.771c5.122 2.3 11.042.227 13.222-4.63 2.18-4.855-.205-10.656-5.327-12.955-5.122-2.3-11.042-.227-13.222 4.63z" fill="#FBBC04"></path></g><g filter="url(#osubs-ag-8)"><path d="M-3.267 38.686c-5.277-2.072 3.742-19.117 5.984-24.83 2.243-5.712 8.34-8.664 13.616-6.592 5.278 2.071 11.533 13.482 9.29 19.195-2.242 5.713-23.613 14.298-28.89 12.227z" fill="#3186FF"></path></g><g filter="url(#osubs-ag-9)"><path d="M28.71 17.471c-1.413 1.649-5.1.808-8.236-1.878-3.135-2.687-4.531-6.201-3.118-7.85 1.412-1.649 5.1-.808 8.235 1.878s4.532 6.2 3.119 7.85z" fill="#749BFF"></path></g><g filter="url(#osubs-ag-10)"><path d="M18.163 9.077c5.81 3.93 12.502 4.19 14.946.577 2.443-3.612-.287-9.727-6.098-13.658-5.81-3.931-12.502-4.19-14.946-.577-2.443 3.612.287 9.727 6.098 13.658z" fill="#FC413D"></path></g><g filter="url(#osubs-ag-11)"><path d="M-.915 2.684c-1.44 3.473-.97 6.967 1.05 7.804 2.02.837 4.824-1.3 6.264-4.772 1.44-3.473.97-6.967-1.05-7.804-2.02-.837-4.824 1.3-6.264 4.772z" fill="#FFEE48"></path></g></g><defs><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="17.587" id="osubs-ag-1" width="19.838" x="-3.288" y="-11.917"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="1.117"></feGaussianBlur></filter><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="38.565" id="osubs-ag-2" width="38.9" x="4.251" y="-13.493"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="5.4"></feGaussianBlur></filter><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="36.517" id="osubs-ag-3" width="40.955" x="-21.889" y="-10.592"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="4.591"></feGaussianBlur></filter><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="36.517" id="osubs-ag-4" width="40.955" x="-21.889" y="-10.592"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="4.591"></feGaussianBlur></filter><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="36.595" id="osubs-ag-5" width="36.632" x="-19.099" y="-10.278"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="4.591"></feGaussianBlur></filter><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="34.087" id="osubs-ag-6" width="33.533" x=".981" y="8.758"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="4.363"></feGaussianBlur></filter><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="35.276" id="osubs-ag-7" width="35.978" x="-6.143" y="-21.659"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="3.954"></feGaussianBlur></filter><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="46.523" id="osubs-ag-8" width="45.114" x="-11.96" y="-.46"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="3.531"></feGaussianBlur></filter><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="24.054" id="osubs-ag-9" width="25.094" x="10.485" y=".58"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="3.159"></feGaussianBlur></filter><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="30.007" id="osubs-ag-10" width="33.508" x="5.833" y="-12.467"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="2.669"></feGaussianBlur></filter><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="26.151" id="osubs-ag-11" width="22.194" x="-8.355" y="-8.876"><feFlood flood-opacity="0" result="BackgroundImageFix"></feFlood><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"></feBlend><feGaussianBlur result="effect1_foregroundBlur_977_115" stdDeviation="3.303"></feGaussianBlur></filter></defs>' },
      cursor: { d: 'M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z', clip: true },
      ollama: { d: 'M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z', clip: true },
      // LobeHub `Kimi` icon (`@lobehub/icons-static-svg` icons/kimi-color.svg);
      // the official K is #fff so a black tile is added for it to read.
      kimi: { raw: '<rect width="24" height="24" rx="5" fill="#000"/><path d="M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z" fill="#1783FF"/><path d="M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z" fill="#fff"/>' },
      // LobeHub `Copilot` icon (`@lobehub/icons-static-svg` icons/copilot-color.svg)
      copilot: { raw: '<path d="M17.533 1.829A2.528 2.528 0 0015.11 0h-.737a2.531 2.531 0 00-2.484 2.087l-1.263 6.937.314-1.08a2.528 2.528 0 012.424-1.833h4.284l1.797.706 1.731-.706h-.505a2.528 2.528 0 01-2.423-1.829l-.715-2.453z" fill="url(#osubs-copilot-0)" transform="translate(0 1)"/><path d="M6.726 20.16A2.528 2.528 0 009.152 22h1.566c1.37 0 2.49-1.1 2.525-2.48l.17-6.69-.357 1.228a2.528 2.528 0 01-2.423 1.83h-4.32l-1.54-.842-1.667.843h.497c1.124 0 2.113.75 2.426 1.84l.697 2.432z" fill="url(#osubs-copilot-1)" transform="translate(0 1)"/><path d="M15 0H6.252c-2.5 0-4 3.331-5 6.662-1.184 3.947-2.734 9.225 1.75 9.225H6.78c1.13 0 2.12-.753 2.43-1.847.657-2.317 1.809-6.359 2.713-9.436.46-1.563.842-2.906 1.43-3.742A1.97 1.97 0 0115 0" fill="url(#osubs-copilot-2)" transform="translate(0 1)"/><path d="M15 0H6.252c-2.5 0-4 3.331-5 6.662-1.184 3.947-2.734 9.225 1.75 9.225H6.78c1.13 0 2.12-.753 2.43-1.847.657-2.317 1.809-6.359 2.713-9.436.46-1.563.842-2.906 1.43-3.742A1.97 1.97 0 0115 0" fill="url(#osubs-copilot-3)" transform="translate(0 1)"/><path d="M9 22h8.749c2.5 0 4-3.332 5-6.663 1.184-3.948 2.734-9.227-1.75-9.227H17.22c-1.129 0-2.12.754-2.43 1.848a1149.2 1149.2 0 01-2.713 9.437c-.46 1.564-.842 2.907-1.43 3.743A1.97 1.97 0 019 22" fill="url(#osubs-copilot-4)" transform="translate(0 1)"/><path d="M9 22h8.749c2.5 0 4-3.332 5-6.663 1.184-3.948 2.734-9.227-1.75-9.227H17.22c-1.129 0-2.12.754-2.43 1.848a1149.2 1149.2 0 01-2.713 9.437c-.46 1.564-.842 2.907-1.43 3.743A1.97 1.97 0 019 22" fill="url(#osubs-copilot-5)" transform="translate(0 1)"/><defs><radialGradient cx="85.44%" cy="100.653%" fx="85.44%" fy="100.653%" gradientTransform="scale(-.8553 -1) rotate(50.927 2.041 -1.946)" id="osubs-copilot-0" r="105.116%"><stop offset="9.6%" stop-color="#00AEFF"/><stop offset="77.3%" stop-color="#2253CE"/><stop offset="100%" stop-color="#0736C4"/></radialGradient><radialGradient cx="18.143%" cy="32.928%" fx="18.143%" fy="32.928%" gradientTransform="scale(.8897 1) rotate(52.069 .193 .352)" id="osubs-copilot-1" r="95.612%"><stop offset="0%" stop-color="#FFB657"/><stop offset="63.4%" stop-color="#FF5F3D"/><stop offset="92.3%" stop-color="#C02B3C"/></radialGradient><radialGradient cx="82.987%" cy="-9.792%" fx="82.987%" fy="-9.792%" gradientTransform="scale(-1 -.9441) rotate(-70.872 .142 1.17)" id="osubs-copilot-4" r="140.622%"><stop offset="6.6%" stop-color="#8C48FF"/><stop offset="50%" stop-color="#F2598A"/><stop offset="89.6%" stop-color="#FFB152"/></radialGradient><linearGradient id="osubs-copilot-2" x1="39.465%" x2="46.884%" y1="12.117%" y2="103.774%"><stop offset="15.6%" stop-color="#0D91E1"/><stop offset="48.7%" stop-color="#52B471"/><stop offset="65.2%" stop-color="#98BD42"/><stop offset="93.7%" stop-color="#FFC800"/></linearGradient><linearGradient id="osubs-copilot-3" x1="45.949%" x2="50%" y1="0%" y2="100%"><stop offset="0%" stop-color="#3DCBFF"/><stop offset="24.7%" stop-color="#0588F7" stop-opacity="0"/></linearGradient><linearGradient id="osubs-copilot-5" x1="83.507%" x2="83.453%" y1="-6.106%" y2="21.131%"><stop offset="5.8%" stop-color="#F8ADFA"/><stop offset="70.8%" stop-color="#A86EDD" stop-opacity="0"/></linearGradient></defs>' },
      // LobeHub `Devin` colored icon (`@lobehub/icons-static-svg` icons/devin-color.svg)
      devin: { raw: '<path d="M2.033 9.867l2.554 1.483a.589.589 0 00.592 0l2.554-1.483.01-.008a.608.608 0 00.11-.084l.013-.015a.631.631 0 00.076-.1c.003-.005.008-.01.01-.016a.558.558 0 00.052-.125l.007-.028a.611.611 0 00.019-.14V7.868c0-.572.307-1.105.8-1.392a1.595 1.595 0 011.598 0l1.277.742a.54.54 0 00.129.053l.028.01c.044.01.088.015.133.016h.006l.013-.002a.587.587 0 00.27-.074l.011-.004 2.554-1.483a.596.596 0 00.297-.516V2.253a.595.595 0 00-.297-.516L12.293.257a.587.587 0 00-.591 0L9.148 1.737l-.01.01a.609.609 0 00-.109.083l-.014.015a.632.632 0 00-.076.1c-.003.005-.008.01-.01.016a.57.57 0 00-.052.124l-.007.028a.612.612 0 00-.018.14v1.483c0 .572-.307 1.105-.8 1.393a1.597 1.597 0 01-1.599 0l-1.276-.742a.603.603 0 00-.13-.053l-.028-.008a.658.658 0 00-.133-.018h-.02a.57.57 0 00-.269.074c-.003.002-.008.002-.012.005L2.033 5.872a.596.596 0 00-.297.515v2.966c0 .213.113.41.297.515z" fill="#3969CA"/><path d="M15.943 10.607a1.596 1.596 0 011.599 0l1.276.74c.041.025.085.04.13.055l.028.008c.043.01.088.016.133.018h.005c.005 0 .01-.002.014-.003a.474.474 0 00.122-.016l.021-.005a.616.616 0 00.126-.052c.004-.002.009-.002.013-.005l2.554-1.482a.597.597 0 00.297-.516V6.383a.596.596 0 00-.297-.515l-2.552-1.483a.587.587 0 00-.592 0l-2.553 1.482-.011.008a.61.61 0 00-.108.084l-.014.016a.637.637 0 00-.076.1c-.003.005-.008.01-.01.016a.57.57 0 00-.052.124l-.007.029a.612.612 0 00-.018.14v1.482c0 .572-.307 1.105-.8 1.393a1.597 1.597 0 01-1.599 0l-1.276-.742a.584.584 0 00-.13-.053l-.028-.008a.62.62 0 00-.133-.018h-.02a.587.587 0 00-.269.074l-.012.004L9.15 10a.596.596 0 00-.296.516v2.966c0 .212.112.409.296.515l2.554 1.483s.008.002.012.005c.04.022.082.04.126.052l.02.004a.57.57 0 00.123.017l.014.002h.006c.054 0 .108-.01.16-.025a.587.587 0 00.13-.054l1.277-.741a1.597 1.597 0 012.398 1.392v1.482c0 .049.007.095.019.14l.007.028a.619.619 0 00.051.125c.004.006.008.01.01.016a.6.6 0 00.076.1l.014.015c.033.032.069.06.108.084.004.002.006.006.011.008l2.554 1.483a.59.59 0 00.593 0l2.554-1.483a.597.597 0 00.296-.516v-2.965a.595.595 0 00-.296-.515a.54.54 0 00-.126-.051c-.007-.003-.013-.003-.02-.005a.635.635 0 00-.125-.017h-.018a.557.557 0 00-.16.026.588.588 0 00-.13.053l-1.276.742a1.595 1.595 0 01-1.598 0 1.615 1.615 0 010-2.785l-.005-.001z" fill="#21C19A"/><path d="M14.848 18.265l-2.554-1.482-.012-.005a.526.526 0 00-.126-.052c-.007-.002-.014-.002-.02-.005a.64.64 0 00-.124-.017h-.02a.56.56 0 00-.16.026.588.588 0 00-.13.053l-1.276.742a1.594 1.594 0 01-1.598 0c-.493-.286-.8-.82-.8-1.393V14.65a.563.563 0 00-.018-.14l-.008-.028a.604.604 0 00-.051-.124l-.01-.017a.603.603 0 00-.076-.1l-.014-.015a.596.596 0 00-.109-.084c-.003-.002-.005-.006-.01-.008L5.178 12.65a.587.587 0 00-.591 0l-2.554 1.483a.596.596 0 00-.297.516v2.965c0 .213.113.41.297.516l2.554 1.483.012.004a.618.618 0 00.267.074l.016.002h.007a.55.55 0 00.16-.026.584.584 0 00.129-.053l1.277-.742a1.597 1.597 0 012.398 1.393v1.482c0 .05.007.095.019.14l.007.028c.013.044.03.085.051.125l.01.016c.022.036.047.07.076.1l.014.015c.032.032.069.06.109.084l.01.008 2.554 1.483a.587.587 0 00.593 0l2.554-1.483a.596.596 0 00.296-.515v-2.966a.596.596 0 00-.296-.516h-.002z" fill="#0294DE"/>' },
      github: { d: 'M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z' },
      models: { d: 'M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z' },
      // LobeHub `Cline` icon (`@lobehub/icons-static-svg` icons/cline.svg, two subpaths joined)
      cline: { d: 'M17.035 3.991c2.75 0 4.98 2.24 4.98 5.003v1.667l1.45 2.896a1.01 1.01 0 01-.002.909l-1.448 2.864v1.668c0 2.762-2.23 5.002-4.98 5.002H7.074c-2.751 0-4.98-2.24-4.98-5.002V17.33l-1.48-2.855a1.01 1.01 0 01-.003-.927l1.482-2.887V8.994c0-2.763 2.23-5.003 4.98-5.003h9.962zM8.265 9.6a2.274 2.274 0 00-2.274 2.274v4.042a2.274 2.274 0 004.547 0v-4.042A2.274 2.274 0 008.265 9.6zm7.326 0a2.274 2.274 0 00-2.274 2.274v4.042a2.274 2.274 0 104.548 0v-4.042A2.274 2.274 0 0015.59 9.6zM12.054 5.558a2.779 2.779 0 100-5.558 2.779 2.779 0 000 5.558z', clip: true },
      // LobeHub `OpenCode` icon (`@lobehub/icons-static-svg` icons/opencode.svg)
      opencodeGo: { d: 'M16 6H8v12h8V6zm4 16H4V2h16v20z' },
      // Command Code brand mark: Apple command symbol (`⌘`), matching the
      // official commandcode.ai site favicon, apple-touch-icon, and banner badge.
      commandCode: { d: 'M6,2A4,4 0 0,1 10,6V8H14V6A4,4 0 0,1 18,2A4,4 0 0,1 22,6A4,4 0 0,1 18,10H16V14H18A4,4 0 0,1 22,18A4,4 0 0,1 18,22A4,4 0 0,1 14,18V16H10V18A4,4 0 0,1 6,22A4,4 0 0,1 2,18A4,4 0 0,1 6,14H8V10H6A4,4 0 0,1 2,6A4,4 0 0,1 6,2M16,18A2,2 0 0,0 18,20A2,2 0 0,0 20,18A2,2 0 0,0 18,16H16V18M14,10H10V14H14V10M6,16A2,2 0 0,0 4,18A2,2 0 0,0 6,20A2,2 0 0,0 8,18V16H6M8,6A2,2 0 0,0 6,4A2,2 0 0,0 4,6A2,2 0 0,0 6,8H8V6M18,8A2,2 0 0,0 20,6A2,2 0 0,0 18,4A2,2 0 0,0 16,6V8H18Z' },
    }

    function TabIcon({ name, className }) {
      const icon = TAB_ICONS[name]
      if (icon.raw) {
        return h('svg', {
          className: className ?? 'osubs-tab-icon',
          viewBox: '0 0 24 24',
          width: 18,
          height: 18,
          'aria-hidden': 'true',
          dangerouslySetInnerHTML: { __html: icon.raw },
        })
      }
      return h('svg', {
        className: className ?? 'osubs-tab-icon',
        viewBox: '0 0 24 24',
        width: 18,
        height: 18,
        fill: 'currentColor',
        fillRule: 'evenodd',
        'aria-hidden': 'true',
      }, h('path', icon.clip ? { d: icon.d, clipRule: 'evenodd' } : { d: icon.d }))
    }

    function PageTab({ id, label, view, onSelect }) {
      return h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': view === id,
        className: `osubs-ptab${view === id ? ' osubs-ptab--on' : ''}`,
        onClick: () => onSelect(id),
      }, label)
    }

    function IconGrid() {
      return h('svg', {
        className: 'osubs-rail-icon',
        viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('rect', { x: 4, y: 4, width: 7, height: 7, rx: 1.5 }),
        h('rect', { x: 13, y: 4, width: 7, height: 7, rx: 1.5 }),
        h('rect', { x: 4, y: 13, width: 7, height: 7, rx: 1.5 }),
        h('rect', { x: 13, y: 13, width: 7, height: 7, rx: 1.5 }),
      )
    }

    function RailItem({ item, current, onSelect }) {
      return h('button', {
        type: 'button',
        'aria-current': current === item.id ? 'true' : undefined,
        className: `osubs-rail-item${current === item.id ? ' osubs-rail-item--on' : ''}`,
        onClick: () => onSelect(item.id),
      },
        h('span', { className: 'osubs-rail-ic', style: item.color ? { color: item.color } : undefined },
          item.id === 'all'
            ? h(IconGrid)
            : item.icon && h(TabIcon, { name: item.icon, className: 'osubs-rail-icon' })),
        h('span', { className: 'osubs-rail-name' }, item.name),
        item.count !== undefined && h('span', { className: 'osubs-rail-count' }, item.count),
      )
    }

    function Switch({ checked, disabled, onChange, label }) {
      return h('label', { className: 'osubs-switch' },
        h('input', {
          type: 'checkbox',
          checked,
          disabled,
          'aria-label': label,
          onChange: (event) => { if (!disabled) onChange?.(event.currentTarget.checked) },
        }),
        h('span', { className: 'osubs-switch-track', 'aria-hidden': 'true' }),
      )
    }

    function IconSearch() {
      return h('svg', {
        viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round',
        'aria-hidden': 'true',
      }, h('circle', { cx: 11, cy: 11, r: 7 }), h('path', { d: 'm20 20-3.8-3.8' }))
    }

    function antigravityGroupLabel(product, t) {
      const text = String(product ?? '')
      if (/claude|gpt/i.test(text)) return t.agClaudeGpt
      if (/gemini/i.test(text)) return t.agGemini
      return text
    }

    function rowLabel(row, t, family) {
      if (family === 'ollama') {
        if (row.kind === 'primary') return t.primary
        if (row.kind === 'weekly') return t.weekly
      }
      if (family === 'glm' || family === 'antigravity') {
        if (row.kind === 'primary') return t.glmPrimary
        if (row.kind === 'weekly') return t.glmWeekly
        if (family === 'glm' && (row.kind === 'mcp' || (row.kind === 'product' && /mcp|zread|web.?search/i.test(row.product ?? '')))) {
          return t.glmMcp
        }
      }
      if (row.kind === 'heading') return antigravityGroupLabel(row.product, t)
      if (family === 'grok') {
        if (row.product === 'monthly') return t.grokMonthly
        if (row.product === 'on-demand') return t.grokOnDemand
      }
      if (family === 'devin') {
        if (row.product === 'prompt') return t.devinPromptCredits
        if (row.product === 'flow') return t.devinFlowCredits
        if (row.product === 'flex') return t.devinFlexCredits
        if (row.product === 'overage') return t.devinOverage
      }
      if (family === 'command-code' && row.kind === 'credits') return t.commandCodeCredits
      if (family === 'cursor' && row.product === 'included') return t.cursorIncluded
      if (family === 'cursor' && row.kind === 'product') {
        if (row.product === 'auto' || row.key === 'product:auto') return t.cursorComposer
        if (row.product === 'api' || row.key === 'product:api') return t.cursorApi
      }
      if (row.kind === 'product' && row.product) return row.product
      if (row.kind === 'primary') {
        const minutes = row.windowMinutes
        if (typeof minutes === 'number' && minutes > 0 && (minutes < 240 || minutes > 360)) {
          if (minutes % 60 === 0) return `${minutes / 60}h`
          return `${minutes}m`
        }
        return t.primary
      }
      if (row.kind === 'weekly') return t.weekly
      if (row.kind === 'monthly') return t.monthly
      if (row.kind === 'cycle') return t.cycle
      if (row.kind === 'prepaid') return family === 'cline' ? t.clineCredits : t.prepaid
      if (row.kind === 'mcp') return t.glmMcp
      return row.kind ?? t.quota
    }

    function RemainingBar({ remainingPercent }) {
      const color = quotaFillColor(remainingPercent)
      return h('div', { className: 'osubs-bar' },
        h('i', {
          style: {
            background: color,
            transform: `scaleX(${Math.max(0, Math.min(100, remainingPercent)) / 100})`,
          },
        }),
      )
    }

    function QuotaMeter({ t, remainingPercent, amount, label, reset, period, onToggleAmount }) {
      const tone = quotaTone(remainingPercent)
      const color = tone ? `var(--osubs-${tone})` : 'inherit'
      const caption = remainingPercent === undefined ? '' : fill(t.leftPercent, remainingPercent)
      return h('div', { className: 'osubs-qmeter' },
        h('div', { className: 'osubs-qrow-head' },
          h('span', { style: { color: 'var(--osubs-muted)' } }, label),
          h('span', { style: { color, fontWeight: 500 } },
            amount
              ? h('span', {
                onClick: onToggleAmount,
                style: onToggleAmount ? { cursor: 'pointer' } : undefined,
                title: onToggleAmount ? t.quotaUnitToggle : undefined,
              }, `${amount} · `)
              : '',
            caption,
          ),
        ),
        reset && h('span', { className: 'osubs-qreset' }, period ? `${period} · ` : '', reset),
        remainingPercent !== undefined && h(RemainingBar, { remainingPercent }),
      )
    }

    function QuotaRow({ t, row, family, exactUnits, onToggleUnits }) {
      if (row.kind === 'heading') {
        return h('div', { className: 'osubs-qgroup' }, antigravityGroupLabel(row.product, t))
      }
      if (row.kind === 'prepaid') {
        // Unlimited buckets (Devin's -1 sentinel) show a label, no number.
        // Cline credits and Devin's overage balance are USD (upstream cents /
        // micro-USD already converted); the shared prepaid row is Grok's
        // unitless on-demand bag.
        const amount = row.unlimited === true
          ? t.unlimited
          : row.unit === 'usd' || family === 'cline'
            ? formatUsd(Number(row.remaining ?? 0))
            : formatAmount(row.remaining)
        return h('div', { className: 'osubs-qrow-head' },
          h('span', { style: { color: 'var(--osubs-muted)' } }, rowLabel(row, t, family)),
          h('span', { className: 'osubs-mono' }, amount),
        )
      }
      const remaining = remainingPercentOf(row)
      const tokens = row.unit === 'tokens' && row.used !== undefined && row.total !== undefined
      const usd = row.unit === 'usd'
      const amount = row.used !== undefined && row.total !== undefined
        ? tokens && !exactUnits
          ? `${formatTokenAmount(row.used)} / ${formatTokenAmount(row.total)}`
          : usd
            ? `${formatUsd(row.used)} / ${formatUsd(row.total)}`
            : `${formatAmount(row.used)} / ${formatAmount(row.total)}`
        : ''
      const reset = formatReset(row.resetAt, t)
      const periodStartMs = typeof row.periodStart === 'number' ? row.periodStart : Date.parse(row.periodStart ?? '')
      const period = reset && Number.isFinite(periodStartMs)
        ? `${formatDay(periodStartMs)}–${formatDay(row.resetAt)}`
        : undefined
      return h('div', { className: 'osubs-qrow' },
        h(QuotaMeter, {
          t,
          remainingPercent: remaining,
          amount,
          label: rowLabel(row, t, family),
          reset,
          period,
          onToggleAmount: tokens ? onToggleUnits : undefined,
        }),
        row.status && row.status !== 'ok' && h('span', { className: 'osubs-tag osubs-tag--warn' }, row.status),
        Array.isArray(row.noteItems) && row.noteItems.length > 0
          ? h('div', { className: 'osubs-qnote' },
            h('span', { className: 'osubs-qnote-label' }, t.quotaModels),
            h('div', { className: 'osubs-qnote-chips' },
              row.noteItems.map((item) => h('span', {
                className: 'osubs-tag osubs-tag--plain osubs-qnote-chip',
                key: item.name,
              }, item.name, h('span', { className: 'osubs-qnote-count' }, `×${item.count}`))),
            ),
          )
          : row.note && h('span', { className: 'osubs-note' }, row.note),
      )
    }

    function resetCreditRows(quota) {
      const bank = quota?.resetCredits
      if (!bank) return []
      if (Array.isArray(bank.credits) && bank.credits.length > 0) return bank.credits
      const count = bank.availableCount ?? 0
      if (count <= 0) return []
      return Array.from({ length: count }, (_, index) => ({
        id: `available-${index + 1}`,
        expiresAt: bank.nextExpiresAt,
      }))
    }

    function IconWarning({ size = 18 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 14 14', fill: 'none',
        className: 'osubs-dsw-icon', 'aria-hidden': 'true',
      },
        h('path', { d: 'M6.3002 3.32843H7.69986V7.79657H6.3002V3.32843Z', fill: 'currentColor' }),
        h('path', { d: 'M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z', fill: 'currentColor' }),
        h('path', { d: 'M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z', fill: 'currentColor' }),
      )
    }

    function IconClose({ size = 14 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
      },
        h('path', { d: 'M14.1168 13.197L13.197 14.1167L1.8833 2.80303L2.80309 1.88324L14.1168 13.197Z', fill: 'currentColor' }),
        h('path', { d: 'M13.197 1.88326L14.1168 2.80305L2.80309 14.1168L1.8833 13.197L13.197 1.88326Z', fill: 'currentColor' }),
      )
    }

    const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

    function CenterDialog({ titleId, title, subtitle, icon, closeLabel, onClose, cardClass, bodyClass, footer, children }) {
      const cardRef = useRef(null)
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      // Move focus into the dialog (first body control, else the card) and
      // hand it back to the opener on close.
      useEffect(() => {
        const opener = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
        const card = cardRef.current
        if (card && !card.contains(document.activeElement)) {
          const first = card.querySelector('.osubs-dsw-body ' + FOCUSABLE.split(', ').join(', .osubs-dsw-body ')) as HTMLElement | null
          ;(first || card).focus({ preventScroll: true })
        }
        return () => {
          if (opener && typeof opener.focus === 'function' && opener.isConnected) opener.focus({ preventScroll: true })
        }
      }, [])
      const trap = (event) => {
        if (event.key !== 'Tab' || !cardRef.current) return
        const nodes = Array.from(cardRef.current.querySelectorAll(FOCUSABLE)) as HTMLElement[]
        if (nodes.length === 0) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
      return h('div', { className: 'osubs-dsw', role: 'presentation' },
        h('div', { className: 'osubs-dsw-mask', 'aria-hidden': 'true', onClick: onClose }),
        h('div', {
          ref: cardRef,
          tabIndex: -1,
          onKeyDown: trap,
          className: cardClass || 'osubs-dsw-card',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': titleId,
        },
          h('div', { className: 'osubs-dsw-head' },
            h('div', { className: 'osubs-dsw-heading' },
              icon,
              h('div', { className: 'osubs-dsw-titles' },
                h('h2', { id: titleId, className: 'osubs-dsw-title' }, title),
                subtitle && h('p', { className: 'osubs-dsw-sub' }, subtitle),
              ),
            ),
            h('button', {
              type: 'button',
              className: 'osubs-dsw-x',
              'aria-label': closeLabel,
              onClick: onClose,
            }, h(IconClose)),
          ),
          h('div', { className: bodyClass || 'osubs-dsw-body' }, children),
          // Footer sits outside the scrollable body so long forms keep the
          // actions pinned, matching WarnDialog's own markup.
          footer && h('div', { className: 'osubs-dsw-foot' }, footer),
        ),
      )
    }

    function IconCopy() {
      return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('rect', { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5', stroke: 'currentColor', strokeWidth: 1.3 }),
      )
    }

    function IconCopied() {
      return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'M3 8.5l3.2 3L13 4.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    function IconPlus() {
      return h('svg', { width: 10, height: 10, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'M6 1v10M1 6h10', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      )
    }

    // Device / pairing code with one-click copy. Copy falls back silently
    // when the webview denies clipboard access; the code stays selectable.
    function PairCode({ t, code, large }) {
      const [copied, setCopied] = useState(false)
      const timer = useRef(0)
      useEffect(() => () => clearTimeout(timer.current), [])
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(String(code))
          setCopied(true)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), 1600)
        } catch {
          setCopied(false)
        }
      }
      return h('div', { className: 'osubs-pair' + (large ? ' osubs-pair--lg' : '') },
        h('span', { className: 'osubs-pair-label' }, t.userCode),
        h('code', { className: 'osubs-pair-code' }, code),
        h('button', {
          type: 'button',
          className: 'osubs-pair-copy',
          onClick: copy,
          'aria-label': copied ? t.copied : `${t.copy} ${t.userCode}`,
        }, copied ? h(IconCopied) : h(IconCopy), h('span', { 'aria-live': 'polite' }, copied ? t.copied : t.copy)),
      )
    }

    // Mid-auth view of the add-account dialog: what to do next, the pairing
    // code, the authorize link, the manual callback paste, and cancel.
    function AuthPanel({ t, id, pending, paste, onPaste, onManual, onCancel }) {
      const manual = pending?.mode === 'pkce' || pending?.mode === 'oauth'
      return h('div', { className: 'osubs-auth', 'aria-live': 'polite' },
        h('div', { className: 'osubs-auth-status' },
          h('span', { className: 'osubs-auth-dot', 'aria-hidden': 'true' }),
          h('div', { className: 'osubs-auth-copy' },
            h('p', { className: 'osubs-auth-title' }, t.waitingAuth),
            h('p', { className: 'osubs-hint' }, pending?.userCode ? t.waitingAuthCode : t.waitingAuthHint),
          ),
        ),
        pending?.userCode && h(PairCode, { t, code: pending.userCode, large: true }),
        pending?.authorizeUrl && h('a', {
          className: 'osubs-btn osubs-btn--primary osubs-auth-open',
          href: pending.authorizeUrl,
          target: '_blank',
          rel: 'noreferrer',
        }, t.openUrl, h('svg', { className: 'osubs-auth-ext', width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M6 3.5H3.5v9h9V10M9 2.5h4.5V7M13.5 2.5 7.5 8.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))),
        manual && h('form', {
          className: 'osubs-fields osubs-auth-paste',
          onSubmit: (event) => {
            event.preventDefault()
            onManual()
          },
        },
          h('label', { className: 'osubs-field-label', htmlFor: `osubs-paste-${id}` }, t.paste),
          h('div', { className: 'osubs-inline' },
            h('input', {
              id: `osubs-paste-${id}`,
              className: 'osubs-input',
              value: paste,
              onChange: (event) => onPaste(event.target.value),
              placeholder: id === 'antigravity' ? t.antigravityPastePlaceholder : t.pastePlaceholder,
              autoComplete: 'off',
              spellCheck: false,
            }),
            h(Button, { type: 'submit', disabled: !paste.trim(), label: t.submitPaste }),
          ),
          h('p', { className: 'osubs-hint' }, t.pasteHint),
        ),
        h('div', { className: 'osubs-auth-foot' },
          h(Button, { onClick: onCancel, label: t.cancel }),
        ),
      )
    }

    function WarnDialog({ t, description, acknowledged, onAcknowledgedChange, onCancel, onConfirm }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onCancel])
      if (typeof HostRisk === 'function') {
        return h(HostRisk, {
          open: true,
          title: t.quotaResetWarnTitle,
          description,
          acknowledgeLabel: t.quotaResetAck,
          cancelLabel: t.cancel,
          closeLabel: t.quotaResetClose,
          confirmLabel: t.quotaResetConfirmOk,
          acknowledged,
          onAcknowledgedChange,
          onCancel,
          onConfirm,
        })
      }
      return h('div', { className: 'osubs-dsw', role: 'presentation' },
        h('div', { className: 'osubs-dsw-mask', 'aria-hidden': 'true', onClick: onCancel }),
        h('div', {
          className: 'osubs-dsw-card',
          role: 'alertdialog',
          'aria-modal': 'true',
          'aria-labelledby': 'osubs-warn-title',
          'aria-describedby': 'osubs-warn-body',
        },
          h('div', { className: 'osubs-dsw-head' },
            h('h2', { id: 'osubs-warn-title', className: 'osubs-dsw-title' }, t.quotaResetWarnTitle),
            h('button', {
              type: 'button',
              className: 'osubs-dsw-x',
              'aria-label': t.quotaResetClose,
              onClick: onCancel,
            }, h(IconClose)),
          ),
          h('div', { className: 'osubs-dsw-body' },
            h('div', { className: 'osubs-dsw-warning' },
              h(IconWarning),
              h('p', { id: 'osubs-warn-body' }, description),
            ),
            h('label', { className: 'osubs-dsw-ack' },
              h('input', {
                type: 'checkbox',
                checked: acknowledged,
                autoFocus: true,
                onChange: (event) => onAcknowledgedChange(event.currentTarget.checked),
              }),
              h('span', null, t.quotaResetAck),
            ),
          ),
          h('div', { className: 'osubs-dsw-foot' },
            h('button', { type: 'button', className: 'osubs-dsw-btn osubs-dsw-btn--outline', onClick: onCancel }, t.cancel),
            h('button', {
              type: 'button',
              className: 'osubs-dsw-btn osubs-dsw-btn--primary',
              disabled: !acknowledged,
              onClick: onConfirm,
            }, t.quotaResetConfirmOk),
          ),
        ),
      )
    }

    function expiryOf(credit) {
      return typeof credit?.expiresAt === 'number' && Number.isFinite(credit.expiresAt) && credit.expiresAt > 0
        ? credit.expiresAt
        : Infinity
    }

    /**
     * Reset windows per family. GLM banks one card type per window (each clears
     * only its own); a Codex credit or a Grok card refreshes the weekly window.
     * Every group spends its earliest-expiring card. A card whose expiry has
     * passed drops out at `now` instead of waiting for the next quota read,
     * so the count (and the spend ghost) moves the moment it lapses.
     */
    function resetGroups(quota, family, now = Date.now()) {
      const credits = resetCreditRows(quota).filter((credit) => expiryOf(credit) > now)
      const defs = family === 'glm'
        ? [{ key: 'FIVE_HOUR', window: 'resetWinFive' }, { key: 'WEEK', window: 'resetWinWeek' }]
        : [{ key: 'all', window: 'resetWinWeek' }]
      return defs.map((def) => ({
        ...def,
        cards: credits
          .filter((credit) => family !== 'glm' || credit.resetType === def.key)
          .sort((a, b) => expiryOf(a) - expiryOf(b)),
      }))
    }

    /**
     * The count sits on a small card with up to two lips peeking behind it.
     * When the count drops, a ghost of the old top card flies off the stack
     * and the new number rolls in beneath it.
     */
    let resetTipSeq = 0

    /**
     * Hover / focus on the count card lists every banked card's expiry, one
     * line per card in spend order (earliest first). Esc dismisses; the tip
     * itself stays hoverable so the pointer can move onto it.
     */
    /**
     * Urgency ladder for the stack's earliest-expiring card:
     * < 24h the ink goes bad-red; < 1h the card breathes, faster as the
     * end approaches; < 10min the face swaps the count for a live
     * seconds countdown (the real count stays in the hover tooltip).
     */
    const RESET_URGENT_MS = 24 * 60 * 60_000
    const RESET_BLINK_MS = 60 * 60_000
    const RESET_CD_MS = 10 * 60_000
    /** Blink period: ~1600ms at 60min → ~400ms at zero, quadratic ease. */
    function resetBlinkInt(leftMs) {
      if (leftMs >= RESET_BLINK_MS) return null
      const f = 1 - Math.max(0, leftMs) / RESET_BLINK_MS
      return Math.round(1600 - 1200 * f * f)
    }
    function formatCountdown(leftMs) {
      const total = Math.max(0, Math.ceil(leftMs / 1000))
      const m = Math.floor(total / 60)
      const s = total % 60
      return `${m}:${String(s).padStart(2, '0')}`
    }

    function ResetStack({ t, count, cards = [], busy, ghost, onGhostDone }) {
      const [tipOpen, setTipOpen] = useState(false)
      const [tipId] = useState(() => `osubs-rtip-${++resetTipSeq}`)
      const [tickNow, setTickNow] = useState(0)
      const hasTip = count > 0 && cards.length > 0
      useEffect(() => {
        if (!tipOpen) return
        const onKey = (event) => { if (event.key === 'Escape') setTipOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [tipOpen])
      useEffect(() => { if (!hasTip) setTipOpen(false) }, [hasTip])
      const urgentAt = count > 0 ? expiryOf(cards[0]) : Infinity
      // Tick 1s inside the countdown window, 5s inside the blink window —
      // where the urgency flags can only flip near boundaries this also
      // re-derives them on time.
      const leftMs0 = urgentAt - Date.now()
      const tickRate = count > 0 && leftMs0 <= RESET_CD_MS + 10_000
        ? 1000
        : leftMs0 <= RESET_BLINK_MS + 60_000 ? 5000 : 0
      useEffect(() => {
        if (!tickRate) return
        let live = true
        let timer: ReturnType<typeof setTimeout> | undefined
        const step = () => {
          if (!live) return
          setTickNow(Date.now())
          timer = setTimeout(step, tickRate)
        }
        timer = setTimeout(step, tickRate)
        return () => { live = false; clearTimeout(timer) }
      }, [tickRate])
      const leftMs = urgentAt - (tickNow || Date.now())
      const urgent = urgentAt < Infinity && leftMs < RESET_URGENT_MS
      const blinkMs = urgent ? resetBlinkInt(leftMs) : null
      const cd = urgent && leftMs <= RESET_CD_MS && leftMs > 0 ? Math.ceil(leftMs / 1000) : 0
      const depth = Math.max(0, Math.min(count, 3))
      const classes = ['osubs-rstack']
      if (count === 0) classes.push('osubs-rstack--empty')
      if (busy) classes.push('osubs-rstack--busy')
      if (urgent) classes.push('osubs-rstack--urgent')
      if (blinkMs) classes.push('osubs-rstack--blink')
      const open = () => { if (hasTip) setTipOpen(true) }
      const shut = () => setTipOpen(false)
      return h('div', {
        className: classes.join(' '),
        'data-depth': depth,
        style: blinkMs ? { '--osubs-blink-int': `${blinkMs}ms` } : undefined,
        tabIndex: hasTip ? 0 : undefined,
        'aria-label': hasTip ? fill(t.resetTipLabel, count) : undefined,
        'aria-describedby': hasTip && tipOpen ? tipId : undefined,
        onMouseEnter: open,
        onMouseLeave: shut,
        onFocus: open,
        onBlur: shut,
      },
        h('span', { className: 'osubs-rcard', 'aria-hidden': 'true' },
          h('span', {
            // cd: remount each second so the tick animation replays as a beat.
            key: cd ? `cd-${cd}` : `n-${count}`,
            className: [
              'osubs-rcard-n',
              cd ? 'osubs-rcard-n--cd osubs-rcard-n--tick' : '',
              ghost ? 'osubs-rcard-n--in' : '',
            ].filter(Boolean).join(' '),
          }, cd || count),
          h('span', { className: cd ? 'osubs-rcard-u osubs-rcard-u--cd' : 'osubs-rcard-u' },
            cd ? t.resetUnitCd : t.resetUnit),
        ),
        ghost && h('span', {
          key: `ghost-${ghost.token}`,
          className: 'osubs-rcard osubs-rcard--ghost',
          'aria-hidden': 'true',
          onAnimationEnd: onGhostDone,
        },
          h('span', { className: 'osubs-rcard-n' }, ghost.count),
          h('span', { className: 'osubs-rcard-u' }, t.resetUnit),
        ),
        hasTip && tipOpen && h('span', { id: tipId, role: 'tooltip', className: 'osubs-rtip' },
          cards.map((card, index) => {
            const stamp = formatStamp(card.expiresAt)
            return h('span', { className: 'osubs-rtip-line', key: card.id ?? index },
              h('span', { className: 'osubs-rtip-i' }, index + 1),
              h('span', null, stamp ? fill(t.resetExpires, stamp) : t.resetNoExpiry),
            )
          }),
        ),
      )
    }

    function ResetBank({ t, quota, family, onReset }) {
      const [busyKey, setBusyKey] = useState(null)
      const [pending, setPending] = useState(null)
      const [acked, setAcked] = useState(false)
      const [ghosts, setGhosts] = useState({})
      const [now, setNow] = useState(0)
      const seen = useRef(null)
      const groups = resetGroups(quota, family, now || Date.now())
      // One shared clock for the urgency ladder. 1s while any group is
      // counting down or could cross the 10-minute edge, else 15s while
      // any group is inside the 24h red window (so the edge lands on
      // time), otherwise idle.
      const minLeftMs = groups.reduce((acc, group) => (
        group.cards.length ? Math.min(acc, expiryOf(group.cards[0])) : acc
      ), Infinity)
      const leftNow = minLeftMs - Date.now()
      const bankTick = leftNow < Infinity
        ? (leftNow <= RESET_CD_MS + 10_000 ? 1000 : leftNow <= RESET_URGENT_MS + 60_000 ? 15_000 : 0)
        : 0
      useEffect(() => {
        if (!bankTick) return
        let live = true
        let timer: ReturnType<typeof setTimeout> | undefined
        const step = () => {
          if (!live) return
          setNow(Date.now())
          timer = setTimeout(step, bankTick)
        }
        timer = setTimeout(step, bankTick)
        return () => { live = false; clearTimeout(timer) }
      }, [bankTick])
      const counts = groups.map((group) => `${group.key}:${group.cards.length}`).join('|')
      useEffect(() => {
        const next = Object.fromEntries(groups.map((group) => [group.key, group.cards.length]))
        const before = seen.current
        seen.current = next
        if (!before) return
        const spent = {}
        for (const group of groups) {
          const was = before[group.key]
          if (typeof was === 'number' && group.cards.length < was) {
            spent[group.key] = { count: was, token: Date.now() }
          }
        }
        if (Object.keys(spent).length === 0) return
        setGhosts((current) => ({ ...current, ...spent }))
        // animationend is the normal exit; this covers a hidden or detached row.
        const timer = setTimeout(() => {
          setGhosts((current) => {
            const rest = { ...current }
            for (const key of Object.keys(spent)) {
              if (rest[key]?.token === spent[key].token) delete rest[key]
            }
            return rest
          })
        }, 1200)
        return () => clearTimeout(timer)
      }, [counts])
      if (typeof onReset !== 'function') return null
      const close = () => {
        setPending(null)
        setAcked(false)
      }
      const confirm = async () => {
        if (!pending || busyKey || !acked) return
        const { group, credit } = pending
        close()
        setBusyKey(group.key)
        try {
          await onReset(credit)
        } finally {
          setBusyKey(null)
        }
      }
      const dropGhost = (key) => setGhosts((current) => {
        if (!current[key]) return current
        const rest = { ...current }
        delete rest[key]
        return rest
      })
      const whenOf = (credit) => formatStamp(credit?.expiresAt) || formatReset(credit?.expiresAt, t, 'expires') || '—'
      return h('fieldset', { className: 'osubs-qbox' },
        h('legend', { className: 'osubs-qbox-title' }, t.resetBank),
        groups.map((group) => {
          const count = group.cards.length
          const next = group.cards[0]
          const stamp = next ? formatStamp(next.expiresAt) : ''
          const groupLeftMs = next ? expiryOf(next) - (now || Date.now()) : Infinity
          const groupUrgent = groupLeftMs < RESET_URGENT_MS
          const groupCd = groupUrgent && groupLeftMs <= RESET_CD_MS && groupLeftMs > 0
          const sub = count === 0
            ? t.resetNone
            : groupCd ? fill(t.resetCd, formatCountdown(groupLeftMs))
            : stamp ? fill(count === 1 ? t.resetExpires : t.resetNext, stamp) : ''
          const ghost = ghosts[group.key]
          const busy = busyKey === group.key
          return h('div', {
            className: `osubs-reset-row${ghost ? ' osubs-reset-row--spent' : ''}`,
            key: group.key,
          },
            h(ResetStack, { t, count, cards: group.cards, busy, ghost, onGhostDone: () => dropGhost(group.key) }),
            h('div', { className: 'osubs-reset-meta', 'aria-live': 'polite' },
              h('span', { className: 'osubs-reset-when' }, t[group.window]),
              h('span', {
                className: `osubs-reset-rel${groupUrgent ? ' osubs-reset-rel--bad' : ''}`,
              },
                h('span', { className: 'osubs-sr' }, fill(t.resetLeft, count)),
                sub,
              ),
            ),
            h(Button, {
              size: 'sm',
              disabled: busyKey !== null || count === 0,
              onClick: () => {
                if (busyKey || !next) return
                setAcked(false)
                setPending({ group, credit: next })
              },
              label: busy ? t.quotaResetBusy : t.quotaReset,
            }),
          )
        }),
        pending && h(WarnDialog, {
          t,
          description: fill(t.resetConfirm, { window: t[pending.group.window], when: whenOf(pending.credit) }),
          acknowledged: acked,
          onAcknowledgedChange: setAcked,
          onCancel: close,
          onConfirm: confirm,
        }),
      )
    }

    function renderQuotaRows(rows, t, family, units) {
      const nodes = []
      let cluster
      const flush = () => {
        if (!cluster) return
        nodes.push(h('div', { className: 'osubs-qcluster', key: cluster.key },
          h('div', { className: 'osubs-qgroup' }, antigravityGroupLabel(cluster.title, t)),
          cluster.rows.map((row) => h(QuotaRow, { t, row, family, ...units, key: row.key })),
        ))
        cluster = undefined
      }
      for (const row of rows) {
        if (row.kind === 'heading') {
          flush()
          cluster = { key: row.key, title: row.product, rows: [] }
          continue
        }
        if (cluster && (row.kind === 'weekly' || row.kind === 'primary')) {
          cluster.rows.push(row)
          continue
        }
        flush()
        nodes.push(h(QuotaRow, { t, row, family, ...units, key: row.key }))
      }
      flush()
      return nodes
    }

    function QuotaBlock({ t, quota, onReset, family }) {
      const [exactUnits, setExactUnits] = useState(readExactAmountUnits)
      if (!quota || quota.status === 'idle') return null
      const rows = Array.isArray(quota.rows) ? quota.rows : []
      const hasUsage = rows.some((row) => (
        typeof row.usedPercent === 'number'
        || typeof row.remainingPercent === 'number'
        || (row.kind === 'prepaid' && typeof row.remaining === 'number' && row.remaining > 0)
        || (row.used !== undefined && row.total !== undefined)
      ))
      const hasTokens = rows.some((row) => row.unit === 'tokens' && row.used !== undefined && row.total !== undefined)
      const units = hasTokens
        ? {
          exactUnits,
          onToggleUnits: () => setExactUnits((current) => {
            const next = !current
            writeExactAmountUnits(next)
            return next
          }),
        }
        : undefined
      return h('div', { className: 'osubs-quota' },
        quota.status === 'loading' && rows.length === 0 && h('p', { className: 'osubs-hint' }, t.quotaLoading),
        quota.status === 'error' && !hasUsage && h('p', {
          className: 'osubs-hint osubs-bad',
          title: quota.error || undefined,
        }, `${t.quotaFailed}${quota.error ? ` · ${formatQuotaError(quota.error)}` : ''}`),
        quota.status === 'ready' && !hasUsage && family !== 'chatgpt' && h('p', { className: 'osubs-hint' }, t.quotaUnknown),
        family === 'chatgpt' && quota.status !== 'error' && h('p', { className: 'osubs-hint' },
          `${t.chatgptPlanHint} `,
          h('a', { className: 'osubs-link', href: 'https://chatgpt.com/settings/usage', target: '_blank', rel: 'noreferrer' }, t.chatgptManageUsage)),
        renderQuotaRows(rows, t, family, units),
        h(ResetBank, { t, quota, family, onReset }),
      )
    }
