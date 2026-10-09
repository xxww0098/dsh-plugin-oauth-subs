// Settings UI part — inlined into the client.ts factory by scripts/ui-bundle.ts.
// About / version page and the Donate page.

    function aboutLink(href, text, extra?) {
      const label = text || '—'
      if (!href || label === '—') return h('span', extra ? { className: extra } : null, label)
      return h('a', {
        className: extra ? `osubs-link ${extra}` : 'osubs-link',
        href, target: '_blank', rel: 'noreferrer',
      }, label)
    }

    function IconCheck() {
      return h('svg', {
        width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }, h('path', { d: 'M20 6 9 17l-5-5' }))
    }

    function IconRefresh() {
      return h('svg', {
        width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M21 12a9 9 0 1 1-3-6.7' }),
        h('path', { d: 'M21 3v6h-6' }),
      )
    }

    function IconEye() {
      return h('svg', {
        width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z' }),
        h('circle', { cx: 12, cy: 12, r: 2.8 }),
      )
    }

    function statusLabel(t, update) {
      if (!update) return ''
      if (update.status === 'update') return fill(t.updateReady, update.latest?.tag || update.latest?.name || '')
      if (update.status === 'current') return t.updateCurrent
      if (update.status === 'ahead') return t.updateAhead
      if (update.status === 'unknown') return t.updateUnknown
      if (update.status === 'error') return `${t.updateError}${update.error ? ` · ${update.error}` : ''}`
      return ''
    }

    /** Apply self-installs; the label reports the outcome or the manual path. */
    function applyLabel(t, update) {
      const apply = update?.apply
      if (!apply || apply.status === 'none') return ''
      if (apply.status === 'installed') {
        return fill(apply.restart === 'app' ? t.updateInstalledApp : t.updateInstalledHost,
          apply.version || update.latest?.tag || update.latest?.name || '')
      }
      if (apply.status === 'manual') return apply.command ? fill(t.updateManual, apply.command) : ''
      if (apply.status === 'failed') {
        const hint = apply.command ? ` · ${fill(t.updateManual, apply.command)}` : ''
        return `${t.updateFailed}${apply.error ? ` · ${apply.error}` : ''}${hint}`
      }
      return ''
    }

    function parseAboutVersion(tag) {
      const match = String(tag ?? '').trim().match(/(?:v|dsh-v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/)
      if (!match) return
      const prerelease = match[4] || ''
      const raw = prerelease ? `${match[1]}.${match[2]}.${match[3]}-${prerelease}` : `${match[1]}.${match[2]}.${match[3]}`
      return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease, raw }
    }

    function compareAboutVersions(left, right) {
      const a = parseAboutVersion(left)
      const b = parseAboutVersion(right)
      if (!a || !b) return 0
      if (a.major !== b.major) return a.major - b.major
      if (a.minor !== b.minor) return a.minor - b.minor
      if (a.patch !== b.patch) return a.patch - b.patch
      if (!a.prerelease && b.prerelease) return 1
      if (a.prerelease && !b.prerelease) return -1
      if (!a.prerelease && !b.prerelease) return 0
      return a.prerelease.localeCompare(b.prerelease)
    }

    const ABOUT_REPO = 'https://github.com/xxww0098/dsh-plugin-oauth-subs'
    const aboutRepoOf = (local, update) => local?.repo || update?.repo || ABOUT_REPO
    /** The version About shows: a linked tree's derived `-dev` build, else the fresher of host and check. */
    function aboutVersionOf(local, update) {
      const linked = Boolean(update?.linkedPath || local?.linkedPath) || update?.linked === true || local?.linked === true
      const devVersion = update?.devVersion || local?.devVersion
      return (linked && devVersion) || fresherAboutVersion(update?.version, local?.version) || '—'
    }

    function fresherAboutVersion(left, right) {
      const a = parseAboutVersion(left)
      const b = parseAboutVersion(right)
      if (a && b) return compareAboutVersions(a.raw, b.raw) >= 0 ? a.raw : b.raw
      if (a) return a.raw
      if (b) return b.raw
      return left || right || ''
    }

    function IconLink() {
      return h('svg', {
        width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }),
        h('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }),
      )
    }

    function IconArrowUp() {
      return h('svg', {
        width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }, h('path', { d: 'M12 19V5' }), h('path', { d: 'm5 12 7-7 7 7' }))
    }

    function IconInfo() {
      return h('svg', {
        width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('circle', { cx: 12, cy: 12, r: 9 }),
        h('path', { d: 'M12 16v-4' }),
        h('path', { d: 'M12 8h.01' }),
      )
    }

    /** Whole row toggles the switch; note carries the 15-minute cadence + last run. */
    function AutoUpdateRow({ t, note, checked, onChange }) {
      return h('label', { className: 'osubs-kv-row osubs-auto-row', title: t.autoUpdate },
        h('input', {
          type: 'checkbox',
          checked,
          'aria-label': t.autoUpdate,
          onChange,
        }),
        h('span', { className: 'osubs-auto-main' },
          h('span', { className: 'osubs-auto-name' }, t.autoUpdateShort),
          note && h('span', { className: 'osubs-auto-note' }, note),
        ),
        h('span', { className: 'osubs-auto-track', 'aria-hidden': 'true' }),
      )
    }

    /** HH:mm today, YYYY-MM-DD HH:mm otherwise — for the auto-update last-run note. */
    function formatClock(iso) {
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return String(iso || '')
      const pad = (n) => String(n).padStart(2, '0')
      const hm = pad(date.getHours()) + ':' + pad(date.getMinutes())
      if (date.toDateString() === new Date().toDateString()) return hm
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + hm
    }

    function autoRunText(t, entry) {
      if (!entry) return ''
      if (entry.status === 'installed') return fill(t.autoRunInstalled, entry.latest || entry.version || '')
      if (entry.status === 'current') return t.autoRunCurrent
      if (entry.status === 'update') return fill(t.autoRunUpdate, entry.latest || entry.version || '')
      if (entry.status === 'failed') return t.autoRunFailed
      if (entry.status === 'manual') return t.autoRunFailed
      return t.autoRunUnknown
    }

    /** Status banner: icon tile + one-line conclusion + subcopy; the apply
        CTA or latest tag docks on the right. */
    function VersionStat({ tone, iconTone, icon, title, sub, side, busy }) {
      const cls = ['osubs-vstat']
      if (tone) cls.push(`osubs-vstat--${tone}`)
      if (busy) cls.push('osubs-vstat--busy')
      const icCls = ['osubs-vstat-ic']
      if (iconTone) icCls.push(`osubs-vstat-ic--${iconTone}`)
      return h('div', { className: cls.join(' ') },
        icon && h('span', { className: icCls.join(' '), 'aria-hidden': 'true' }, icon),
        h('span', { className: 'osubs-vstat-main' },
          h('span', { className: 'osubs-vstat-title' }, title),
          sub && h('span', { className: 'osubs-vstat-sub' }, sub),
        ),
        side && h('span', { className: 'osubs-vstat-side' }, side),
      )
    }

    /** `code` and **bold** in a release bullet, matching the notes card chips. */
    function noteNodes(text) {
      const nodes = []
      const re = /`([^`]+)`|\*\*([^*]+)\*\*/g
      let last = 0
      let match
      let key = 0
      const source = String(text ?? '')
      while ((match = re.exec(source))) {
        if (match.index > last) nodes.push(source.slice(last, match.index))
        if (match[1] != null) nodes.push(h('code', { key: key++, className: 'osubs-notes-code' }, match[1]))
        else nodes.push(h('strong', { key: key++ }, match[2]))
        last = match.index + match[0].length
      }
      if (last < source.length) nodes.push(source.slice(last))
      return nodes.length ? nodes : [source]
    }

    function AboutPanel({
      t,
      local,
      update,
      busy,
      onCheck,
      onApply,
      autoUpdate,
      autoState,
      onAutoUpdate,
      rpc,
    }) {
      const [notesOpen, setNotesOpen] = useState(false)
      const [notes, setNotes] = useState(null)
      const notesGen = useRef(0)
      const repo = aboutRepoOf(local, update)
      const slug = local?.repoSlug || update?.repoSlug || 'xxww0098/dsh-plugin-oauth-subs'
      const latest = update?.latest
      const latestTag = latest?.tag || latest?.name || ''
      const apply = applyLabel(t, update)
      const stale = update?.staleProcess || local?.staleProcess
      const disk = update?.disk || local?.disk
      // The restart wording follows the install kind: the desktop profile is
      // Electron-managed, so its users restart an app, not a 「宿主」 process.
      const restartKind = update?.restartKind || local?.restartKind
      // A 「本地插件目录」 install is a link: into a working tree outside the
      // profiles root. Its manifest version is the repo's official number, so
      // About shows the derived `<version>-dev` build instead of the release.
      const linkedPath = update?.linkedPath || local?.linkedPath
      const linked = Boolean(linkedPath) || update?.linked === true || local?.linked === true
      const devVersion = update?.devVersion || local?.devVersion
      const version = aboutVersionOf(local, update)
      // Linked: the hot-reload note lives on the banner, so the row only
      // reports the last run. A release install keeps the 15-minute cadence
      // text + outcome (a link's outcome compares the repo's official number
      // with the release tag and would always read as 「已是最新」).
      const autoNote = () => {
        const bits = linked ? [] : [restartKind === 'app' ? t.autoUpdateHourlyApp : t.autoUpdateHourly]
        if (autoState?.at) {
          const outcome = linked ? '' : autoRunText(t, autoState)
          bits.push(fill(t.autoLastCheck, formatClock(autoState.at)) + (outcome ? ' · ' + outcome : ''))
        }
        return bits.join(' · ')
      }
      const published = latest?.publishedAt ? fill(t.published, latest.publishedAt) : ''
      const currentBit = version !== '—' ? fill(t.verSubCurrent, version) : ''

      const pluginCta = !linked && update?.status === 'update' && latestTag
        ? h(Button, {
            size: 'sm',
            mark: true,
            disabled: busy,
            label: t.updateTo,
            onClick: onApply,
          })
        : null

      // The banner owns the status conclusion — the head keeps the changelog
      // and check buttons; only 当前版本 / 最新版本 exist as version slots.
      const vstat = linked
        ? h(VersionStat, { busy, icon: h(IconLink), title: fill(t.verLinkedRun, version), sub: t.autoUpdateLinked,
            side: latestTag && h('span', {
              className: 'osubs-vstat-num' + (update?.status === 'update' ? ' osubs-vstat-num--warn' : ''),
            }, `${t.latest} ${latestTag}`) })
        : update?.status === 'update' && latestTag
          ? h(VersionStat, { busy, tone: 'warn', icon: h(IconArrowUp),
              title: fill(t.verUpdateTitle, latestTag), sub: [currentBit, published].filter(Boolean).join(' · '), side: pluginCta })
          : update?.status === 'current'
            ? h(VersionStat, { busy, icon: h(IconCheck), iconTone: 'ok',
                title: fill(t.verCurrentTitle, version), sub: [t.verCurrentSub, published].filter(Boolean).join(' · ') })
            : update?.status === 'ahead'
              ? h(VersionStat, { busy, icon: h(IconArrowUp), title: t.updateAhead,
                  sub: [currentBit, latestTag && `${t.latest} ${latestTag}`, published].filter(Boolean).join(' · ') })
              : update?.status === 'error'
                ? h(VersionStat, { busy, tone: 'bad', icon: h(IconWarning, { size: 15 }),
                    title: t.updateError, sub: update.error || '' })
                : h(VersionStat, { busy, icon: h(IconInfo), title: `${t.installed} ${version}`,
                    sub: update?.status === 'unknown' ? t.updateUnknown : t.verUnchecked })

      const pluginCard = h('section', { className: 'osubs-card' },
        h('header', { className: 'osubs-card-head' },
          h('div', { className: 'osubs-head-main' },
            h('h3', { className: 'osubs-card-title' }, t.pluginAboutTitle || t.aboutTitle),
          ),
          h('div', { className: 'osubs-about-actions' },
            h(Button, {
              size: 'sm',
              onClick: () => {
                setNotesOpen(true)
                if (notes && !notes.error) return
                const gen = ++notesGen.current
                setNotes(null)
                Promise.resolve()
                  .then(() => callRpc(rpc, 'changelog'))
                  .then((result) => {
                    if (notesGen.current !== gen) return
                    const releases = Array.isArray(result?.releases) ? result.releases.slice(0, 3) : []
                    setNotes({ releases })
                  })
                  .catch((caught) => {
                    if (notesGen.current !== gen) return
                    const message = caught instanceof Error ? caught.message : String(caught)
                    setNotes({ error: isUnknownOauthMethod(message) ? t.hostStale : message, releases: [] })
                  })
              },
              label: t.changelog,
            }),
            h(Button, {
              size: 'sm',
              onClick: onCheck,
              disabled: busy,
              label: busy ? t.checking : t.checkUpdate,
            }),
          ),
        ),
        h('div', { className: 'osubs-about' },
          vstat,
          h('div', { className: 'osubs-kv' },
            h('div', { className: 'osubs-kv-row' },
              h('span', null, t.repo),
              h('a', { className: 'osubs-link osubs-link--icon', href: repo, target: '_blank', rel: 'noreferrer' },
                h(TabIcon, { name: 'github' }), slug),
            ),
            h(AutoUpdateRow, {
              t,
              note: autoNote(),
              checked: autoUpdate === true,
              onChange: (event) => onAutoUpdate(event.currentTarget.checked),
            }),
          ),
          h('div', { className: 'osubs-hints' },
            linked && update?.status === 'error' && h('p', { className: 'osubs-hint osubs-bad' }, statusLabel(t, update)),
            // On a linked tree the generic tail (remove and re-add from
            // GitHub) would replace the hot link with an installed copy —
            // the link's divergence is restart-only, code rides hmr.
            stale && disk && h('p', { className: 'osubs-hint osubs-warn' },
              fill(linked ? t.updateStaleProcessLinked
                : restartKind === 'app' ? t.updateStaleProcessApp : t.updateStaleProcess, disk)),
            apply && h('p', { className: 'osubs-hint' }, apply),
          ),
        ),
      )

      const releases = Array.isArray(notes?.releases) ? notes.releases : []
      const notesTitle = releases[0]?.tag ? fill(t.changelogTitle, releases[0].tag) : t.changelog
      const notesBody = !notes
        ? h('p', { className: 'osubs-notes-status' }, t.changelogLoading)
        : notes.error
          ? h('p', { className: 'osubs-notes-status osubs-bad' }, `${t.changelogError}${notes.error ? ` · ${notes.error}` : ''}`)
          : releases.length === 0
            ? h('p', { className: 'osubs-notes-status' }, t.changelogEmpty)
            : h('div', { className: 'osubs-notes' }, releases.map((release) => h('section', {
                key: release.tag || release.name,
                className: 'osubs-notes-rel',
              },
                h('h3', { className: 'osubs-notes-ver' }, release.tag || release.name),
                ...(Array.isArray(release.sections) ? release.sections : []).map((section) => h('div', {
                  key: section.title || 'notes',
                  className: 'osubs-notes-sec',
                },
                  section.title && h('h4', { className: 'osubs-notes-cat' }, section.title),
                  h('ul', { className: 'osubs-notes-list' },
                    (section.items || []).map((item, index) => h('li', { key: index }, ...noteNodes(item)))),
                )),
              )))
      const notesDialog = notesOpen && h(CenterDialog, {
        titleId: 'osubs-notes-title',
        title: notesTitle,
        closeLabel: t.dialogClose,
        onClose: () => setNotesOpen(false),
        cardClass: 'osubs-dsw-card osubs-dsw-card--notes',
        bodyClass: 'osubs-dsw-body osubs-dsw-body--notes',
        footer: h('button', {
          type: 'button',
          className: 'osubs-dsw-btn osubs-dsw-btn--primary',
          onClick: () => setNotesOpen(false),
        }, t.dialogClose),
      }, notesBody)

      const Frag = Fragment || 'div'
      return h(Frag, null, pluginCard, notesDialog)
    }

    /** Donate tab: the payment QR codes ship as package assets; the host
        reads them once and serves data URIs over RPC — the client bundle is
        a classic script with no static-file channel of its own. */
    function DonatePanel({ t, rpc, active }) {
      const [codes, setCodes] = useState(null)
      const [error, setError] = useState('')
      useEffect(() => {
        if (!active || codes !== null || error) return
        let stale = false
        Promise.resolve()
          .then(() => callRpc(rpc, 'donate'))
          .then((result) => {
            if (!stale) setCodes(result && typeof result === 'object' ? result : {})
          })
          .catch((caught) => {
            if (stale) return
            const message = caught instanceof Error ? caught.message : String(caught)
            setError(isUnknownOauthMethod(message) ? t.hostStale : message)
          })
        return () => { stale = true }
      }, [active])

      const qr = (key, label, brand, end = false) => h('div', { className: 'osubs-donate-qr' + (end ? ' osubs-donate-qr--end' : '') },
        h('img', { src: codes[key], alt: label }),
        h('span', { className: 'osubs-donate-name', style: { '--osubs-donate-brand': brand } }, label))

      return h('section', { className: 'osubs-card' },
        h('header', { className: 'osubs-card-head' },
          h('div', { className: 'osubs-head-main' },
            h('h3', { className: 'osubs-card-title' }, t.donateTitle))),
        h('p', { className: 'osubs-hint' }, t.donateHint),
        error && h('p', { className: 'osubs-hint osubs-bad' }, error),
        codes === null && !error && h('p', { className: 'osubs-hint' }, t.loading),
        codes !== null && h('div', { className: 'osubs-donate' },
          codes.wechat && qr('wechat', t.donateWechat, '#07c160'),
          codes.bunny && h('div', { className: 'osubs-donate-meme' },
            h('img', { src: codes.bunny, alt: t.donateMeme })),
          codes.alipay && qr('alipay', t.donateAlipay, '#1677ff', true),
          !codes.wechat && !codes.alipay && h('p', { className: 'osubs-hint' }, t.donateEmpty)))
    }
