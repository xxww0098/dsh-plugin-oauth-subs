/**
 * Browser half. Registers the "OAuth 订阅" workbench as a main sidebar
 * panel (左栏插件按钮下方的订阅入口 → 额度/模型/设置).
 *
 * DSH client-modules serves the compiled classic script and requires the
 * `__ModuleLoader__.load` handoff (id = package name). Shared requires are
 * only `react` plus the shell table; everything else stays inlined.
 */
window.__ModuleLoader__.load({
    id: 'dsh-plugin-oauth-subs',
    factory: (require) => {
        const module = { exports: {} };
        const exports = module.exports;
        const { createElement: h, useCallback, useEffect, useState, useRef, Fragment } = require('react');
        function tryHost(id) {
            try {
                return require(id);
            }
            catch {
                return undefined;
            }
        }
        const primitives = tryHost('@deepseek-ai/dsh-client-ui-primitives');
        const HostRisk = primitives && (primitives.RiskConfirmation || primitives.default && primitives.default.RiskConfirmation);
        const name = 'dsh-plugin-oauth-subs-client';
        const inject = ['slots', 'connection'];
        const COPY = {
            zh: {
                nav: '订阅额度与模型',
                panel: '订阅',
                providers: '供应商',
                antigravityPastePlaceholder: 'http://localhost:51121/oauth-callback?code=…&state=…',
                antigravityVerify: 'Google 需要验证此账号才能对话',
                antigravityVerifyGo: '去验证',
                cursorImport: '导入本机 Cursor',
                cursorImportEmpty: '本机没有 Cursor CLI 或 IDE 登录',
                ollamaLoginApiKey: '粘贴 API Key',
                ollamaKeyPlaceholder: 'ollama.com API key',
                ollamaKeyGo: '保存密钥',
                ollamaKeyHint: '在 ollama.com/settings/keys 创建。也可设置环境变量 OLLAMA_API_KEY。',
                ollamaImport: '导入 OLLAMA_API_KEY',
                ollamaImportEmpty: '未找到 OLLAMA_API_KEY',
                kimiLoginApiKey: '粘贴 API Key',
                kimiKeyPlaceholder: 'KIMI_API_KEY 或 sk-…',
                kimiKeyGo: '保存密钥',
                kimiKeyHint: '粘贴 Kimi Code API key。也可导入本机 ~/.kimi-code/credentials/kimi-code.json。',
                kimiImport: '导入本机 Kimi Code',
                kimiImportEmpty: '未找到 kimi-code.json 或 KIMI_API_KEY',
                devinLoginApiKey: '粘贴会话 Token',
                devinKeyPlaceholder: 'devin-session-token$…',
                devinKeyGo: '保存密钥',
                devinKeyHint: '粘贴 Devin 会话 token。也可导入本机 ~/.local/share/devin/credentials.toml。',
                devinImport: '导入本机 Devin CLI',
                devinImportEmpty: '未找到 credentials.toml',
                clineImport: '导入本机 Cline CLI',
                clineImportEmpty: '未找到 ~/.cline/data/settings/providers.json',
                commandCodeLoginApiKey: '粘贴 API Key',
                commandCodeKeyPlaceholder: 'user_… 或 COMMAND_CODE_API_KEY',
                commandCodeKeyGo: '保存密钥',
                commandCodeKeyHint: '粘贴 Command Code API key。也可导入本机 ~/.commandcode/auth.json 或 COMMAND_CODE_API_KEY。',
                commandCodeImport: '导入本机 Command Code',
                commandCodeImportEmpty: '未找到 auth.json 或 COMMAND_CODE_API_KEY',
                commandCodeCredits: '额度',
                codexCredits: '额度',
                clineCredits: '额度余额',
                clineDevice: '设备码登录',
                apiKeyTitle: 'API Key',
                opencodeGoHint: '粘贴 OpenCode Go API key 用于对话；会话 cookie 与工作区 ID 只用来读额度。可添加多个账号，点卡片切换。',
                opencodeGoKey: 'API Key',
                opencodeGoKeyPlaceholder: 'sk-… / OPENCODE_API_KEY',
                opencodeGoKeySet: '已保存，留空保持不变',
                opencodeGoCookie: '会话 cookie',
                opencodeGoCookiePlaceholder: '__Host-console_session=… 或 auth=Fe26.2…',
                opencodeGoCookieSet: '已保存，留空保持不变',
                opencodeGoWorkspace: '工作区 ID（可选）',
                opencodeGoWorkspacePlaceholder: 'wrk_…/org_… 或 https://opencode.ai/console/wrk_…/go',
                opencodeGoSave: '保存',
                opencodeGoFailed: '保存失败',
                opencodeGoHostStale: '宿主进程还是旧版本，请重启宿主后再保存',
                hostStale: '宿主进程还是旧版本，请重启宿主后再试',
                opencodeGoBalance: '余额兜底 {n}',
                opencodeGoZenBalance: '预付余额',
                opencodeGoZenCredit: '可用额度',
                opencodeGoNoSubscription: '未开通 Go 订阅',
                opencodeGoSubscriptionEnded: 'Go 订阅已结束',
                opencodeGoConsoleLink: '打开 Console',
                monthly: '每月',
                login: '登录',
                addAccount: '添加账号',
                addAccountTitle: '添加账号',
                continueAuth: '继续授权',
                dialogClose: '关闭',
                glmLoginZai: '连接 Z.ai',
                glmLoginBigmodel: '连接 BigModel',
                glmAddZai: '添加 Z.ai 账号',
                glmAddBigmodel: '添加 BigModel 账号',
                glmLoginApiKey: '使用 API key',
                glmRegionGlobal: '全球',
                glmRegionCn: '中国',
                glmKeyLabel: 'API key',
                glmKeyPlaceholder: 'id.secret 或 Coding Plan 密钥',
                glmKeyGo: '保存密钥',
                glmKeyHint: '贴 Z.ai 或 BigModel 的 Coding Plan 密钥。',
                glmPickRegion: '站点',
                kiroLoginSocial: '连接 Social / GitHub / Google',
                kiroAddSocial: '添加 Social 账号',
                kiroLoginBuilder: '连接 Builder ID',
                kiroAddBuilder: '添加 Builder ID',
                kiroLoginIdc: '连接 Enterprise / IdC',
                kiroAddIdc: '添加 IdC 账号',
                kiroLoginEntra: '企业 SSO · Entra / Azure AD',
                kiroLoginApiKey: '使用 Kiro API key',
                kiroLoginRefresh: '粘贴凭证',
                kiroStartUrl: 'Start URL',
                kiroStartUrlPlaceholder: 'https://d-xxxxxxxxxx.awsapps.com/start',
                kiroStartUrlGo: '继续',
                kiroStartUrlHint: 'IAM Identity Center 门户 Start URL。',
                kiroEntraEndpoint: 'Token 端点',
                kiroEntraEndpointPlaceholder: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
                kiroEntraClient: 'Client ID',
                kiroEntraRefresh: 'Refresh token',
                kiroEntraScopes: 'Scopes（可选）',
                kiroEntraGo: '保存企业 SSO',
                kiroEntraHint: 'Public client 的 refresh_token。端点须为 microsoftonline。',
                kiroKeyPlaceholder: 'ksk_…',
                kiroKeyHint: 'Kiro headless API key，作 Bearer 使用。',
                kiroRefreshPlaceholder: '卡密 / JSON / CSV / Social refresh / ksk_…',
                kiroRefreshHint: '支持卡密、JSON、CSV、Social refresh 或 ksk_。可一次导入多个。',
                kiroKeyGo: '保存密钥',
                kiroRefreshGo: '导入凭证',
                switchTo: '切换',
                inUse: '使用中',
                noAccounts: '还没有登录账号',
                pkce: 'PKCE 登录',
                device: '设备码登录',
                import: '导入本机会话',
                logout: '退出',
                // 退出 removes the stored credential, so the row button only opens
                // WarnDialog; the RPC runs on 确认退出.
                logoutConfirmTitle: '退出账号',
                logoutConfirmBody: '退出后本机保存的 {n} 登录凭据会被删除，该账号从列表移除；再次使用需要重新登录。',
                logoutConfirmAck: '我确认退出此账号',
                logoutConfirmOk: '确认退出',
                cancel: '取消',
                paste: '粘贴回调地址',
                pastePlaceholder: 'http://localhost:1455/auth/callback?code=…&state=…',
                submitPaste: '提交',
                openUrl: '打开授权页',
                userCode: '配对码',
                copy: '复制',
                copied: '已复制',
                waitingAuth: '等待授权完成',
                waitingAuthHint: '在浏览器里完成登录，这里会自动更新。',
                waitingAuthCode: '在授权页输入下面的配对码，完成后这里会自动更新。',
                pasteHint: '浏览器没有跳回？把地址栏里的回调地址粘贴到这里。',
                error: '失败',
                noRpc: '宿主 RPC 不可用。确认插件已加载到 web profile。',
                quota: '额度',
                quotaRefresh: '刷新',
                quotaUnitToggle: '切换单位 k/M',
                quotaLoading: '正在读取额度…',
                quotaFailed: '额度读取失败',
                quotaUnknown: '周额度未返回，点刷新重试',
                chatgptLogin: '使用 ChatGPT 继续',
                chatgptPlanHint: '符合条件的请求会使用你的 ChatGPT 套餐额度，在 ChatGPT 设置里查看和管理用量。',
                chatgptManageUsage: '管理用量',
                quotaReset: '重置',
                quotaResetWarnTitle: '消耗重置卡',
                quotaResetAck: '我确认消耗这张重置卡',
                quotaResetConfirmOk: '确认重置',
                quotaResetClose: '关闭',
                quotaResetBusy: '重置中…',
                resetBank: '重置卡',
                resetUnit: '张',
                resetUnitCd: '秒',
                resetLeft: '剩 {n} 张，',
                resetWinFive: '5 小时窗口',
                resetWinWeek: '每周窗口',
                resetNext: '最早 {n} 过期',
                resetCd: '最早 {n} 后过期',
                resetExpires: '{n} 过期',
                resetNone: '暂无可用',
                resetNoExpiry: '未注明过期时间',
                resetTipLabel: '{n} 张重置卡的过期时间',
                resetConfirm: '{window}将立即清空，并消耗一张 {when} 过期的重置卡。此操作无法撤销。',
                leftPercent: '剩余 {n}%',
                cursorComposer: '补全 & Composer',
                cursorApi: 'API 调用',
                cursorIncluded: '包含额度',
                devinPromptCredits: 'Prompt 点数',
                devinFlowCredits: 'Flow 点数',
                devinFlexCredits: 'Flex 点数',
                devinOverage: '超额余额',
                resetIn: '{n}后重置',
                expiresIn: '{n}后过期',
                unitMinutes: '{n} 分钟',
                unitHours: '{n} 小时',
                unitDays: '{n} 天',
                resetSoon: '即将重置',
                meterResetSoon: '即将重置',
                meterDays: '{n}天',
                meterHours: '{n}时',
                meterMinutes: '{n}分',
                meterJoin: '',
                expiresSoon: '即将过期',
                primary: '5 小时',
                weekly: '每周',
                cycle: '本周期',
                glmPrimary: '5 小时剩余',
                glmWeekly: '每周剩余',
                glmMcp: 'ZCode MCP',
                prepaid: '预付余额',
                unlimited: '不限量',
                quotaModels: '本周模型用量',
                grokCode: 'Grok Code',
                grokCodeHint: '账号已开通 Grok Code',
                grokMonthly: '月度额度',
                grokOnDemand: '按需消费',
                agGemini: 'Gemini 模型',
                agClaudeGpt: 'Claude 和 GPT 模型',
                modelsTitle: '模型',
                modelsHint: '勾选即同步。',
                modelsOn: '已开启 {n}',
                modelsAll: '全选',
                modelsNone: '全关',
                modelsNeedLogin: '登录后同步',
                modelsLoginOff: '登录后默认不勾选',
                modelsEnabled: '已启用 {n}',
                modelsSearch: '搜索模型',
                modelsEffort: '默认档位',
                modelsEffortNone: '不设置',
                modelsEffortMixed: '混合',
                modelsEffortHint: '默认思考档位。选「全部」时统一设置所有家族（覆盖各家族单独的设置），选中某个家族时只设这个家族。模型没有这一档时，用它能到的最近一档（先往下找）。DSH 选择器里手选的档位仍然优先；家族里有不支持思考的模型时，该家族不设默认。',
                modelsColumnName: '模型名称',
                modelsColumnOn: '启用',
                modelsEmpty: '没有匹配的模型',
                ctxTagTitle: '自定义输入上下文窗口',
                ctxCustomTitle: '窗口已自定义（当前 {n}），点击修改',
                ctxDialogTitle: '输入上下文窗口',
                ctxStatNow: '当前生效',
                ctxStatDefault: '目录默认',
                ctxStatMax: '上限',
                ctxSyntax: 'tokens 数，或 k/m 简写：400000、400k、1.5m',
                ctxPreview: '≈ {n} tokens',
                ctxInvalid: '无效值：tokens 数或 k/m 简写（400000、400k、1.5m）',
                ctxOutOfRange: '超出范围：需在 {n} tokens 之间',
                ctxSave: '应用',
                ctxSaving: '应用中…',
                ctxReset: '恢复默认',
                ctxResetAll: '恢复默认窗口',
                allFamilies: '全部',
                railModelsOn: '已启用 {n} / {m} 个模型',
                tabSettings: '设置',
                loading: '加载中…',
                visionTag: '视觉输入',
                rateTag: '积分倍率：相对基础档，每次调用消耗的 credit 倍数',
                priceTag: '费率：上游 USD / 每百万 token',
                priceIn: '输入（非缓存）',
                priceOut: '输出',
                priceCache: '缓存命中读取',
                priceWrite: '缓存写入',
                priceWrite1h: '缓存写入（1h）',
                pricePeak: '峰时',
                priceTier: '上下文超 {n}：',
                priceTodNote: '自 {date} 起，{win}、周一至周五（UTC）按峰时计费',
                priceUnit: ' / 每百万 token',
                aboutTitle: '关于',
                repo: '仓库',
                repoOpen: '打开仓库',
                installed: '当前版本',
                latest: '最新版本',
                verLinkedRun: '本地链接 · 运行 {n}',
                verUpdateTitle: '可更新至 {n}',
                verCurrentTitle: '已是最新 · {n}',
                verCurrentSub: '与 GitHub 最新发布一致',
                verSubCurrent: '当前 {n}',
                verUnchecked: '尚未检查更新',
                os: '系统',
                checkUpdate: '检查更新',
                changelog: '更新日志',
                changelogTitle: '{n} 更新内容',
                changelogLoading: '正在读取最近的发布说明…',
                changelogEmpty: '最近没有发布说明。',
                changelogError: '更新日志加载失败',
                checking: '正在检查…',
                updateReady: '有新版本 {n}',
                updateCurrent: '已是最新',
                updateAhead: '本地版本领先发布',
                updateUnknown: 'GitHub 没有可用的版本号',
                updateError: '检查失败',
                proxyError: '出站代理不可用，模型 / 额度 / 登录请求都会失败：{n}',
                proxyTitle: '代理',
                proxyAuto: '自动',
                proxyOff: '关闭',
                proxyCustom: '自定义',
                proxyFollowOs: '跟随系统代理：{n}',
                proxyFollowEnv: '跟随环境变量代理：{n}',
                proxyNoProxy: '未检测到系统或环境变量代理，直连',
                proxyOffNote: '已关闭：上游请求直连，忽略系统与环境变量代理',
                proxyCustomHint: '自定义代理：{n}',
                proxyCustomHintEmpty: '填写代理地址后保存',
                proxyUrlPlaceholder: 'http://127.0.0.1:7890',
                proxySave: '保存',
                proxyConfigLocked: '已由插件配置 proxyUrl 固定，此处的选择不生效',
                proxyScopeNote: '作用于本插件的全部上游请求（对话、额度、登录、目录、更新检查）',
                updateTo: '安装更新',
                updateManual: '在终端执行：{n}',
                updateStaleProcess: '磁盘已是 {n}，但当前进程仍在运行旧版本。请重启宿主（运行 dsh 的进程）加载新版；若重启后仍如此，请移除后从 GitHub 重装。',
                updateStaleProcessApp: '磁盘已是 {n}，但应用仍在运行旧版本。请退出应用后重新打开，即可加载新版；若重启后仍显示旧版，请移除插件后从 GitHub 重装。',
                updateStaleProcessLinked: '磁盘已是 {n}，但当前进程仍加载旧模块，重启宿主后生效；代码改动 npm run build 即热载，无需重启。热链不要重装——重装会把本地链接换成安装副本。',
                updateInstalledApp: '已安装 {n}。请退出应用后重新打开，即可加载新版。',
                updateInstalledHost: '已安装 {n}。请重启宿主（运行 dsh 的进程），即可加载新版。',
                updateFailed: '更新失败',
                autoUpdate: '检测到新版本时自动更新',
                autoUpdateShort: '自动更新',
                autoUpdateHourly: '每 15 分钟检查一次，装好新版后重启宿主生效',
                autoUpdateHourlyApp: '每 15 分钟检查一次，装好新版后重启应用生效',
                autoUpdateLinked: '本地链接：npm run build 后热重载生效，无需重启宿主（需 profile 配 hmr root）',
                autoLastCheck: '上次检查 {n}',
                autoRunInstalled: '已装 {n}',
                autoRunCurrent: '已是最新',
                autoRunUpdate: '发现 {n}',
                autoRunFailed: '失败',
                autoRunUnknown: '未知',
                platformWin: 'Windows',
                platformMac: 'macOS',
                platformLinux: 'Linux',
                published: '发布于 {n}',
                pluginAboutTitle: 'OAuth 订阅插件',
                tabDonate: '打赏',
                donateTitle: '支持这个项目',
                donateHint: '如果这个插件帮到了你，欢迎扫码请作者喝杯咖啡。',
                donateWechat: '微信支付',
                donateAlipay: '支付宝',
                donateMeme: '兔子比心',
                donateEmpty: '这个安装包没有附带收款码',
                tabArena: '榜单',
                arenaUpdated: '更新于 {n}',
                arenaSessions: '{n} 会话',
                arenaModels: '{n} 个模型',
                arenaCatOverall: '综合',
                arenaCatCode: '代码',
                arenaCatChat: '对话',
                arenaCatWork: '办公',
                arenaLicenseAll: '全部',
                arenaLicenseProprietary: '闭源',
                arenaLicenseOpen: '开源',
                arenaSearch: '搜索模型或厂商',
                arenaNoMatch: '没有匹配的模型',
                arenaRankRange: '排名区间 {min}–{max}',
                arenaStale: '本次刷新未完全成功：{n}',
                arenaSource: '数据来源',
                arenaSourceNote: '快照每日 12:00 UTC 更新',
                arenaFetched: '上次刷新 {n}',
                arenaViewRank: '排名',
                arenaViewPareto: '性价比',
                arenaParetoTitle: '性价比前沿',
                arenaParetoSub: '真实 Agent Mode 任务的净提升 × 每任务成本',
                arenaParetoSubTokens: '真实 Agent Mode 任务的净提升 × 输出 Token',
                // One axis label per (projection, percentile): the site prints the
                // same string under the frontier chart and under the per-task card,
                // then appends the rolling-window line.
                arenaAxisCost: '每任务中位成本',
                arenaAxisCostP25: '短任务成本，P25',
                arenaAxisCostP95: '长任务成本，P95',
                arenaAxisTokens: '每任务中位输出 Token',
                arenaAxisTokensP25: '短任务输出 Token，P25',
                arenaAxisTokensP95: '长任务输出 Token，P95',
                arenaWindow14: '（近 14 天）',
                arenaStatMedian: '中位数',
                arenaStatP25: '第 25 百分位',
                arenaStatP95: '第 95 百分位',
                arenaParetoEmpty: '没有带成本数据的模型',
                arenaOptimalTitle: '性价比最优模型',
                arenaOptimalSub: '净提升 × {n}',
                arenaCostTitle: '每任务成本',
                arenaCostTitleTokens: '每任务输出 Token',
                arenaCostLegend: '性价比最优',
                arenaCostInfoLabel: '说明成本排名',
                arenaCostInfoTokensLabel: '说明输出 Token 排名',
                arenaCostInfo: '取自真实的 Agent Mode 任务，不是列表价。每根条显示各模型已计价任务的{stat}，条下是该模型的净提升。',
                arenaCostInfoTokens: '取自真实的 Agent Mode 任务。每根条显示各模型已测量任务的输出 Token {stat}，条下是该模型的净提升。',
                arenaScore: '得分',
                arenaCostPerTask: '每任务成本',
                arenaMetricCost: '成本',
                arenaMetricCostAxis: '每任务成本',
                arenaMetricTokens: '输出 Token',
                arenaPctLabel: '统计',
                arenaPct25: '第 25 百分位',
                arenaPct25Sub: '较短任务',
                arenaPct50: '第 50 百分位',
                arenaPct50Sub: '中位任务',
                arenaPct95: '第 95 百分位',
                arenaPct95Sub: '较长任务',
                arenaScrollHint: '滚动',
                arenaZoomIn: '放大',
                arenaZoomOut: '缩小',
                arenaSortPrefix: '排序',
                arenaSortRanking: '排名',
                arenaSortCostDesc: '每任务成本（高→低）',
                arenaSortCostAsc: '每任务成本（低→高）',
                arenaSortTokensDesc: '每任务输出 Token（高→低）',
                arenaSortTokensAsc: '每任务输出 Token（低→高）',
                arenaColRank: '排名',
                arenaColModel: '模型',
                arenaColNet: '净提升',
                arenaColSuccess: '确认成功率',
                arenaColCost: '每任务成本（P50）',
                arenaPerTask: '/任务',
                tabUsage: '用量',
                usageToday: '今天',
                usageDays: '{n} 天',
                usageUpdated: '更新于 {n}',
                usageTokens: 'Token',
                usageInOut: '输入 {a} · 输出 {b}',
                usageCalls: '调用',
                usageCallsN: '{n} 次调用',
                usageFailed: '{n} 次失败',
                usageFailedLabel: '失败',
                usageInput: '输入',
                usageCacheRead: '缓存读',
                usageHit: '命中率 {n}',
                usageHitNa: '上游未报告缓存',
                usageHitNote: '命中率只算上报了缓存字段的调用（Kiro 不报）',
                usageOutput: '输出',
                usageTtftShort: '首字 {n}',
                usageSpeed: '输出 {n} tok/s',
                usageByModel: '按模型',
                usageBySession: '按会话',
                usageSessionsN: '{n} 个会话',
                usageCopyId: '复制会话 ID',
                usageModelsMore: '另 {n} 个',
                usageCost: '估算成本',
                usageCostSub: '按价目折算 · 非账单',
                usageCostCover: '{a}/{b} 模型有价目',
                usageCostNote: '按目录价目表折算的展示估算（读时计价，改价目即重述）；订阅家族按牌价折算，无价目的模型不计入',
                usageCostTip: '估算',
                usageEstShort: '≈{v}',
                usageEmpty: '这段时间没有调用记录',
                usageChart: '每日 Token 用量',
                usageChartHourly: '今日每小时 Token 用量',
                usageShare: '分享',
                usageSharing: '生成中…',
                usageShareTitle: '分享截图',
                usageShareMask: '分享截图会隐藏账号（邮箱/用户名打码）',
                usageCopying: '正在复制到剪贴板…',
                usageCopyingShort: '复制中…',
                usageDeepseek: 'DeepSeek',
                usageCopiedShort: '已复制',
                usageShotOpen: '打开截图预览',
                usageCopied: '长截图已复制到剪贴板',
                usageCopyFailed: '没能写入剪贴板，可以保存图片',
                usageShareFailed: '生成截图失败：{n}',
                usageCopy: '再次复制',
                usageSave: '保存图片',
                usageAnalyzed: '分析日期 {n}',
            },
            en: {
                nav: 'Subscriptions & models',
                panel: 'Subscriptions',
                providers: 'Providers',
                antigravityPastePlaceholder: 'http://localhost:51121/oauth-callback?code=…&state=…',
                antigravityVerify: 'Google needs to verify this account before chat',
                antigravityVerifyGo: 'Verify',
                cursorImport: 'Import local Cursor',
                cursorImportEmpty: 'No Cursor CLI or IDE login on this machine',
                ollamaLoginApiKey: 'Paste API key',
                ollamaKeyPlaceholder: 'ollama.com API key',
                ollamaKeyGo: 'Save key',
                ollamaKeyHint: 'Create a key at ollama.com/settings/keys. Or set OLLAMA_API_KEY in the environment.',
                ollamaImport: 'Import OLLAMA_API_KEY',
                ollamaImportEmpty: 'OLLAMA_API_KEY not found',
                kimiLoginApiKey: 'Paste API key',
                kimiKeyPlaceholder: 'KIMI_API_KEY or sk-…',
                kimiKeyGo: 'Save key',
                kimiKeyHint: 'Paste a Kimi Code API key. Or import ~/.kimi-code/credentials/kimi-code.json.',
                kimiImport: 'Import local Kimi Code',
                kimiImportEmpty: 'No kimi-code.json or KIMI_API_KEY found',
                devinLoginApiKey: 'Paste session token',
                devinKeyPlaceholder: 'devin-session-token$…',
                devinKeyGo: 'Save token',
                devinKeyHint: 'Paste a Devin session token. Or import ~/.local/share/devin/credentials.toml.',
                devinImport: 'Import local Devin CLI',
                devinImportEmpty: 'No credentials.toml found',
                clineImport: 'Import local Cline CLI',
                clineImportEmpty: 'No ~/.cline/data/settings/providers.json found',
                commandCodeLoginApiKey: 'Paste API key',
                commandCodeKeyPlaceholder: 'user_… or COMMAND_CODE_API_KEY',
                commandCodeKeyGo: 'Save key',
                commandCodeKeyHint: 'Paste a Command Code API key. Or import ~/.commandcode/auth.json or COMMAND_CODE_API_KEY.',
                commandCodeImport: 'Import local Command Code',
                commandCodeImportEmpty: 'No auth.json or COMMAND_CODE_API_KEY found',
                commandCodeCredits: 'Credits',
                codexCredits: 'Credits',
                clineCredits: 'Credits',
                clineDevice: 'Device code',
                apiKeyTitle: 'API Key',
                opencodeGoHint: 'Paste the OpenCode Go API key for chat; session cookie and workspace id only read quota. Add several accounts and click a card to switch.',
                opencodeGoKey: 'API key',
                opencodeGoKeyPlaceholder: 'sk-… / OPENCODE_API_KEY',
                opencodeGoKeySet: 'Stored — leave blank to keep',
                opencodeGoCookie: 'Session cookie',
                opencodeGoCookiePlaceholder: '__Host-console_session=… or auth=Fe26.2…',
                opencodeGoCookieSet: 'Stored — leave blank to keep',
                opencodeGoWorkspace: 'Workspace id (optional)',
                opencodeGoWorkspacePlaceholder: 'wrk_…/org_… or https://opencode.ai/console/wrk_…/go',
                opencodeGoSave: 'Save',
                opencodeGoFailed: 'Save failed',
                opencodeGoHostStale: 'The host process is outdated — restart the host, then save again',
                hostStale: 'The host process is outdated — restart dsh web and retry',
                opencodeGoBalance: 'Balance fallback {n}',
                opencodeGoZenBalance: 'Prepaid balance',
                opencodeGoZenCredit: 'Available credit',
                opencodeGoNoSubscription: 'No Go subscription',
                opencodeGoSubscriptionEnded: 'Go subscription ended',
                opencodeGoConsoleLink: 'Open Console',
                monthly: 'Monthly',
                login: 'Sign in',
                addAccount: 'Add account',
                addAccountTitle: 'Add account',
                continueAuth: 'Continue authorization',
                dialogClose: 'Close',
                glmLoginZai: 'Continue with Z.ai',
                glmLoginBigmodel: 'Continue with BigModel',
                glmAddZai: 'Add Z.ai account',
                glmAddBigmodel: 'Add BigModel account',
                glmLoginApiKey: 'Use API key',
                glmRegionGlobal: 'Global',
                glmRegionCn: 'China',
                glmKeyLabel: 'API key',
                glmKeyPlaceholder: 'id.secret or Coding Plan key',
                glmKeyGo: 'Save key',
                glmKeyHint: 'Paste a Z.ai or BigModel Coding Plan key.',
                glmPickRegion: 'Site',
                kiroLoginSocial: 'Continue with Social / GitHub / Google',
                kiroAddSocial: 'Add Social account',
                kiroLoginBuilder: 'Continue with Builder ID',
                kiroAddBuilder: 'Add Builder ID',
                kiroLoginIdc: 'Continue with Enterprise / IdC',
                kiroAddIdc: 'Add IdC account',
                kiroLoginEntra: 'Enterprise SSO · Entra / Azure AD',
                kiroLoginApiKey: 'Use Kiro API key',
                kiroLoginRefresh: 'Paste credentials',
                kiroStartUrl: 'Start URL',
                kiroStartUrlPlaceholder: 'https://d-xxxxxxxxxx.awsapps.com/start',
                kiroStartUrlGo: 'Continue',
                kiroStartUrlHint: 'IAM Identity Center portal Start URL.',
                kiroEntraEndpoint: 'Token endpoint',
                kiroEntraEndpointPlaceholder: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
                kiroEntraClient: 'Client ID',
                kiroEntraRefresh: 'Refresh token',
                kiroEntraScopes: 'Scopes (optional)',
                kiroEntraGo: 'Save enterprise SSO',
                kiroEntraHint: 'Public-client refresh_token. Endpoint must be microsoftonline.',
                kiroKeyPlaceholder: 'ksk_…',
                kiroKeyHint: 'Kiro headless API key, used as the bearer.',
                kiroRefreshPlaceholder: 'Kami / JSON / CSV / Social refresh / ksk_…',
                kiroRefreshHint: 'Kami, JSON, CSV, Social refresh, or ksk_. Import one or many.',
                kiroKeyGo: 'Save key',
                kiroRefreshGo: 'Import credentials',
                switchTo: 'Switch',
                inUse: 'In use',
                noAccounts: 'No accounts yet',
                pkce: 'PKCE sign-in',
                device: 'Device-code sign-in',
                import: 'Import local session',
                logout: 'Sign out',
                logoutConfirmTitle: 'Sign out of this account',
                logoutConfirmBody: 'Signing out deletes the stored credentials for {n} on this machine and removes the account from the list; you will need to sign in again to use it.',
                logoutConfirmAck: 'I understand this signs the account out',
                logoutConfirmOk: 'Sign out',
                cancel: 'Cancel',
                paste: 'Paste callback URL',
                pastePlaceholder: 'http://localhost:1455/auth/callback?code=…&state=…',
                submitPaste: 'Submit',
                openUrl: 'Open authorize URL',
                userCode: 'User code',
                copy: 'Copy',
                copied: 'Copied',
                waitingAuth: 'Waiting for authorization',
                waitingAuthHint: 'Finish signing in in your browser; this updates on its own.',
                waitingAuthCode: 'Enter the code below on the authorize page; this updates when you are done.',
                pasteHint: 'Browser did not return here? Paste the callback URL from its address bar.',
                error: 'Failed',
                noRpc: 'Host RPC is unavailable. Confirm the plugin is loaded into the web profile.',
                quota: 'Quota',
                quotaRefresh: 'Refresh',
                quotaUnitToggle: 'Switch k/M units',
                quotaLoading: 'Reading quota…',
                quotaFailed: 'Could not read quota',
                quotaUnknown: 'Weekly quota missing. Refresh to retry.',
                chatgptLogin: 'Continue with ChatGPT',
                chatgptPlanHint: 'Eligible requests use your ChatGPT plan. Review and manage usage in ChatGPT settings.',
                chatgptManageUsage: 'Manage usage',
                quotaReset: 'Reset',
                quotaResetWarnTitle: 'Spend a reset card',
                quotaResetAck: 'I want to spend this card',
                quotaResetConfirmOk: 'Reset now',
                quotaResetClose: 'Close',
                quotaResetBusy: 'Resetting…',
                resetBank: 'Reset cards',
                resetUnit: 'left',
                resetUnitCd: 's',
                resetLeft: '{n} left, ',
                resetWinFive: '5-hour window',
                resetWinWeek: 'weekly window',
                resetNext: 'Earliest expires {n}',
                resetCd: 'Earliest expires in {n}',
                resetExpires: 'Expires {n}',
                resetNone: 'None left',
                resetNoExpiry: 'No expiry given',
                resetTipLabel: 'Expiry of {n} reset cards',
                resetConfirm: 'Clears the {window} now and spends the card that expires {when}. This cannot be undone.',
                leftPercent: '{n}% left',
                cursorComposer: 'Tab completion & Composer',
                cursorApi: 'API',
                cursorIncluded: 'Included usage',
                devinPromptCredits: 'Prompt Credits',
                devinFlowCredits: 'Flow Credits',
                devinFlexCredits: 'Flex Credits',
                devinOverage: 'Overage balance',
                resetIn: 'resets in {n}',
                expiresIn: 'expires in {n}',
                unitMinutes: '{n} min',
                unitHours: '{n} h',
                unitDays: '{n} d',
                resetSoon: 'reset imminent',
                meterResetSoon: 'Resetting soon',
                meterDays: '{n}d',
                meterHours: '{n}h',
                meterMinutes: '{n}m',
                meterJoin: ' ',
                expiresSoon: 'expires soon',
                primary: '5-hour',
                weekly: 'Weekly',
                cycle: 'This period',
                glmPrimary: '5-hour remaining',
                glmWeekly: 'Weekly remaining',
                glmMcp: 'ZCode MCP',
                prepaid: 'Prepaid',
                unlimited: 'Unlimited',
                quotaModels: 'Models this week',
                grokCode: 'Grok Code',
                grokCodeHint: 'Grok Code access enabled',
                grokMonthly: 'Monthly',
                grokOnDemand: 'Pay-as-you-go',
                agGemini: 'Gemini Models',
                agClaudeGpt: 'Claude and GPT models',
                modelsTitle: 'Models',
                modelsHint: 'Check to sync.',
                modelsOn: '{n} on',
                modelsAll: 'All on',
                modelsNone: 'All off',
                modelsNeedLogin: 'Syncs after sign-in',
                modelsLoginOff: 'Off until checked',
                modelsEnabled: '{n} enabled',
                modelsSearch: 'Search models',
                modelsEffort: 'Default effort',
                modelsEffortNone: 'Not set',
                modelsEffortMixed: 'Mixed',
                modelsEffortHint: 'Default reasoning effort. Under All it sets every family (overriding per-family choices); with one family selected it sets only that family. A model without this level uses its nearest one (lower first). A level picked in the DSH picker still wins; a family with a non-reasoning model gets no default.',
                modelsColumnName: 'Model',
                modelsColumnOn: 'Enabled',
                modelsEmpty: 'No models match',
                ctxTagTitle: 'Customize input context window',
                ctxCustomTitle: 'Window customized (now {n}); click to edit',
                ctxDialogTitle: 'Input context window',
                ctxStatNow: 'Current',
                ctxStatDefault: 'Default',
                ctxStatMax: 'Max',
                ctxSyntax: 'Tokens, or k/m shorthand: 400000, 400k, 1.5m',
                ctxPreview: '≈ {n} tokens',
                ctxInvalid: 'Invalid window: use plain tokens or k/m shorthand (e.g. 400000, 400k, 1.5m)',
                ctxOutOfRange: 'Out of range: must be between {n} tokens',
                ctxSave: 'Apply',
                ctxSaving: 'Applying…',
                ctxReset: 'Reset to default',
                ctxResetAll: 'Reset all windows',
                allFamilies: 'All',
                railModelsOn: '{n} / {m} models on',
                tabSettings: 'Settings',
                loading: 'Loading…',
                visionTag: 'Vision input',
                rateTag: 'Credit multiplier: credits spent per call, relative to the base rate',
                priceTag: 'Rate: upstream USD per 1M tokens',
                priceIn: 'Input (uncached)',
                priceOut: 'Output',
                priceCache: 'Cache-hit read',
                priceWrite: 'Cache write',
                priceWrite1h: 'Cache write (1h)',
                pricePeak: 'Peak hours',
                priceTier: 'Over {n} context:',
                priceTodNote: 'From {date}: peak rates apply {win}, Mon–Fri (UTC)',
                priceUnit: ' / 1M tokens',
                aboutTitle: 'About',
                repo: 'Repository',
                repoOpen: 'Open repo',
                installed: 'Installed',
                latest: 'Latest',
                verLinkedRun: 'Local link · running {n}',
                verUpdateTitle: 'Update to {n}',
                verCurrentTitle: 'Up to date · {n}',
                verCurrentSub: 'Matches the latest GitHub release',
                verSubCurrent: 'Current {n}',
                verUnchecked: 'Not checked yet',
                os: 'OS',
                checkUpdate: 'Check for updates',
                changelog: 'Release notes',
                changelogTitle: 'What\'s new in {n}',
                changelogLoading: 'Loading recent release notes…',
                changelogEmpty: 'No recent release notes.',
                changelogError: 'Could not load release notes',
                checking: 'Checking…',
                updateReady: 'Update available {n}',
                updateCurrent: 'Up to date',
                updateAhead: 'Local version is ahead of the latest release',
                updateUnknown: 'GitHub did not return a version',
                updateError: 'Update check failed',
                proxyError: 'Outbound proxy unavailable — model, quota and login requests will fail: {n}',
                proxyTitle: 'Network proxy',
                proxyAuto: 'Auto',
                proxyOff: 'Off',
                proxyCustom: 'Custom',
                proxyFollowOs: 'Following system proxy: {n}',
                proxyFollowEnv: 'Following environment proxy: {n}',
                proxyNoProxy: 'No system or environment proxy detected — going direct',
                proxyOffNote: 'Off: upstream requests go direct, ignoring system and environment proxies',
                proxyCustomHint: 'Custom proxy: {n}',
                proxyCustomHintEmpty: 'Enter a proxy URL and save',
                proxyUrlPlaceholder: 'http://127.0.0.1:7890',
                proxySave: 'Save',
                proxyConfigLocked: 'Pinned by the plugin config proxyUrl; choices here have no effect',
                proxyScopeNote: 'Applies to every upstream request this plugin makes (chat, quota, login, catalog, update checks)',
                updateTo: 'Install update',
                updateManual: 'Run in a terminal: {n}',
                updateStaleProcess: 'On disk is {n}, but this process still runs the old copy. Restart the host (the dsh process) to load it; if it stays stale, remove and re-add from GitHub.',
                updateStaleProcessApp: 'On disk is {n}, but the app still runs the old copy. Quit and reopen the app to load it; if it stays stale, remove the plugin and re-add it from GitHub.',
                updateStaleProcessLinked: 'On disk is {n}, but this process still runs the old copy — restart the host; code changes hot-reload via npm run build. Never reinstall a linked tree — that replaces the link with an installed copy.',
                updateInstalledApp: 'Installed {n}. Quit and reopen the app to load it.',
                updateInstalledHost: 'Installed {n} — restart the host (the dsh process) to load it.',
                updateFailed: 'Update failed',
                autoUpdate: 'Auto-update when a new version is found',
                autoUpdateShort: 'Auto-update',
                autoUpdateHourly: 'Checks every 15 minutes; restart the host app to load an installed update',
                autoUpdateHourlyApp: 'Checks every 15 minutes; quit and reopen the app to load an installed update',
                autoUpdateLinked: 'Local link: npm run build hot-reloads the plugin — no host restart (needs an hmr root in the profile)',
                autoLastCheck: 'Last check {n}',
                autoRunInstalled: 'installed {n}',
                autoRunCurrent: 'up to date',
                autoRunUpdate: 'found {n}',
                autoRunFailed: 'failed',
                autoRunUnknown: 'unknown',
                platformWin: 'Windows',
                platformMac: 'macOS',
                platformLinux: 'Linux',
                published: 'Published {n}',
                pluginAboutTitle: 'OAuth Subs Plugin',
                tabDonate: 'Thanks',
                donateTitle: 'Support this project',
                donateHint: 'If this plugin helped you, scan a code to buy the author a coffee.',
                donateWechat: 'WeChat Pay',
                donateAlipay: 'Alipay',
                donateMeme: 'A bunny making a heart',
                donateEmpty: 'This install does not ship payment codes',
                tabArena: 'Arena',
                arenaUpdated: 'Updated {n}',
                arenaSessions: '{n} sessions',
                arenaModels: '{n} models',
                arenaCatOverall: 'Overall',
                arenaCatCode: 'Code',
                arenaCatChat: 'Chat',
                arenaCatWork: 'Work',
                arenaLicenseAll: 'All',
                arenaLicenseProprietary: 'Proprietary',
                arenaLicenseOpen: 'Open Source',
                arenaSearch: 'Search models or labs',
                arenaNoMatch: 'No matching models',
                arenaRankRange: 'Rank range {min}–{max}',
                arenaStale: 'This refresh did not fully succeed: {n}',
                arenaSource: 'Data from',
                arenaSourceNote: 'snapshot moves daily at 12:00 UTC',
                arenaFetched: 'Refreshed {n}',
                arenaViewRank: 'Ranking',
                arenaViewPareto: 'Pareto',
                arenaParetoTitle: 'Pareto Frontier',
                arenaParetoSub: 'Net Improvement x Cost/task from real Agent Mode tasks',
                arenaParetoSubTokens: 'Net Improvement x Output tokens from real Agent Mode tasks',
                // arena's own axis captions, verbatim (cost / output tokens × the
                // 25th / 50th / 95th percentile task-length filter).
                arenaAxisCost: 'Median cost per task',
                arenaAxisCostP25: 'Short-task cost, P25',
                arenaAxisCostP95: 'Long-task cost, P95',
                arenaAxisTokens: 'Median output tokens',
                arenaAxisTokensP25: 'Short-task output tokens, P25',
                arenaAxisTokensP95: 'Long-task output tokens, P95',
                arenaWindow14: ' (last 14 days)',
                arenaStatMedian: 'the median',
                arenaStatP25: 'the 25th percentile',
                arenaStatP95: 'the 95th percentile',
                arenaParetoEmpty: 'No models with cost data',
                arenaOptimalTitle: 'Pareto Optimal Models',
                arenaOptimalSub: 'Net Improvement x {n}',
                arenaCostTitle: 'Cost per Task',
                arenaCostTitleTokens: 'Output Tokens per Task',
                arenaCostLegend: 'Pareto optimal',
                arenaCostInfoLabel: 'Explain the cost ranking',
                arenaCostInfoTokensLabel: 'Explain the output token ranking',
                arenaCostInfo: 'Measured from real Agent Mode tasks, not list prices. Each bar shows {stat} across a model\'s priced tasks, with the model\'s Net Improvement under the price.',
                arenaCostInfoTokens: 'Measured from real Agent Mode tasks. Each bar shows {stat} for output tokens across a model\'s measured tasks, with the model\'s Net Improvement under the count.',
                arenaScore: 'Score',
                arenaCostPerTask: 'Cost/task',
                arenaMetricCost: 'Cost',
                arenaMetricCostAxis: 'Cost/task',
                arenaMetricTokens: 'Output Tokens',
                arenaPctLabel: 'Statistic',
                arenaPct25: '25th percentile',
                arenaPct25Sub: 'Shorter tasks',
                arenaPct50: '50th percentile',
                arenaPct50Sub: 'Median tasks',
                arenaPct95: '95th percentile',
                arenaPct95Sub: 'Longer tasks',
                arenaScrollHint: 'Scroll',
                arenaZoomIn: 'Zoom in',
                arenaZoomOut: 'Zoom out',
                arenaSortPrefix: 'Sort',
                arenaSortRanking: 'Ranking',
                arenaSortCostDesc: 'Highest Cost per Task',
                arenaSortCostAsc: 'Lowest Cost per Task',
                arenaSortTokensDesc: 'Highest Output Tokens per Task',
                arenaSortTokensAsc: 'Lowest Output Tokens per Task',
                arenaColRank: 'Rank',
                arenaColModel: 'Model',
                arenaColNet: 'Net Improvement',
                arenaColSuccess: 'Confirmed Success',
                arenaColCost: 'Cost/Task (P50)',
                arenaPerTask: '/task',
                tabUsage: 'Usage',
                usageToday: 'Today',
                usageDays: '{n} days',
                usageUpdated: 'Updated {n}',
                usageTokens: 'Tokens',
                usageInOut: '{a} in · {b} out',
                usageCalls: 'Calls',
                usageCallsN: '{n} calls',
                usageFailed: '{n} failed',
                usageFailedLabel: 'Failed',
                usageInput: 'Input',
                usageCacheRead: 'Cache read',
                usageHit: 'hit rate {n}',
                usageHitNa: 'not reported upstream',
                usageHitNote: 'Hit rate covers only calls that report a cache field (Kiro does not)',
                usageOutput: 'Output',
                usageTtftShort: 'TTFT {n}',
                usageSpeed: '{n} tok/s out',
                usageByModel: 'By model',
                usageBySession: 'By session',
                usageSessionsN: '{n} sessions',
                usageCopyId: 'Copy session ID',
                usageModelsMore: '+{n} more',
                usageCost: 'Est. cost',
                usageCostSub: 'rate-table estimate · not a bill',
                usageCostCover: '{a}/{b} models priced',
                usageCostNote: 'Display estimate priced from the catalog rate table at read time (a rates refresh restates it); subscription families price at list price, unpriced models are left out',
                usageCostTip: 'Est.',
                usageEstShort: '≈{v}',
                usageEmpty: 'No calls in this range',
                usageChart: 'Daily token usage',
                usageChartHourly: 'Hourly token usage today',
                usageShare: 'Share',
                usageSharing: 'Rendering…',
                usageShareTitle: 'Share screenshot',
                usageShareMask: 'Shared screenshots hide accounts (email / username masked)',
                usageCopying: 'Copying to the clipboard…',
                usageCopyingShort: 'Copying…',
                usageDeepseek: 'DeepSeek',
                usageCopiedShort: 'Copied',
                usageShotOpen: 'Open screenshot preview',
                usageCopied: 'Long screenshot copied to the clipboard',
                usageCopyFailed: 'Could not write the clipboard — save the image instead',
                usageShareFailed: 'Screenshot failed: {n}',
                usageCopy: 'Copy again',
                usageSave: 'Save image',
                usageAnalyzed: 'Analyzed {n}',
            },
        };
        function localeOf() {
            const lang = (typeof document !== 'undefined' && document.documentElement.lang)
                || (typeof navigator !== 'undefined' && navigator.language)
                || 'zh';
            return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        }
        // Main panels stay mounted when inactive (retained), so "mounted" is not
        // "shown": the window must be visible and the panel itself rendered.
        function panelVisible(el, doc) {
            return !doc.hidden && el?.checkVisibility?.() !== false;
        }
        function callRpc(rpc, method, payload) {
            if (rpc && typeof rpc.call === 'function') {
                return Promise.resolve(rpc.call('/oauth-subs-auth', method, payload ?? {})).then((result) => {
                    if (result && typeof result === 'object' && 'ok' in result) {
                        if (result.ok)
                            return result.value;
                        throw new Error(result.error?.message ?? 'rpc');
                    }
                    return result;
                });
            }
            if (rpc && typeof rpc.request === 'function') {
                return rpc.request(`/oauth-subs-auth/${method}`, payload);
            }
            const nested = rpc?.['/oauth-subs-auth'] ?? rpc?.oauthSubs;
            if (nested && typeof nested[method] === 'function')
                return nested[method](payload);
            throw new Error('rpc');
        }
        const STATUS_STORE = 'dsh-plugin-oauth-subs.status';
        function readStoredSnap() {
            try {
                const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STATUS_STORE);
                if (!raw)
                    return null;
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === 'object' ? parsed : null;
            }
            catch {
                return null;
            }
        }
        function writeStoredSnap(snap) {
            try {
                if (typeof localStorage === 'undefined' || !snap || typeof snap !== 'object')
                    return;
                localStorage.setItem(STATUS_STORE, JSON.stringify(snap));
            }
            catch { /* quota / private mode */ }
        }
        function isUnknownOauthMethod(message) {
            return /unknown oauth-subs method /i.test(String(message || ''));
        }
        function fill(template, n) {
            // A record fills named placeholders (`{n}`, `{max}`, …); missing keys
            // stay literal so a template never ends up with `undefined`.
            if (n !== null && typeof n === 'object') {
                return String(template).replace(/\{(\w+)\}/g, (match, key) => (n[key] === undefined || n[key] === null ? match : String(n[key])));
            }
            return String(template).replace('{n}', String(n));
        }
        function formatReset(resetAt, t, kind = 'reset') {
            if (typeof resetAt !== 'number' || resetAt <= 0)
                return '';
            const units = kind === 'expires'
                ? { soon: t.expiresSoon, suffix: t.expiresIn, minute: t.unitMinutes, hour: t.unitHours, day: t.unitDays }
                : { soon: t.resetSoon, suffix: t.resetIn, minute: t.unitMinutes, hour: t.unitHours, day: t.unitDays };
            const delta = resetAt - Date.now();
            if (delta <= 0)
                return units.soon;
            const totalMinutes = Math.max(1, Math.round(delta / 60_000));
            const days = Math.floor(totalMinutes / 1440);
            const hours = Math.floor((totalMinutes % 1440) / 60);
            const minutes = totalMinutes % 60;
            const bits = [];
            if (days)
                bits.push(fill(units.day, days));
            if (hours)
                bits.push(fill(units.hour, hours));
            if (minutes || bits.length === 0)
                bits.push(fill(units.minute, minutes));
            return fill(units.suffix, bits.join(' '));
        }
        // SkillStar usage meters: compact units, no "后重置" / "resets in".
        function formatMeterReset(resetAt, t) {
            if (typeof resetAt !== 'number' || resetAt <= 0)
                return '';
            const delta = resetAt - Date.now();
            if (delta <= 0)
                return t.meterResetSoon;
            const totalMinutes = Math.max(1, Math.round(delta / 60_000));
            const days = Math.floor(totalMinutes / 1440);
            const hours = Math.floor((totalMinutes % 1440) / 60);
            const minutes = totalMinutes % 60;
            const bits = [];
            if (days)
                bits.push(fill(t.meterDays, days));
            if (hours)
                bits.push(fill(t.meterHours, hours));
            if (minutes || bits.length === 0)
                bits.push(fill(t.meterMinutes, minutes));
            return bits.join(t.meterJoin ?? '');
        }
        function formatStamp(resetAt) {
            if (typeof resetAt !== 'number' || resetAt <= 0)
                return '';
            try {
                return new Date(resetAt).toLocaleString(localeOf(), {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                });
            }
            catch {
                return '';
            }
        }
        function formatAmount(value) {
            if (typeof value !== 'number' || !Number.isFinite(value))
                return '';
            if (Number.isInteger(value))
                return String(value);
            return String(Math.round(value * 10) / 10);
        }
        /** Cline credits and cap amounts are USD (upstream units are 1e-8 / 1e-6). */
        function formatUsd(value) {
            if (typeof value !== 'number' || !Number.isFinite(value))
                return '';
            return '$' + value.toFixed(2);
        }
        /** Compact token counts: 103691253 -> 103.7M, 1200000000 -> 1.2B. */
        function formatTokenAmount(value) {
            if (typeof value !== 'number' || !Number.isFinite(value))
                return '';
            if (value >= 1e9)
                return `${Math.round(value / 1e8) / 10}B`;
            if (value >= 1e6)
                return `${Math.round(value / 1e5) / 10}M`;
            if (value >= 1e3)
                return `${Math.round(value / 1e2) / 10}K`;
            return String(Math.round(value));
        }
        const AMOUNT_UNITS_KEY = 'osubs-amount-units';
        function readExactAmountUnits() {
            try {
                return localStorage.getItem(AMOUNT_UNITS_KEY) === 'exact';
            }
            catch {
                return false;
            }
        }
        function writeExactAmountUnits(exact) {
            try {
                localStorage.setItem(AMOUNT_UNITS_KEY, exact ? 'exact' : 'compact');
            }
            catch { /* private mode */ }
        }
        const PLAN_LABELS = {
            free: 'Free',
            free_plan: 'Free',
            free_trial: 'Free',
            go: 'Go',
            plus: 'Plus',
            chatgpt_plus: 'Plus',
            pro: 'Pro 20x',
            chatgpt_pro: 'Pro 20x',
            pro20x: 'Pro 20x',
            pro_20x: 'Pro 20x',
            prolite: 'Pro 5x',
            pro_lite: 'Pro 5x',
            chatgpt_prolite: 'Pro 5x',
            chatgpt_pro_lite: 'Pro 5x',
            pro5x: 'Pro 5x',
            pro_5x: 'Pro 5x',
            team: 'Team',
            business: 'Business',
            enterprise: 'Enterprise',
            edu: 'Edu',
            student: 'Student',
            lite: 'Lite',
            max: 'Max',
            coding_lite: 'Lite',
            coding_pro: 'Pro',
            coding_max: 'Max',
            kiro_free: 'Free',
            kirofree: 'Free',
            kiro_pro: 'Pro',
            kiropro: 'Pro',
            kiro_proplus: 'Pro+',
            kiro_pro_plus: 'Pro+',
            kiroproplus: 'Pro+',
            proplus: 'Pro+',
            kiro_powered: 'Powered',
            kiropowered: 'Powered',
            powered: 'Powered',
            0: 'Free',
            1: 'SuperGrok',
            2: 'X Basic',
            3: 'X Premium',
            4: 'X Premium+',
            5: 'SuperGrok Heavy',
            6: 'SuperGrok Lite',
            7: 'SuperGrok Plus',
            supergrok: 'SuperGrok',
            x_basic: 'X Basic',
            x_premium: 'X Premium',
            x_premium_plus: 'X Premium+',
            xpremiumplus: 'X Premium+',
            super_grok_heavy: 'SuperGrok Heavy',
            supergrokheavy: 'SuperGrok Heavy',
            super_grok_pro: 'SuperGrok Heavy',
            supergrokpro: 'SuperGrok Heavy',
            super_grok_lite: 'SuperGrok Lite',
            super_grok_plus: 'SuperGrok Plus',
        };
        function formatPlanLabel(raw, family) {
            if (raw === undefined || raw === null || raw === '')
                return '';
            if (typeof raw === 'number' && Number.isInteger(raw))
                return PLAN_LABELS[raw] ?? String(raw);
            const trimmed = String(raw).trim();
            if (!trimmed)
                return '';
            const slug = trimmed.toLowerCase().replace(/\+/g, 'plus').replace(/[_\-\s]+/g, '_').replace(/^_|_$/g, '');
            const compact = slug.replace(/_/g, '');
            if (family === 'glm') {
                if (slug === 'pro' || slug === 'coding_pro')
                    return 'Pro';
                if (slug === 'lite' || slug === 'coding_lite')
                    return 'Lite';
                if (slug === 'max' || slug === 'coding_max')
                    return 'Max';
            }
            if (family === 'kiro') {
                if (slug === 'kiro_pro' || slug === 'kiropro' || slug === 'pro')
                    return 'Pro';
                if (slug === 'kiro_proplus' || slug === 'kiro_pro_plus' || compact === 'kiroproplus' || slug === 'proplus' || slug === 'pro_plus')
                    return 'Pro+';
                if (slug === 'kiro_free' || slug === 'kirofree' || slug === 'free')
                    return 'Free';
                if (slug === 'kiro_powered' || slug === 'kiropowered' || slug === 'powered')
                    return 'Powered';
            }
            if (family === 'antigravity') {
                if (slug === 'g1_pro_tier' || slug === 'g1protier' || slug === 'g1pro' || slug === 'pro' || slug === 'google_ai_pro' || slug === 'ai_pro')
                    return 'Pro';
                if (slug === 'g1_ultra_5x_tier' || slug === 'g1_ultra_5x' || slug === 'ultra_5x' || slug === 'ultra5x')
                    return 'Ultra 5x';
                if (slug === 'g1_ultra_20x_tier' || slug === 'g1_ultra_20x' || slug === 'ultra_20x' || slug === 'ultra20x')
                    return 'Ultra 20x';
                if (slug === 'g1_ultra_tier' || slug === 'g1ultratier' || slug === 'g1ultra' || slug === 'ultra' || slug === 'google_ai_ultra' || slug === 'ai_ultra')
                    return 'Ultra';
                if (slug === 'g1_plus_tier' || slug === 'g1plustier' || slug === 'plus' || slug === 'google_ai_plus')
                    return 'Plus';
                if (slug === 'free' || slug === 'free_tier' || slug === 'freetier')
                    return 'Free';
                if (slug === 'standard' || slug === 'standard_tier' || slug === 'standardtier')
                    return 'Standard';
                if (slug === 'legacy' || slug === 'legacy_tier' || slug === 'legacytier')
                    return 'Legacy';
            }
            if (family === 'ollama') {
                if (slug === 'pro' || compact === 'pro')
                    return 'Pro';
                if (slug === 'free' || compact === 'free')
                    return 'Free';
                if (slug === 'max' || compact === 'max')
                    return 'Max';
                if (slug === 'team' || compact === 'team')
                    return 'Team';
                if (slug === 'plus' || compact === 'plus')
                    return 'Plus';
                if (slug === 'hobby' || compact === 'hobby')
                    return 'Hobby';
                if (slug === 'enterprise' || compact === 'enterprise')
                    return 'Enterprise';
            }
            if (family === 'devin') {
                if (slug === '16' || slug === 'devin_pro' || slug === 'pro' || compact === 'pro')
                    return 'Pro';
                if (slug === '17' || slug === 'devin_max' || slug === 'max' || compact === 'max')
                    return 'Max';
                if (slug === '14' || slug === '15' || slug === 'devin_teams' || slug === 'teams' || slug === 'devin_teams_v2')
                    return 'Teams';
                if (slug === '19' || slug === 'devin_free' || slug === 'free' || compact === 'free')
                    return 'Free';
                if (slug === '20' || slug === 'devin_trial' || slug === 'trial')
                    return 'Trial';
                if (slug === '12' || slug === 'devin_enterprise' || slug === 'enterprise' || compact === 'enterprise')
                    return 'Enterprise';
            }
            if (family === 'command-code') {
                if (slug === 'individual_go' || slug === 'go')
                    return 'Go';
                if (slug === 'individual_goat' || slug === 'goat')
                    return 'GOAT';
                if (slug === 'individual_provider' || slug === 'provider')
                    return 'Provider';
                if (slug === 'individual_pro' || slug === 'individual_pro_v1' || slug === 'pro')
                    return 'Pro';
                if (slug === 'individual_max' || slug === 'max')
                    return 'Max';
                if (slug === 'individual_ultra' || slug === 'ultra')
                    return 'Ultra';
                if (slug === 'teams_pro')
                    return 'Teams Pro';
                if (slug === 'free' || slug === 'individual_free')
                    return 'Free';
            }
            return PLAN_LABELS[slug] || PLAN_LABELS[compact] || trimmed;
        }
        function isAssistOnlyPlan(raw) {
            const compact = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
            return compact === 'standard' || compact === 'standardtier' || compact === 'legacy' || compact === 'legacytier';
        }
        function planOf(account, family) {
            const labels = [
                account?.quota?.planLabel,
                account?.planLabel,
                formatPlanLabel(account?.quota?.planType || account?.planType, family),
            ];
            for (const label of labels) {
                if (typeof label !== 'string' || !label.trim())
                    continue;
                if (family === 'antigravity' && isAssistOnlyPlan(label))
                    continue;
                return label;
            }
            return '';
        }
        function isGlmAppIdentity(value) {
            if (typeof value !== 'string' || !value.trim())
                return false;
            return /^(zcode|zai|bigmodel|glm)(@|$)/i.test(value.trim());
        }
        function isGlmOpaqueIdentity(value) {
            if (typeof value !== 'string' || !value.trim())
                return false;
            const raw = value.trim();
            if (isGlmAppIdentity(raw))
                return true;
            if (raw.includes('@'))
                return false;
            if (/^[+]?[\d\s().-]+$/.test(raw) && /[+\s().-]/.test(raw))
                return false;
            // Only unambiguous ids are hidden: pure digits, UUID, long hex. A
            // letters+digits handle (xxww0098 / fwfeibn6) is a real username — the
            // backend already vetted session.account, so don't drop it here.
            if (/^\d+$/.test(raw))
                return true;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw))
                return true;
            return /^[0-9a-f]{16,}$/i.test(raw);
        }
        function isCursorOpaqueIdentity(value) {
            if (typeof value !== 'string' || !value.trim())
                return false;
            const raw = value.trim();
            if (raw.toLowerCase() === 'cursor')
                return true;
            if (/^cursor-[A-Za-z0-9_-]{4,}$/i.test(raw))
                return true;
            if (/^[A-Za-z0-9._-]+\|[A-Za-z0-9._-]+$/.test(raw) && !raw.includes('@'))
                return true;
            if (/^user_[A-Za-z0-9]{16,}$/i.test(raw))
                return true;
            return false;
        }
        function isOllamaOpaqueIdentity(value) {
            return /^ollama-[0-9a-f]{8}$/i.test(String(value ?? '').trim());
        }
        function isKimiOpaqueIdentity(value) {
            return /^kimi-[0-9a-f]{8}$/i.test(String(value ?? '').trim());
        }
        function isDevinOpaqueIdentity(value) {
            const raw = String(value ?? '').trim();
            return /^devin-[A-Za-z0-9_-]{4,}$/i.test(raw) || /^devin-team\$[A-Za-z0-9_-]+$/i.test(raw) || /^user-[0-9a-f]{16,}$/i.test(raw);
        }
        function isCommandCodeOpaqueIdentity(value) {
            const raw = String(value ?? '').trim();
            return /^command-code-(account|[0-9a-z]{8})$/i.test(raw)
                || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
        }
        function identityOf(row, family) {
            const account = typeof row?.account === 'string' ? row.account.trim() : '';
            if (family === 'glm')
                return account && !isGlmOpaqueIdentity(account) ? account : '';
            if (family === 'cursor')
                return account && !isCursorOpaqueIdentity(account) ? account : '';
            if (family === 'ollama')
                return account && !isOllamaOpaqueIdentity(account) ? account : '';
            if (family === 'kimi')
                return account && !isKimiOpaqueIdentity(account) ? account : '';
            if (family === 'devin')
                return account && !isDevinOpaqueIdentity(account) ? account : '';
            if (family === 'command-code')
                return account && !isCommandCodeOpaqueIdentity(account) ? account : '';
            if (account && !isGlmAppIdentity(account))
                return account;
            return account || row?.id || '';
        }
        const STYLE_ID = 'dsh-oauth-subs-style';
        const CSS_SHELL = `
.osubs {
  --osubs-line: color-mix(in oklab, currentColor 16%, transparent);
  --osubs-edge: color-mix(in oklab, currentColor 30%, transparent);
  --osubs-hair: color-mix(in oklab, currentColor 10%, transparent);
  --osubs-fill: color-mix(in oklab, currentColor 6%, transparent);
  --osubs-fill-2: color-mix(in oklab, currentColor 12%, transparent);
  --osubs-muted: color-mix(in oklab, currentColor 66%, transparent);
  --osubs-faint: color-mix(in oklab, currentColor 64%, transparent);
  --osubs-ok: color-mix(in oklab, #2f9e44 65%, currentColor);
  --osubs-warn: color-mix(in oklab, #b45309 70%, currentColor);
  --osubs-bad: color-mix(in oklab, #e5484d 62%, currentColor);
  --osubs-ring: color-mix(in oklab, currentColor 45%, transparent);
  --osubs-accent: var(--dsw-alias-button-primary-fill, #4d6bfe);
  --osubs-s1: 4px;
  --osubs-s2: 8px;
  --osubs-s3: 12px;
  --osubs-s4: 16px;
  --osubs-s5: 24px;
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  max-width: 1000px;
  height: 100%;
  padding: 0 var(--osubs-s5) var(--osubs-s5);
  overflow: hidden;
  font-variant-numeric: tabular-nums;
}
.osubs, .osubs * { box-sizing: border-box; min-width: 0; }
.osubs ::selection { background: color-mix(in oklab, currentColor 18%, transparent); }
.osubs p, .osubs h3, .osubs h4 { margin: 0; }

.osubs button,
.osubs [role="button"],
.osubs-link,
.osubs-dsw-mask,
.osubs-dsw-x,
.osubs-dsw-btn { cursor: pointer; }
.osubs-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 32px; padding: 0 12px;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit;
  font: inherit; font-size: 12px; font-weight: 500; line-height: 1;
  white-space: nowrap; cursor: pointer; appearance: none; -webkit-appearance: none;
  transition: background-color 140ms cubic-bezier(0.16, 1, 0.3, 1), border-color 140ms cubic-bezier(0.16, 1, 0.3, 1), color 140ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-btn:hover:not(:disabled) { background: var(--osubs-fill); border-color: color-mix(in oklab, currentColor 45%, transparent); }
.osubs-btn:active:not(:disabled) { background: var(--osubs-fill-2); }
.osubs-btn:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-btn[disabled] { opacity: .45; cursor: default; background: transparent; border-color: var(--osubs-edge); }
/* Disabled primary keeps its own fill: the transparent reset above would
   leave the primary foreground (white on light hosts) on the page bg. */
.osubs-btn--primary[disabled] {
  opacity: 1; border-color: transparent;
  background: var(--osubs-fill-2);
  color: var(--osubs-faint);
}
.osubs-btn--primary {
  height: 36px; padding: 0 16px; font-size: 13px; font-weight: 600;
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill, var(--osubs-fill-2));
  color: var(--dsw-alias-label-primary-foreground, inherit);
}
.osubs-btn--primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, color-mix(in oklab, currentColor 19%, transparent));
  border-color: transparent;
}
.osubs-btn--danger {
  font-weight: 600;
  color: var(--osubs-bad);
  border-color: color-mix(in oklab, var(--osubs-bad) 42%, transparent);
  background: color-mix(in oklab, var(--osubs-bad) 14%, transparent);
}
.osubs-btn--danger:hover:not(:disabled) {
  background: color-mix(in oklab, var(--osubs-bad) 22%, transparent);
  border-color: color-mix(in oklab, var(--osubs-bad) 58%, transparent);
}
.osubs-btn--sm { height: 28px; padding: 0 10px; font-size: 11px; }
/* Icon-only action: a square tap target with no text padding, so the glyph
   is the whole label and aria-label/title carry the name. Square comes from
   the height the size modifier already sets, so any size stays square. */
.osubs-btn--icon { padding: 0; aspect-ratio: 1; flex: none; }
.osubs-btn--update {
  color: var(--osubs-warn);
  border-color: color-mix(in oklab, var(--osubs-warn) 55%, transparent);
  background: color-mix(in oklab, var(--osubs-warn) 10%, transparent);
}
.osubs-btn--update::after {
  content: ''; width: 6px; height: 6px; margin-left: 6px; border-radius: 50%;
  background: var(--osubs-warn); flex: none;
}
.osubs-btn--update:hover:not(:disabled) {
  background: color-mix(in oklab, var(--osubs-warn) 16%, transparent);
  border-color: color-mix(in oklab, var(--osubs-warn) 70%, transparent);
}

.osubs-seg { display: inline-flex; border: 1px solid var(--osubs-edge); border-radius: 8px; overflow: hidden; flex: none; }
.osubs-seg .osubs-btn { border: 0; border-radius: 0; }
.osubs-seg .osubs-btn + .osubs-btn { box-shadow: inset 1px 0 0 0 var(--osubs-edge); }
.osubs-seg .osubs-btn:focus-visible { outline-offset: -2px; }

.osubs-card {
  display: flex; flex-direction: column; gap: var(--osubs-s3);
  padding: var(--osubs-s4) var(--osubs-s4) 20px;
  border: 1px solid var(--osubs-line); border-radius: 14px;
}
.osubs-card-head {
  display: flex; justify-content: space-between; gap: var(--osubs-s3);
  align-items: center; flex-wrap: wrap;
}
/* Legend card: the provider name sits on the card's top border — the
   line runs out to both sides and is knocked out behind the text
   (fieldset-legend style). Scoped to provider cards only; the Version
   card keeps its plain head. */
.osubs-card--legend { position: relative; }
.osubs-card--legend .osubs-card-title {
  position: absolute; top: 0; left: 8px; transform: translateY(-50%);
  padding: 0 8px; z-index: 1;
  background: var(--dsw-alias-bg-layer-2, Canvas);
}
.osubs-card-title {
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
}
/* Fixed three-region layout: this 64px topbar and the family rail never
   move; only .osubs-pane scrolls. The bar is a full-bleed strip with a
   bottom seam; its blank area is a window-drag region, the tab buttons
   stay clickable. */
.osubs-ptabs {
  flex: none;
  display: flex; align-items: flex-end; gap: 18px; height: 64px;
  margin: 0 calc(-1 * var(--osubs-s5)); padding: 0 var(--osubs-s5);
  border-bottom: 1px solid var(--osubs-line);
  -webkit-app-region: drag;
}
.osubs-ptab {
  height: 40px; padding: 0 2px; -webkit-app-region: no-drag;
  border: 0; border-radius: 0;
  background: transparent; color: var(--osubs-muted);
  font: inherit; font-size: 13px; font-weight: 500; line-height: 1;
  cursor: pointer; appearance: none; -webkit-appearance: none;
  box-shadow: inset 0 -2px 0 transparent;
  transition: color 160ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-ptab:hover:not(.osubs-ptab--on) { color: inherit; }
.osubs-ptab--on { color: var(--osubs-accent); box-shadow: inset 0 -2px 0 var(--osubs-accent); }
.osubs-ptab:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: -2px; }
.osubs-body { flex: 1 1 auto; min-height: 0; display: flex; align-items: stretch; gap: 20px; padding-top: var(--osubs-s4); }
/* top padding gives the legend title room to straddle the first card's
   border inside the scrollport instead of clipping at its edge */
.osubs-pane { display: flex; flex-direction: column; gap: var(--osubs-s4); min-width: 0; min-height: 0; flex: 1 1 auto; overflow-y: auto; padding-top: 10px; }
.osubs-pane-panel { display: flex; flex-direction: column; gap: var(--osubs-s4); min-width: 0; }
.osubs-pane-panel[hidden] { display: none !important; }
/* 额度: 分享 sits right above the cards; the list box pads up over the first
   card's legend title (which straddles its border) so the image keeps it. */
.osubs-qbar { display: flex; justify-content: flex-end; margin-bottom: calc(-1 * var(--osubs-s2, 8px)); }
.osubs-qlist { display: flex; flex-direction: column; gap: var(--osubs-s4); padding-top: 12px; margin-top: -12px; }
.osubs-qlist[hidden] { display: none; }
/* Set only while 分享 measures and clones (renderLongShot). */
.osubs-shooting [data-noshot],
.osubs-shooting .osubs-pane-panel:has(> [data-noshot]) { display: none !important; }
.osubs-pane-panel--fill { flex: 1 1 auto; min-height: 0; }
.osubs-pane-panel--fill > .osubs-card { flex: 1 1 auto; min-height: 0; }
.osubs-pane-panel--fill .osubs-mtools,
.osubs-pane-panel--fill .osubs-card > .osubs-note { flex: none; }
.osubs-pane-panel--fill .osubs-mtable { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.osubs-pane-panel--fill .osubs-mhead {
  position: sticky; top: 0; z-index: 1;
  background: linear-gradient(var(--osubs-fill), var(--osubs-fill)), var(--dsw-alias-bg-layer-2, Canvas);
}
.osubs-rail-label {
  padding: 0 10px 4px;
  font-size: 11px; letter-spacing: .04em; color: var(--osubs-faint);
}
.osubs-rail {
  flex: 0 0 228px; display: flex; flex-direction: column; gap: 2px;
  overflow-y: auto; min-height: 0;
}
.osubs-rail-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; min-height: 32px; padding: 4px 10px;
  border: 0; border-radius: 8px;
  background: transparent; color: inherit;
  font: inherit; font-size: 12.5px; line-height: 1.3; text-align: left;
  cursor: pointer; appearance: none; -webkit-appearance: none;
  transition: background-color 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-rail-item:hover:not(.osubs-rail-item--on) { background: var(--osubs-fill); }
.osubs-rail-item--on { background: var(--osubs-fill-2); font-weight: 600; }
.osubs-rail-item:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: -1px; }
.osubs-rail-ic { display: inline-flex; align-items: center; flex: none; color: var(--osubs-muted); }
.osubs-rail-item--on .osubs-rail-ic { color: var(--osubs-accent); }
.osubs-rail-icon { width: 16px; height: 16px; flex: none; }
.osubs-rail-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The view's own count keeps a fixed right-aligned slot so a 1- to 3-digit
   number never moves the column beside it. */
.osubs-rail-count {
  flex: none; min-width: 22px; text-align: right;
  font-size: 11px; color: var(--osubs-faint); font-variant-numeric: tabular-nums;
}
/* 供应商 rows report the models switched on: one right-aligned tail holds the
   mark and the count, both in fixed slots — the switch glyph starts at the
   same x on every row (its digits hang right) and the count keeps its own
   right-aligned slot, so neither number drifts with the other's width. The
   mark is the rail's only green (the fill a 模型 switch shows when it is on)
   and renders only above zero, so a green row is a real signal, not filler. */
.osubs-rail-tail { display: inline-flex; align-items: center; gap: 8px; flex: none; }
.osubs-rail-on {
  display: inline-flex; align-items: center; gap: 3px; flex: none;
  width: 40px;
  color: var(--osubs-ok); font-size: 11px; font-weight: 600; line-height: 1;
}
.osubs-rail-sw { display: block; width: 16px; height: 10px; flex: none; }
.osubs-tab-icon { width: 18px; height: 18px; display: block; flex: none; }
.osubs-about { display: flex; flex-direction: column; gap: var(--osubs-s3); font-size: 13px; line-height: 1.45; }
.osubs-about .osubs-link,
.osubs-about .osubs-hint,
.osubs-about .osubs-note { font-size: inherit; font-family: inherit; }
.osubs-kv { display: grid; }
.osubs-kv-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--osubs-s4); flex-wrap: wrap;
  padding: 8px 0; border-top: 1px solid var(--osubs-hair);
  font-size: 13px; line-height: 1.45;
}
.osubs-kv > :first-child { border-top: 0; padding-top: 0; }
.osubs-kv-row > :first-child { color: var(--osubs-muted); flex: none; }
.osubs-kv-row > :last-child { text-align: right; min-width: 0; }
.osubs-select {
  appearance: none; font: inherit; font-size: 13px; line-height: 1.45;
  color: inherit; cursor: pointer; text-align: right;
  background: color-mix(in oklab, currentColor 6%, transparent);
  border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
  border-radius: 8px; padding: 4px 28px 4px 10px;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
}
.osubs-select:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-select:disabled { opacity: 0.55; cursor: default; }
.osubs-version-pick { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }

/* About status banner: icon tile + one-line conclusion + subcopy; the apply
   CTA or the latest tag docks on the right. Tint encodes actionability —
   warn when an installable release exists, bad on a failed check, neutral
   otherwise (「已是最新」 only gets an ok icon tile, a quiet state stays
   quiet). */
.osubs-vstat {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid var(--osubs-hair); border-radius: 12px;
  background: var(--osubs-fill);
}
.osubs-vstat--warn {
  border-color: color-mix(in oklab, var(--osubs-warn) 42%, transparent);
  background: color-mix(in oklab, var(--osubs-warn) 10%, transparent);
}
.osubs-vstat--bad {
  border-color: color-mix(in oklab, var(--osubs-bad) 42%, transparent);
  background: color-mix(in oklab, var(--osubs-bad) 10%, transparent);
}
.osubs-vstat-ic {
  flex: none; width: 30px; height: 30px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--osubs-fill-2); color: var(--osubs-muted);
}
.osubs-vstat-ic svg { width: 15px; height: 15px; display: block; }
.osubs-vstat-ic--ok { color: var(--osubs-ok); background: color-mix(in oklab, var(--osubs-ok) 16%, transparent); }
.osubs-vstat--warn .osubs-vstat-ic { color: var(--osubs-warn); background: color-mix(in oklab, var(--osubs-warn) 16%, transparent); }
.osubs-vstat--bad .osubs-vstat-ic { color: var(--osubs-bad); background: color-mix(in oklab, var(--osubs-bad) 16%, transparent); }
.osubs-vstat-main { flex: 1 1 220px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.osubs-vstat-title { font-size: 13px; font-weight: 600; }
.osubs-vstat-sub { font-size: 11px; line-height: 1.45; color: var(--osubs-faint); }
.osubs-vstat-side { display: flex; align-items: center; gap: 10px; flex: none; margin-left: auto; }
.osubs-vstat-num {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px; color: var(--osubs-muted); white-space: nowrap;
}
.osubs-vstat-num--warn { color: var(--osubs-warn); }
.osubs-vstat--busy .osubs-vstat-ic { animation: osubs-pulse 1.4s ease-in-out infinite; }

/* Auto-update row: whole row toggles, note explains the 15-minute cadence. */
.osubs-kv-row.osubs-auto-row { align-items: center; position: relative; cursor: pointer; }
.osubs-kv-row.osubs-auto-row > :first-child { color: inherit; }
.osubs-auto-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; cursor: pointer; }
.osubs-auto-name { font-size: 13px; line-height: 1.45; }
.osubs-auto-note { font-size: 11px; line-height: 1.45; color: var(--osubs-faint); }
.osubs-auto-row .osubs-auto { flex: none; }
.osubs-auto-row input {
  position: absolute; width: 1px; height: 1px; margin: 0;
  opacity: 0; pointer-events: none;
}
.osubs-auto-track {
  flex: none; width: 30px; height: 17px; border-radius: 99px;
  border: 1px solid var(--osubs-edge); background: var(--osubs-fill-2);
  position: relative;
  transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1), border-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-auto-track::before {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 11px; height: 11px; border-radius: 99px;
  background: color-mix(in oklab, currentColor 62%, transparent);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-auto-row input:checked ~ .osubs-auto-track {
  background: color-mix(in oklab, var(--osubs-ok) 30%, transparent);
  border-color: color-mix(in oklab, var(--osubs-ok) 60%, transparent);
}
.osubs-auto-row input:checked ~ .osubs-auto-track::before {
  transform: translateX(13px);
  background: var(--osubs-ok);
}
.osubs-auto-row:has(input:focus-visible) { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-about-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.osubs-head-main { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
.osubs-hints { display: flex; flex-direction: column; gap: 8px; }
.osubs-link--icon .osubs-tab-icon { display: inline; width: 13px; height: 13px; margin-right: 4px; vertical-align: -2px; opacity: .85; }

/* Donate tab: QR cards arrive as data URIs from the host (assets/donate/).
   The source codes have different aspect ratios — pin a shared height and
   let width float so the caption row stays level. */
.osubs-donate { display: flex; gap: var(--osubs-s5); flex-wrap: wrap; align-items: center; }
.osubs-donate-qr { display: flex; flex-direction: column; align-items: center; gap: var(--osubs-s2); }
/* Alipay is pushed to the right so the sticker sits between the two codes. */
.osubs-donate-qr--end { margin-left: auto; }
.osubs-donate-qr img { height: 320px; width: auto; max-width: 100%; display: block; border-radius: 10px; }
.osubs-donate-meme { align-self: center; margin: 0 auto; }
.osubs-donate-meme img { height: 200px; width: auto; max-width: 240px; display: block; }
.osubs-donate-name { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: var(--osubs-muted); }
.osubs-donate-name::before { content: ''; flex: none; width: 8px; height: 8px; border-radius: 99px; background: var(--osubs-donate-brand, var(--osubs-muted)); }
.osubs-hold { position: relative; display: inline-flex; align-items: center; user-select: none; }
.osubs-hold-tip {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 8;
  max-width: 240px; padding: 6px 8px;
  font-size: 12px; line-height: 1.4; white-space: normal; text-align: left;
  color: inherit;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--osubs-line); border-radius: 8px;
  pointer-events: none;
  animation: osubs-tip-in 140ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.osubs-acct {
  display: flex; flex-direction: column; gap: 12px; width: 100%;
  padding: 14px 16px 16px;
  border: 1px solid var(--osubs-line); border-radius: 12px;
  background: transparent; color: inherit; font: inherit; text-align: left;
  cursor: pointer;
  transition: border-color 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-acct--on { border-color: color-mix(in oklab, currentColor 60%, transparent); background: transparent; }
.osubs-acct-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--osubs-s3); flex-wrap: wrap;
}
.osubs-acct-main { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1 1 180px; }
.osubs-acct-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.osubs-acct-id { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.osubs-acct-mark { flex: none; display: inline-flex; color: inherit; }
.osubs-accts { display: flex; flex-direction: column; gap: 12px; }
.osubs-acct-add {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; min-height: 34px; padding: 0 14px;
  border: 1px dashed var(--osubs-edge); border-radius: 12px;
  background: transparent; color: var(--osubs-muted);
  font: inherit; font-size: 12px; font-weight: 500; line-height: 1.3;
  cursor: pointer; appearance: none; -webkit-appearance: none;
  transition: background-color 140ms cubic-bezier(0.16, 1, 0.3, 1), border-color 140ms cubic-bezier(0.16, 1, 0.3, 1), color 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-acct-add:hover { background: var(--osubs-fill); color: inherit; border-color: color-mix(in oklab, currentColor 45%, transparent); }
.osubs-acct-add:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-verify {
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--osubs-warn) 42%, transparent);
  border-radius: 8px;
  background: color-mix(in oklab, var(--osubs-warn) 10%, transparent);
}
.osubs-hint.osubs-warn { color: var(--osubs-warn); }
.osubs-glm-logins { display: flex; flex-direction: column; gap: 6px; }
.osubs-glm-login {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; min-height: 44px; padding: 10px 14px;
  border: 1px solid var(--osubs-edge); border-radius: 12px;
  background: var(--osubs-fill-2); color: inherit;
  font: inherit; font-size: 13px; font-weight: 600; line-height: 1.3;
  cursor: pointer; text-align: left; appearance: none; -webkit-appearance: none;
}
.osubs-glm-login:hover { background: color-mix(in oklab, currentColor 19%, transparent); }
.osubs-glm-login:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-glm-ghost {
  background: transparent; font-weight: 500; color: var(--osubs-muted);
}
.osubs-glm-ghost:hover { color: inherit; }
.osubs-logins { display: flex; flex-direction: column; gap: 6px; }
.osubs-login {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; min-height: 44px; padding: 10px 14px;
  border: 1px solid var(--osubs-edge); border-radius: 12px;
  background: var(--osubs-fill-2); color: inherit;
  font: inherit; font-size: 13px; font-weight: 600; line-height: 1.3;
  cursor: pointer; text-align: left; appearance: none; -webkit-appearance: none;
}
.osubs-login:hover { background: color-mix(in oklab, currentColor 19%, transparent); }
.osubs-login:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-login-ghost {
  background: transparent; font-weight: 500; color: var(--osubs-muted);
}
.osubs-login-ghost:hover { color: inherit; }
/* Row affordance: chevron points into the flow; an expanded inline form
   turns it down; the pressed row spins until the host answers. */
.osubs-login, .osubs-glm-login {
  transition: background-color 140ms cubic-bezier(0.16, 1, 0.3, 1), border-color 140ms cubic-bezier(0.16, 1, 0.3, 1), color 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-login > span:first-child, .osubs-glm-login > span:first-child { flex: 1 1 auto; }
.osubs-login::after, .osubs-glm-login::after {
  content: ''; flex: none; width: 6px; height: 6px; margin-right: 3px;
  border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg); opacity: .5;
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 140ms ease;
}
.osubs-login:hover::after, .osubs-glm-login:hover::after { opacity: .9; }
.osubs-login[aria-expanded="true"], .osubs-glm-login[aria-expanded="true"] {
  color: inherit; border-color: color-mix(in oklab, currentColor 45%, transparent);
  background: var(--osubs-fill);
}
.osubs-login[aria-expanded="true"]::after, .osubs-glm-login[aria-expanded="true"]::after { transform: rotate(45deg); opacity: .9; }
.osubs-login[aria-busy="true"]::after, .osubs-glm-login[aria-busy="true"]::after {
  width: 12px; height: 12px; margin-right: 0; border: 1.5px solid currentColor; border-right-color: transparent;
  border-radius: 50%; transform: none; opacity: .8; animation: osubs-spin .7s linear infinite;
}
.osubs-login:disabled, .osubs-glm-login:disabled { cursor: default; }
.osubs-login:disabled:not([aria-busy="true"]), .osubs-glm-login:disabled:not([aria-busy="true"]) { opacity: .5; }
.osubs-login:disabled:hover, .osubs-glm-login:disabled:hover { background: var(--osubs-fill-2); }
.osubs-login-ghost:disabled:hover, .osubs-glm-ghost:disabled:hover { background: transparent; }
.osubs-logins > .osubs-fields, .osubs-glm-logins > form {
  padding: 12px; border: 1px solid var(--osubs-line); border-radius: 12px;
  background: var(--osubs-fill);
  animation: osubs-tip-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.osubs-field-label { font-size: 12px; font-weight: 600; }
.osubs-inline { display: flex; gap: 8px; }
.osubs-inline > .osubs-input { flex: 1 1 auto; height: 36px; }
.osubs-inline > .osubs-btn { height: 36px; flex: none; }
.osubs-fields { display: flex; flex-direction: column; gap: 8px; }
.osubs-fields > .osubs-input {
  flex: none; width: 100%; height: 36px; box-sizing: border-box;
}
.osubs-textarea {
  flex: 1 1 240px; min-height: 72px; padding: 8px 12px;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit; caret-color: currentColor; font: inherit; font-size: 12.5px;
  resize: vertical;
}
.osubs-textarea::placeholder { color: var(--osubs-faint); }
.osubs-textarea:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-eyebrow { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--osubs-muted); }
.osubs-tag {
  flex: none; padding: 2px 5px; border-radius: 5px;
  background: var(--osubs-fill-2); color: color-mix(in oklab, currentColor 75%, transparent);
  font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  line-height: 1.4; white-space: nowrap;
}
.osubs-tag--plain { text-transform: none; letter-spacing: .02em; }
.osubs-tag--warn {
  color: var(--osubs-bad);
  background: color-mix(in oklab, var(--osubs-bad) 14%, transparent);
}
.osubs-tag--ctx {
  border: 0; font-family: inherit; cursor: pointer;
}
.osubs-tag--ctx:hover {
  color: currentColor;
  background: color-mix(in oklab, currentColor 14%, transparent);
}
.osubs-tag--ctx:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-tag--custom {
  color: var(--osubs-ok);
  background: color-mix(in oklab, var(--osubs-ok) 16%, transparent);
}

.osubs-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; overflow-wrap: anywhere; }
.osubs-hint {
  display: block; max-width: 100%;
  font-size: 12px; line-height: 1.55; color: var(--osubs-muted);
  overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap;
}
.osubs-hint.osubs-bad { max-height: 4.65em; overflow-x: hidden; overflow-y: auto; }
.osubs-note { font-size: 11px; color: var(--osubs-faint); white-space: pre-wrap; overflow-wrap: anywhere; }
.osubs-qnote { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
.osubs-qnote-label { font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: var(--osubs-faint); }
.osubs-qnote-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.osubs-qnote-chip { display: inline-flex; align-items: baseline; gap: 4px; font-weight: 500; }
.osubs-qnote-count { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px; color: var(--osubs-muted); }
.osubs-bad { color: var(--osubs-bad); overflow-wrap: anywhere; word-break: break-word; max-width: 100%; }
.osubs-actions { display: flex; flex-wrap: wrap; gap: 8px; }

.osubs-input {
  flex: 1 1 240px; height: 36px; padding: 0 12px;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit; caret-color: currentColor; font: inherit; font-size: 12.5px;
}
.osubs-input::placeholder { color: var(--osubs-faint); }
.osubs-input:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
/* A measurement field: mono figures, and a bad-value border that matches
   the readout instead of only tinting the hint text. */
.osubs-input--num {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
.osubs-input--bad { border-color: color-mix(in oklab, var(--osubs-bad) 65%, transparent); }

/* Context-window dialog: the fact strip (now / catalog default / ceiling)
   replaces a sentence of hint text. */
.osubs-ctx-stats {
  display: flex; gap: var(--osubs-s4);
  padding: 10px 12px; border-radius: 12px;
  background: var(--osubs-fill);
}
.osubs-ctx-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.osubs-ctx-stat-label {
  font-size: 10px; letter-spacing: .05em; text-transform: uppercase;
  color: var(--osubs-faint);
}
.osubs-ctx-stat-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* "Customized" uses the same green tint as the --custom row tag. */
.osubs-ctx-stat--now .osubs-ctx-stat-value { color: var(--osubs-ok); }

/* The scale is the slider: a quota-bar-idiom track over 0…ceiling you
   drag or arrow-key at a 1K step, writing the draft back as k/m shorthand.
   At rest it shows the row's effective window; a parseable draft repaints
   it accent, an out-of-range draft repaints it bad. Preset nodes sit on
   the track as dots and under it as labels — either fills the draft. */
.osubs-ctx-scale { display: flex; flex-direction: column; gap: 6px; padding: 4px 2px 0; }
.osubs-ctx-readout {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  font-size: 12px; line-height: 1.5; color: var(--osubs-muted);
}
.osubs-ctx-tokens {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
}
.osubs-ctx-readout.osubs-bad .osubs-ctx-pct { color: inherit; }
.osubs-ctx-pct {
  flex: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; color: var(--osubs-faint); font-variant-numeric: tabular-nums;
}
.osubs-ctx-slider { position: relative; }
.osubs-ctx-track {
  position: relative; height: 6px; border-radius: 99px;
  background: var(--osubs-hair);
  touch-action: none;
}
.osubs-ctx-track:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 4px; }
/* The knob is purely visual; the track itself owns pointer + keys. */
.osubs-ctx-thumb {
  position: absolute; top: 50%; width: 14px; height: 14px;
  border-radius: 99px; transform: translate(-50%, -50%);
  background: var(--dsw-alias-bg-layer-2, Canvas);
  border: 1px solid var(--osubs-edge);
  box-shadow: 0 1px 3px color-mix(in oklab, currentColor 20%, transparent);
  pointer-events: none;
}
/* Preset nodes: small punched dots on the track (same chrome as the
   default tick); the matching labels sit in the ends row below. */
.osubs-ctx-node {
  position: absolute; top: 50%; width: 10px; height: 10px; padding: 0;
  border-radius: 99px; transform: translate(-50%, -50%);
  border: 1px solid var(--osubs-edge);
  background: var(--dsw-alias-bg-layer-2, Canvas);
  cursor: pointer;
}
.osubs-ctx-node:hover:not(:disabled) { border-color: var(--osubs-accent); }
.osubs-ctx-node:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-ctx-key {
  position: absolute; top: 0; padding: 0 4px;
  border: 0; border-radius: 6px; transform: translateX(-50%);
  background: transparent; font: inherit;
  color: var(--osubs-accent); cursor: pointer;
}
.osubs-ctx-key:hover:not(:disabled) { background: var(--osubs-fill); }
.osubs-ctx-key:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-ctx-node:disabled, .osubs-ctx-key:disabled { opacity: .4; cursor: default; }
.osubs-ctx-fill {
  position: absolute; inset: 0; border-radius: 99px;
  transform-origin: left center;
  background: color-mix(in oklab, currentColor 45%, transparent);
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), background-color 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
/* Catalog default sits on the scale as a punched-out marker that reads on
   the hair track and across the fill alike. */
.osubs-ctx-tick {
  position: absolute; top: -3px; bottom: -3px; width: 4px;
  border-radius: 2px; transform: translateX(-50%);
  background: var(--dsw-alias-bg-layer-2, Canvas);
  border: 1px solid var(--osubs-edge);
}
.osubs-ctx-ends {
  position: relative;
  display: flex; justify-content: space-between;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; color: var(--osubs-faint); font-variant-numeric: tabular-nums;
}
/* Reset docks at the footer's left edge; the rest is the outline
   dialog button's own chrome. */
.osubs-ctx-reset { margin-right: auto; gap: 6px; }
.osubs-ctx-reset svg { display: block; }

.osubs-link { font-size: 12.5px; color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: color-mix(in oklab, currentColor 55%, transparent); width: fit-content; transition: text-decoration-color 140ms cubic-bezier(0.16, 1, 0.3, 1); }
.osubs-link--action { border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; cursor: pointer; }
.osubs-link--action:disabled { cursor: default; opacity: .6; }
.osubs-link:hover { text-decoration-color: currentColor; }
.osubs-link:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; border-radius: 2px; }

.osubs-quota { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; border-top: 1px solid var(--osubs-hair); }

.osubs-qrow { display: flex; flex-direction: column; gap: 6px; }
.osubs-qrow-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 12px; }
.osubs-qcluster { display: flex; flex-direction: column; gap: 10px; }
.osubs-qcluster + .osubs-qcluster {
  margin-top: 2px; padding-top: 10px;
  border-top: 1px solid var(--osubs-hair);
}
.osubs-qgroup {
  font-size: 12.5px; font-weight: 600; line-height: 1.35;
  color: var(--osubs-muted);
}
.osubs-qmeter { display: flex; flex-direction: column; gap: 4px; }
.osubs-qreset { font-size: 11px; color: var(--osubs-faint); text-align: right; line-height: 1.35; }
.osubs-bar { height: 6px; border-radius: 99px; background: var(--osubs-hair); overflow: hidden; }
.osubs-bar > i { display: block; height: 100%; border-radius: 99px; background: color-mix(in oklab, currentColor 82%, transparent); transform-origin: left center; transition: background-color 220ms cubic-bezier(0.16, 1, 0.3, 1); }
/* fieldset + legend: the title sits on (and cuts) the dashed top border. */
.osubs-qbox {
  display: flex; flex-direction: column; gap: 0;
  min-width: 0; margin: 2px 0 0; padding: 0 14px 4px;
  border: 1px dashed var(--osubs-edge); border-radius: 10px;
  background: transparent;
}
.osubs-qbox-title {
  font-size: 13px; font-weight: 600; line-height: 1.35;
  padding: 0 6px; margin-left: -6px;
}
.osubs-reset-row {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center; gap: 14px;
  min-height: 60px; padding: 10px 0;
  border-radius: 0;
  transition: background-color 700ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-reset-row + .osubs-reset-row { border-top: 1px dashed var(--osubs-line); }
.osubs-reset-row--spent {
  background: color-mix(in oklab, currentColor 6%, transparent);
  transition-duration: 140ms;
}
.osubs-reset-meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.osubs-reset-when { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
.osubs-reset-when::first-letter { text-transform: uppercase; }
.osubs-reset-rel { font-size: 11.5px; color: var(--osubs-muted); }
.osubs-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
/* Front card stays put. Cards behind step right; the white line is inset
   so it stays on the black face instead of vanishing into the page. */
.osubs-rstack {
  --rcard-w: 40px; --rcard-h: 44px; --rcard-step: 8px;
  --rcard-edge: inset 0 0 0 1px var(--dsw-alias-bg-layer-2, #fff);
  position: relative; flex: none;
  width: calc(var(--rcard-w) + var(--rcard-behind, 0) * var(--rcard-step));
  height: var(--rcard-h);
}
.osubs-rcard-back {
  position: absolute; top: 0; width: var(--rcard-w); height: var(--rcard-h);
  border-radius: 7px; pointer-events: none;
  background: currentColor; box-shadow: var(--rcard-edge);
}
/* Ink card: currentColor fill; digits and the inset edge knock out to the host surface. */
.osubs-rcard {
  position: absolute; left: 0; top: 0; z-index: 2; width: var(--rcard-w); height: var(--rcard-h); box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border: 0; border-radius: 7px;
  background: currentColor; box-shadow: var(--rcard-edge);
  overflow: hidden;
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-rcard-n {
  display: block; font-size: 19px; font-weight: 650; line-height: 1; letter-spacing: -0.02em;
  color: var(--dsw-alias-bg-layer-2, Canvas);
}
.osubs-rcard-u { font-size: 10px; line-height: 1; color: color-mix(in oklab, var(--dsw-alias-bg-layer-2, Canvas) 75%, transparent); }
.osubs-rstack--empty .osubs-rcard { border: 1px dashed var(--osubs-edge); background: transparent; box-shadow: none; }
.osubs-rstack[tabindex] { outline: none; }
.osubs-rstack[tabindex]:focus-visible .osubs-rcard { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-rtip {
  position: absolute; left: 0; top: calc(100% + 8px); z-index: 8;
  display: flex; flex-direction: column; gap: 4px;
  width: max-content; max-width: 260px; padding: 8px 10px;
  font-size: 12px; line-height: 1.4; white-space: nowrap;
  color: inherit;
  background: var(--dsw-alias-bg-layer-2, Canvas);
  border: 1px solid var(--osubs-line); border-radius: 8px;
  box-shadow: 0 8px 20px -10px color-mix(in oklab, currentColor 40%, transparent);
  animation: osubs-tip-in 140ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.osubs-rtip-line { display: flex; align-items: baseline; gap: 8px; }
.osubs-rtip-i { min-width: 1.2em; text-align: right; color: var(--osubs-muted); font-size: 11px; }
`;
        const CSS_VIEWS = `
/* Usage tab: stat strip, output-on-input bar chart (CSS columns, two tones
   of the accent — never vendor tints), per-model rows with share bars. */
/* No in-card title: the 用量 tab already names the view. The note+actions
   group hugs the left, the range picker the right; in the 分享 image the
   .osubs-noshot controls drop out, so margin-left:auto keeps the picker at
   the right edge there too. */
.osubs-uhead { display: flex; align-items: center; gap: var(--osubs-s3); flex-wrap: wrap; }
.osubs-uhead > .osubs-seg { margin-left: auto; }
.osubs-uhead-note { margin-right: 2px; }
/* Skipped when the card is cloned for 分享; lays out as if absent. */
.osubs-noshot { display: contents; }
.osubs-dsw-card--shot { width: min(720px, 100%); }
/* 分享, macOS style: a white flash over the captured card, then a floating
   thumbnail in the window's bottom-right corner (ShotThumb animates it in). */
.osubs-flash {
  position: fixed; z-index: 60; pointer-events: none;
  background: #fff; border-radius: 14px;
  animation: osubs-flash 380ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
@keyframes osubs-flash { 0% { opacity: 0; } 16% { opacity: 0.88; } 100% { opacity: 0; } }
.osubs-thumb {
  position: fixed; z-index: 61; padding: 0; overflow: hidden; cursor: pointer;
  background: var(--dsw-alias-bg-layer-2, Canvas);
  border: 1px solid var(--osubs-edge); border-radius: 10px;
  box-shadow: 0 14px 34px -10px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.04);
}
.osubs-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.osubs-thumb:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-thumb-badge {
  position: absolute; left: 6px; bottom: 6px; padding: 2px 7px;
  font-size: 11px; line-height: 1.4; color: #fff;
  background: rgba(0, 0, 0, 0.62); border-radius: 999px;
}
.osubs-shot {
  max-height: min(62vh, 640px); overflow-y: auto;
  border: 1px solid var(--osubs-line); border-radius: 10px;
}
.osubs-shot img { display: block; width: 100%; height: auto; }
/* The four stat cards (Token / 缓存读 / 调用 / 估算成本) are the strip's whole
   set, so four equal columns hold them in one row at every width — 估算成本
   never orphans onto a second line. Values are short and the sub-lines
   ellipsize; the 560px rule falls back to 2×2. */
.osubs-ustats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--osubs-s3); }
.osubs-ustat {
  display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 10px 12px;
  border: 1px solid var(--osubs-line); border-radius: 10px;
}
.osubs-ustat-l { font-size: 11px; color: var(--osubs-muted); }
.osubs-ustat-v { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.osubs-ustat-s { font-size: 11px; color: var(--osubs-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Input/output read as two tones of the accent with no legend — the stat
   sub-line and each bar's tooltip name them. */
.osubs-ubar-in { background: color-mix(in oklab, var(--osubs-accent) 42%, transparent); }
.osubs-ubar-out { background: var(--osubs-accent); }
.osubs-uchart {
  display: grid; grid-template-columns: auto 1fr; grid-template-rows: 180px auto;
  column-gap: 8px; row-gap: 6px;
}
.osubs-uaxis {
  display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end;
  font-size: 11px; color: var(--osubs-faint); font-variant-numeric: tabular-nums;
  margin: -0.6em 0;
}
/* Gridlines at 50% / 100%: recessive hairlines behind the bars. */
.osubs-uplot {
  position: relative; display: flex; align-items: flex-end; gap: 2px;
  border-bottom: 1px solid var(--osubs-edge);
  background:
    linear-gradient(var(--osubs-hair), var(--osubs-hair)) top / 100% 1px no-repeat,
    linear-gradient(var(--osubs-hair), var(--osubs-hair)) center / 100% 1px no-repeat;
}
.osubs-ucol {
  position: relative; flex: 1 1 0; min-width: 0; height: 100%;
  display: flex; align-items: flex-end; justify-content: center;
  border-radius: 4px; outline: none; cursor: default;
}
.osubs-ucol:hover, .osubs-ucol--on { background: var(--osubs-fill); }
.osubs-ucol:focus-visible { box-shadow: inset 0 0 0 2px var(--osubs-ring); }
.osubs-ubar {
  display: flex; flex-direction: column; width: min(100%, 28px);
  border-radius: 4px 4px 0 0; overflow: hidden;
  transition: height 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-ubar > i { display: block; flex-basis: 0; min-height: 0; }
.osubs-ubar-out + .osubs-ubar-in { border-top: 1px solid var(--dsw-alias-bg-layer-2, Canvas); }
.osubs-ucol--on .osubs-ubar { filter: saturate(1.25) brightness(1.06); }
.osubs-utip { top: 4px; left: calc(100% + 6px); min-width: 150px; pointer-events: none; }
.osubs-utip--end { left: auto; right: calc(100% + 6px); }
.osubs-uxlabels {
  grid-column: 2; display: flex; gap: 2px;
  font-size: 11px; color: var(--osubs-faint); font-variant-numeric: tabular-nums;
}
.osubs-uxlabels > span { flex: 1 1 0; min-width: 0; text-align: center; white-space: nowrap; overflow: visible; }
.osubs-utable { display: flex; flex-direction: column; margin-top: var(--osubs-s3); }
.osubs-urow {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(56px, 18%) 200px;
  align-items: center; gap: var(--osubs-s3); padding: 8px 2px;
  border-top: 1px solid var(--osubs-hair);
}
.osubs-urow--head { border-top: 0; padding-top: 0; font-size: 11px; color: var(--osubs-muted); }
.osubs-umodel { display: flex; align-items: center; gap: 8px; min-width: 0; }
.osubs-umodel-who { display: flex; flex-direction: column; min-width: 0; }
.osubs-umodel-n, .osubs-umodel-s { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.osubs-umodel-s { font-size: 11px; color: var(--osubs-faint); }
.osubs-unum { display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; }
.osubs-unum small { font-size: 11px; color: var(--osubs-faint); white-space: nowrap; }
.osubs-ushare { height: 6px; border-radius: 3px; background: var(--osubs-fill); overflow: hidden; }
.osubs-ushare > i { display: block; height: 100%; border-radius: 3px; background: color-mix(in oklab, var(--osubs-accent) 72%, transparent); }
/* The 按模型/按会话 head: the label left, the toggle right (out of shots). */
.osubs-urow--pick { display: flex; justify-content: space-between; align-items: center; }
.osubs-useg { display: inline-flex; gap: 4px; }
.osubs-usess-n { display: inline-flex; align-items: center; gap: 6px; }
.osubs-ucopy {
  font: inherit; font-size: 11px; font-family: var(--osubs-mono, ui-monospace, monospace);
  color: var(--osubs-muted); background: none; border: 1px solid var(--osubs-line);
  border-radius: 5px; padding: 0 5px; cursor: pointer; line-height: 18px;
}
.osubs-ucopy:hover { color: var(--osubs-ink); border-color: var(--osubs-muted); }
/* Loading skeleton: the tiles and chart hold their place while the first scan runs. */
.osubs-usk { display: flex; flex-direction: column; gap: var(--osubs-s3); }
.osubs-sk { display: block; border-radius: 6px; background: var(--osubs-fill); animation: osubs-pulse 1.4s ease-in-out infinite; }
.osubs-sk--n { width: 56%; height: 22px; margin-top: 4px; }
.osubs-sk--l { width: 36%; height: 11px; margin-top: 6px; }
.osubs-sk--chart { height: 200px; }
@media (max-width: 560px) {
  .osubs-ustats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .osubs-urow { grid-template-columns: minmax(0, 1fr) 150px; }
  .osubs-ushare { display: none; }
}

/* Models-tab price tag + tooltip (src/catalog/rates.json rows). */
.osubs-ptag {
  position: relative; flex: none; display: inline-flex;
  color: var(--osubs-warn); border-radius: 5px; cursor: default;
}
.osubs-ptag svg { width: 12px; height: 12px; display: block; }
.osubs-ptag:hover, .osubs-ptag:focus-visible {
  color: color-mix(in oklab, var(--osubs-warn) 80%, currentColor);
}
.osubs-ptag:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-ptag .osubs-rtip { top: calc(100% + 4px); padding: 9px 11px; gap: 5px; }
.osubs-ptip-line { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; }
.osubs-ptip-l { color: var(--osubs-muted); }
.osubs-ptip-v { font-variant-numeric: tabular-nums; }
.osubs-ptip-sep { border-top: 1px solid var(--osubs-line); margin: 3px 0; }
.osubs-ptip-note { color: var(--osubs-faint); font-size: 11px; white-space: normal; max-width: 240px; line-height: 1.45; }
.osubs-rstack--empty .osubs-rcard-n { color: var(--osubs-faint); }
.osubs-rstack--empty .osubs-rcard-u { color: var(--osubs-faint); }
.osubs-rstack--busy .osubs-rcard {
  transform: translateY(-3px);
  box-shadow: var(--rcard-edge), 0 4px 10px -5px color-mix(in oklab, currentColor 45%, transparent);
}

/* Urgent: the earliest banked card expires inside 24h. The stack's ink
   (face + the cards stepped to its right) goes bad-red; under 1h the face breathes with a
   period that tightens as expiry nears, and under 10min the face swaps
   the count for a live seconds countdown. */
.osubs-rstack { transition: color 480ms cubic-bezier(0.16, 1, 0.3, 1), width 200ms cubic-bezier(0.16, 1, 0.3, 1); }
.osubs-rstack--urgent { color: var(--osubs-bad); }
.osubs-rcard::after {
  content: ''; position: absolute; inset: 2px; border-radius: 5px;
  background: var(--osubs-bad); opacity: 0; pointer-events: none;
  transition: opacity 480ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-rstack--urgent .osubs-rcard::after { opacity: 1; }
.osubs-rcard-n, .osubs-rcard-u { position: relative; z-index: 1; }
.osubs-rstack--blink .osubs-rcard {
  animation: osubs-rblink var(--osubs-blink-int, 1600ms) ease-in-out infinite;
}
@keyframes osubs-rblink {
  0%, 100% {
    filter: brightness(1);
    box-shadow: var(--rcard-edge), 0 0 0 0 color-mix(in oklab, var(--osubs-bad) 0%, transparent);
  }
  50% {
    filter: brightness(1.45);
    box-shadow: var(--rcard-edge), 0 2px 12px -1px color-mix(in oklab, var(--osubs-bad) 65%, transparent);
  }
}
.osubs-rcard-n--cd { font-size: 15px; letter-spacing: -0.04em; }
.osubs-rcard-u--cd { color: color-mix(in oklab, var(--dsw-alias-bg-layer-2, Canvas) 85%, transparent); }
@keyframes osubs-rcd-tick {
  from { transform: scale(1.16); }
  to { transform: scale(1); }
}
.osubs-rcard-n--tick { animation: osubs-rcd-tick 300ms cubic-bezier(0.16, 1, 0.3, 1); }
.osubs-reset-rel--bad { color: var(--osubs-bad); font-weight: 600; font-variant-numeric: tabular-nums; }

.osubs-rcard--ghost {
  z-index: 3; pointer-events: none;
  animation: osubs-card-spend 560ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.osubs-rcard-n--in { animation: osubs-count-in 380ms 150ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes osubs-card-spend {
  0% { transform: translateY(-3px); opacity: 1; }
  28% { transform: translate(3px, -10px) rotate(4deg); opacity: 1; }
  100% { transform: translate(20px, -26px) rotate(15deg) scale(0.9); opacity: 0; filter: blur(1.5px); }
}
@keyframes osubs-count-in {
  from { transform: translateY(70%); opacity: 0; filter: blur(2px); }
  to { transform: none; opacity: 1; filter: none; }
}
@keyframes osubs-fade-out { to { opacity: 0; } }

.osubs-dsw {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.osubs-dsw-mask {
  position: absolute; inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, .24));
  backdrop-filter: var(--dsw-mask-blur, blur(2px));
  animation: osubs-fade 240ms ease-out both;
}
.osubs-dsw-card {
  position: relative; z-index: 1;
  animation: osubs-dialog-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
  display: flex; flex-direction: column; gap: 20px;
  width: min(440px, 100%);
  max-height: calc(100vh - 48px);
  padding: 0 0 24px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-inverted, color-mix(in oklab, currentColor 10%, transparent));
  border-radius: 24px;
  background: var(--dsw-alias-bg-layer-2, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
  box-shadow: var(--dsw-shadow-lv3, 0 18px 48px color-mix(in oklab, #000 22%, transparent));
}
.osubs-dsw-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 22px 14px 12px 24px;
}
.osubs-dsw-title {
  margin: 0;
  font-size: 16px; line-height: 24px; font-weight: 500;
  color: var(--dsw-alias-label-primary, inherit);
}
.osubs-dsw-x {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 0; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
}
.osubs-dsw-x:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in oklab, currentColor 8%, transparent)); }
.osubs-dsw-x:focus-visible,
.osubs-dsw-btn:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-dsw-card--add { width: min(480px, 100%); }
.osubs-dsw-card:focus { outline: none; }
.osubs-dsw-heading { display: flex; align-items: center; gap: 12px; min-width: 0; }
.osubs-dsw-titles { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.osubs-dsw-sub { margin: 0; font-size: 12px; line-height: 16px; color: var(--osubs-muted, color-mix(in oklab, currentColor 66%, transparent)); }
.osubs-dsw-mark {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 10px;
  border: 1px solid color-mix(in oklab, currentColor 12%, transparent);
  background: color-mix(in oklab, currentColor 5%, transparent);
}
.osubs-dsw-mark-icon { width: 20px; height: 20px; display: block; }
.osubs-dsw-card--add .osubs-dsw-head { padding-bottom: 4px; }
.osubs-dsw-card--add .osubs-dsw-body input,
.osubs-dsw-card--add .osubs-dsw-body textarea { font-size: 13px; }
.osubs-dsw-error {
  margin: 0; padding: 10px 12px; border-radius: 10px;
  font-size: 12px; line-height: 1.5; overflow-wrap: anywhere;
  color: var(--osubs-bad, #e5484d);
  background: color-mix(in oklab, var(--osubs-bad, #e5484d) 10%, transparent);
  max-height: 6em; overflow-y: auto;
}
.osubs-auth { display: flex; flex-direction: column; gap: 14px; }
.osubs-auth-status { display: flex; align-items: flex-start; gap: 10px; }
.osubs-auth-dot {
  flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%;
  background: var(--osubs-warn, #b45309);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--osubs-warn, #b45309) 18%, transparent);
  animation: osubs-pulse 1.6s ease-in-out infinite;
}
.osubs-auth-copy { display: flex; flex-direction: column; gap: 2px; }
.osubs-auth-title { font-size: 14px; font-weight: 600; line-height: 1.4; }
.osubs-auth-open { align-self: stretch; gap: 6px; text-decoration: none; }
.osubs a.osubs-btn--primary,
.osubs a.osubs-btn--primary:link,
.osubs a.osubs-btn--primary:visited,
.osubs a.osubs-btn--primary:hover {
  color: var(--dsw-alias-label-primary-foreground, Canvas);
  text-decoration: none;
}
.osubs-auth-ext { display: block; flex: none; opacity: .85; }
.osubs-auth-paste { padding-top: 12px; border-top: 1px solid var(--osubs-hair); }
.osubs-auth-foot { display: flex; justify-content: flex-end; }
.osubs-pair {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.osubs-pair-label { font-size: 11px; color: var(--osubs-muted); }
.osubs-pair-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 20px; font-weight: 600; letter-spacing: .14em;
  user-select: all;
}
.osubs-pair--lg {
  flex-direction: column; align-items: stretch; gap: 8px;
  padding: 14px; border: 1px dashed var(--osubs-edge); border-radius: 12px;
  background: var(--osubs-fill); text-align: center;
}
.osubs-pair--lg .osubs-pair-code { font-size: 26px; letter-spacing: .2em; padding: 2px 0; }
.osubs-pair-copy {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  height: 26px; padding: 0 9px; border: 1px solid var(--osubs-edge); border-radius: 7px;
  background: transparent; color: inherit; font: inherit; font-size: 11.5px; cursor: pointer;
  transition: background-color 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-pair--lg .osubs-pair-copy { align-self: center; }
.osubs-pair-copy:hover { background: var(--osubs-fill-2); }
.osubs-pair-copy:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-pair-copy svg { display: block; }
.osubs-dsw-body { display: flex; flex-direction: column; padding: 0 24px; }
.osubs-dsw-body--stack {
  gap: 10px;
  max-height: min(64vh, 520px);
  overflow: auto;
  padding-bottom: 8px;
}
.osubs-dsw-warning {
  display: flex; align-items: flex-start; gap: 10px;
  color: var(--dsw-alias-label-secondary, color-mix(in oklab, currentColor 72%, transparent));
  font-size: 14px; line-height: 22px;
}
.osubs-dsw-warning p { margin: 0; }
.osubs-dsw-icon { flex: none; margin-top: 2px; color: var(--dsw-alias-state-error-primary, #e5484d); }
.osubs-dsw-ack {
  display: flex; align-items: flex-start; gap: 10px; margin-top: 20px;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 14px; line-height: 22px; cursor: pointer;
}
.osubs-dsw-ack input {
  flex: none; width: 16px; height: 16px; margin: 3px 0 0;
  accent-color: var(--dsw-alias-button-primary-fill, currentColor);
}
.osubs-dsw-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 0 24px;
}
.osubs-dsw-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 36px; padding: 0 16px;
  border-radius: 18px; border: 1px solid transparent;
  background: transparent; color: inherit;
  font: inherit; font-size: 14px; font-weight: 500; line-height: 1;
  cursor: pointer;
}
.osubs-dsw-btn--outline {
  min-width: 72px;
  border-color: var(--dsw-alias-border-l2, color-mix(in oklab, currentColor 18%, transparent));
}
.osubs-dsw-btn--outline:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in oklab, currentColor 8%, transparent)); }
.osubs-dsw-btn--primary {
  min-width: 136px;
  background: var(--dsw-alias-button-primary-fill, #0f1115);
  color: var(--dsw-alias-label-primary-foreground, #fff);
}
.osubs-dsw-btn--primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, color-mix(in oklab, #0f1115 88%, #fff));
}
.osubs-dsw-btn:disabled { opacity: .4; cursor: default; pointer-events: none; }

/* About changelog: wider than the login dialog so three release sections
   read as a list, not a narrow column. Hairlines match the reference
   notes card (title rule, version rule, pinned close). */
.osubs-dsw-card--notes { width: min(640px, 100%); gap: 0; }
.osubs-dsw-card--notes .osubs-dsw-head {
  border-bottom: 1px solid var(--dsw-alias-border-l2, color-mix(in oklab, currentColor 10%, transparent));
}
.osubs-dsw-body--notes {
  overflow: auto;
  padding: 8px 24px 4px;
  gap: 0;
}
.osubs-dsw-card--notes .osubs-dsw-foot {
  padding-top: 16px;
  border-top: 1px solid var(--dsw-alias-border-l2, color-mix(in oklab, currentColor 10%, transparent));
}
.osubs-notes { display: flex; flex-direction: column; }
.osubs-notes-rel + .osubs-notes-rel {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--dsw-alias-border-l2, color-mix(in oklab, currentColor 10%, transparent));
}
.osubs-notes-ver {
  margin: 10px 0 0;
  font-size: 15px; line-height: 22px; font-weight: 650;
  color: var(--dsw-alias-label-primary, inherit);
}
.osubs-notes-sec { margin-top: 14px; }
.osubs-notes-cat {
  margin: 0 0 8px;
  font-size: 14px; line-height: 20px; font-weight: 650;
  color: var(--dsw-alias-label-primary, inherit);
}
.osubs-notes-list {
  margin: 0; padding: 0 0 0 1.2em;
  display: flex; flex-direction: column; gap: 8px;
  list-style: disc;
}
.osubs-notes-list li {
  font-size: 13px; line-height: 1.6;
  color: var(--dsw-alias-label-secondary, color-mix(in oklab, currentColor 72%, transparent));
}
.osubs-notes-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
  padding: 0 4px; border-radius: 4px;
  background: color-mix(in oklab, currentColor 8%, transparent);
  color: var(--dsw-alias-label-primary, inherit);
}
.osubs-notes-status {
  margin: 12px 0;
  font-size: 13px; line-height: 1.5;
  color: var(--dsw-alias-label-secondary, var(--osubs-muted));
}

.osubs-mtools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.osubs-msearch { position: relative; flex: 1 1 160px; max-width: 300px; }
.osubs-msearch svg {
  position: absolute; left: 9px; top: 50%; transform: translateY(-50%);
  width: 13px; height: 13px; color: var(--osubs-faint); pointer-events: none;
}
.osubs-msearch input {
  width: 100%; height: 30px; padding: 0 10px 0 28px; box-sizing: border-box;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit; caret-color: currentColor;
  font: inherit; font-size: 12px;
}
.osubs-msearch input::placeholder { color: var(--osubs-faint); }
.osubs-msearch input:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-meffort { display: inline-flex; align-items: center; gap: 6px; flex: none; font-size: 12px; }
.osubs-meffort > span { color: var(--osubs-muted); }
.osubs-meffort select {
  height: 30px; padding: 0 8px; border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit; font: inherit; font-size: 12px;
}
.osubs-meffort select:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-mcount {
  margin-left: auto; flex: none;
  font-size: 12px; color: var(--osubs-muted); white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.osubs-mtable { border: 1px solid var(--osubs-line); border-radius: 10px; overflow: hidden; }
.osubs-mtable > * + * { border-top: 1px solid var(--osubs-hair); }
.osubs-mhead {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  height: 34px; padding: 0 12px;
  font-size: 11px; color: var(--osubs-faint); background: var(--osubs-fill);
}
.osubs-mgroup {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  min-height: 34px; padding: 4px 12px;
  font-size: 12px; font-weight: 700; letter-spacing: .02em;
  background: var(--osubs-fill);
}
.osubs-mgroup-side { display: inline-flex; align-items: center; gap: 8px; flex: none; font-weight: 600; color: var(--osubs-muted); }
.osubs-mrow {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 42px; padding: 4px 12px;
}
.osubs-mrow:hover { background: var(--osubs-fill); }
.osubs-mname { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; font-size: 13px; }
.osubs-vision { flex: none; display: inline-flex; margin-left: -2px; color: var(--osubs-faint); }
.osubs-vision svg { width: 13px; height: 13px; display: block; }
.osubs-mempty { padding: 14px 12px; }

/* 榜单 tab: the arena.ai agent leaderboard. The panel takes the
   fill variant (only the table scrolls, the head sticks) — same mechanics
   as the models table, including the double-layer sticky background so
   rows never ghost under the head. */
.osubs-pane-panel--fill > .osubs-arena { flex: 1 1 auto; min-height: 0; }
.osubs-arena { display: flex; flex-direction: column; gap: var(--osubs-s3); }
/* Shooting the leaderboard: with the controls [data-noshot]-hidden, the
   section leaves the fill layout and the table unscrolls to its full
   height, so every filtered row lands in the image. */
.osubs-arena.osubs-shooting { flex: none; }
.osubs-arena.osubs-shooting .osubs-atable { flex: none; overflow: visible; }
.osubs-arena.osubs-shooting .osubs-aparetto { flex: none; overflow: visible; }
.osubs-atools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: none; }
.osubs-asearch { flex: 1 1 150px; max-width: 260px; }
.osubs-atable {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  border: 1px solid var(--osubs-line); border-radius: 10px;
}
.osubs-atrow {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) minmax(190px, 34%) minmax(104px, auto) minmax(72px, auto);
  align-items: center; gap: 12px;
  min-height: 48px; padding: 6px 14px;
}
.osubs-atrow + .osubs-atrow { border-top: 1px solid var(--osubs-hair); }
.osubs-atrow:hover { background: var(--osubs-fill); }
.osubs-atrow--head {
  position: sticky; top: 0; z-index: 1;
  min-height: 0; height: 34px;
  font-size: 11px; color: var(--osubs-faint);
  background: linear-gradient(var(--osubs-fill), var(--osubs-fill)), var(--dsw-alias-bg-layer-2, Canvas);
}
.osubs-atrow--empty { min-height: 0; }
.osubs-atcell { min-width: 0; }
.osubs-atcell--rank { text-align: center; }
.osubs-atcell--score { display: flex; justify-content: flex-end; }
.osubs-atcell--success { justify-content: center; }
.osubs-atcell--cost { display: flex; justify-content: flex-end; }
.osubs-acost { font-size: 12px; color: var(--osubs-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.osubs-ahead-btn {
  display: inline-flex; align-items: center; gap: 3px;
  border: 0; padding: 0; background: transparent; color: inherit;
  font: inherit; font-size: 11px; cursor: pointer; appearance: none;
}
.osubs-ahead-btn:hover { color: var(--osubs-muted); }
.osubs-ahead-btn:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-ahead-btn--on { color: var(--osubs-muted); }
.osubs-ahead-btn--end { margin-left: auto; }
.osubs-ahead-arrow { font-variant-numeric: tabular-nums; }
/* Rank: the number over its interval (min⋯max glyph, title carries the
   range). */
.osubs-arank { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.25; }
.osubs-arank-n { font-size: 13px; font-variant-numeric: tabular-nums; }
.osubs-arank-spread {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10.5px; color: var(--osubs-faint); font-variant-numeric: tabular-nums;
}
.osubs-arank-spread svg { width: 12px; height: 12px; }
/* Model: org mark (ink, like arena's table) + mono name + org · license. */
.osubs-amodel { display: flex; align-items: center; gap: 8px; min-width: 0; }
.osubs-amark { width: 16px; height: 16px; flex: none; color: var(--osubs-muted); }
.osubs-amark--alt {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 4px;
  border: 1px solid var(--osubs-line); font-size: 9px; color: var(--osubs-faint);
}
.osubs-amodel-who { display: flex; flex-direction: column; min-width: 0; }
.osubs-amodel-n {
  font-family: var(--osubs-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12.5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
a.osubs-amodel-n { color: inherit; text-decoration: none; }
a.osubs-amodel-n:hover { color: var(--osubs-accent); text-decoration: underline; }
.osubs-amodel-s { font-size: 11px; color: var(--osubs-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Score cells: the arena stack (▲14.33% over ±2.18%), ok/bad by sign —
   tool hallucination inverts (positive rate = Down = good). Only Net
   Improvement grows the diverging whisker bar. */
.osubs-ascore { display: flex; align-items: center; gap: 10px; min-width: 0; width: 100%; }
.osubs-astack {
  display: inline-flex; flex-direction: column; align-items: flex-end; flex: none; width: 68px;
  line-height: 1.25; font-variant-numeric: tabular-nums;
}
.osubs-atcell--success .osubs-astack { align-items: center; }
.osubs-avalue { display: inline-flex; align-items: center; gap: 2px; font-size: 12.5px; }
.osubs-aarrow { width: 10px; height: 10px; flex: none; }
.osubs-aok { color: var(--osubs-ok); }
.osubs-abad { color: var(--osubs-bad); }
.osubs-aci { font-size: 10.5px; color: var(--osubs-faint); }
.osubs-abar { display: block; flex: 1 1 auto; min-width: 0; height: 16px; width: 100%; overflow: visible; }
.osubs-abar-track { fill: var(--osubs-fill-2); }
.osubs-abar-ok { fill: var(--osubs-ok); }
.osubs-abar-bad { fill: var(--osubs-bad); }
.osubs-abar-mid { stroke: var(--osubs-accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.osubs-abar-ci { stroke: var(--osubs-muted); stroke-width: 0.8; vector-effect: non-scaling-stroke; }
/* Source attribution footline: stays under the scroller, never flexes. */
.osubs-afoot { flex: none; }
.osubs-afoot-link { display: inline-flex; align-items: baseline; gap: 3px; }
.osubs-afoot-link svg { width: 10px; height: 10px; flex: none; align-self: center; opacity: .8; }
/* 帕累托 view: frontier chart + timeline list, drawn to match the site's
   chart (dashed grid, top dollar axis, 2.5px frontier line, sans chips).
   Only this pane scrolls; the chart is a fixed-aspect svg that fills the
   width. */
.osubs-aparetto {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  border: 1px solid var(--osubs-line); border-radius: 10px;
  padding: var(--osubs-s3);
  display: flex; flex-direction: column; gap: var(--osubs-s3);
}
/* Chart + optimal list sit side-by-side inside the single card, like the
   site's 4xl:flex-row: chart column flexes, the optimal list is a fixed
   288px rail that drops below on narrow panes. */
.osubs-aptwo { display: flex; flex-direction: row; gap: var(--osubs-s3); flex: 0 0 auto; min-width: 0; align-items: stretch; }
.osubs-apmain { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: var(--osubs-s3); }
.osubs-apside {
  flex: 0 0 288px; width: 288px; min-width: 0;
  display: flex; flex-direction: column; gap: var(--osubs-s2);
  border-left: 1px solid var(--osubs-line); padding-left: var(--osubs-s3);
}
@media (max-width: 940px) {
  .osubs-aptwo { flex-direction: column; }
  .osubs-apside { flex: none; width: auto; border-left: 0; padding-left: 0; border-top: 1px solid var(--osubs-line); padding-top: var(--osubs-s3); }
}
.osubs-aphead { display: flex; flex-direction: row; align-items: flex-start; justify-content: space-between; gap: var(--osubs-s2); flex: none; }
.osubs-aphead-l { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.osubs-aptitle { font-size: 16px; font-weight: 300; }
.osubs-apsub { font-size: 12px; color: var(--osubs-muted); }
/* Chart chrome top-right: ⌘Scroll hint chip + the +/− zoom pair, mirroring
   the site's bordered control cluster (h-7, radius-md, font-xs). */
.osubs-apctrl { display: flex; align-items: center; gap: 6px; flex: none; }
/* Cost | Output Tokens segmented tabs, the site's role=tab pair. Same
   bordered 28px chip as the zoom group; the active tab fills. */
.osubs-apmetric { display: inline-flex; align-items: stretch; height: 28px; border: 1px solid var(--osubs-line); border-radius: 6px; overflow: hidden; background: var(--osubs-bg,#fff); }
.osubs-apmetab {
  display: inline-flex; align-items: center; padding: 0 10px; border: 0;
  background: transparent; color: var(--osubs-muted); font-size: 12px;
  font-family: inherit; cursor: pointer; white-space: nowrap;
}
.osubs-apmetab + .osubs-apmetab { border-left: 1px solid var(--osubs-line); }
.osubs-apmetab:hover { background: var(--osubs-fill-1, rgba(0,0,0,.05)); color: var(--osubs-ink); }
.osubs-apmetab--on, .osubs-apmetab[aria-selected='true'] { background: var(--osubs-fill-1, rgba(0,0,0,.06)); color: var(--osubs-ink); font-weight: 500; }
/* Task-length percentile picker — same bordered-28px chrome as the zoom
   pair, menu reused from .osubs-acost-menu. Items get a check column and a
   two-line label (percentile + task-length hint) like the site's menu. */
.osubs-appct { position: relative; display: inline-flex; align-items: stretch; }
.osubs-appct .osubs-acost-sortbtn {
  height: 28px; padding: 0 8px; display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--osubs-line); border-radius: 6px; background: var(--osubs-bg,#fff);
  font-size: 12px; color: var(--osubs-muted); cursor: pointer; white-space: nowrap;
}
.osubs-appct .osubs-acost-sortbtn:hover { color: var(--osubs-ink); background: var(--osubs-fill-1, rgba(0,0,0,.05)); }
.osubs-appct .osubs-acost-sortbtn svg { width: 13px; height: 13px; flex: none; }
.osubs-appct .osubs-acost-menu { min-width: 196px; }
.osubs-appct-item { align-items: flex-start; gap: 6px; }
.osubs-appct-tick { width: 14px; flex: none; color: var(--osubs-ink); font-size: 12px; line-height: 1.4; }
.osubs-appct-lines { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.osubs-appct-name { font-size: 13px; color: var(--osubs-ink); line-height: 1.3; }
.osubs-appct-sub { font-size: 11.5px; color: var(--osubs-muted); line-height: 1.3; }
.osubs-apscroll {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px;
  background: var(--osubs-bg, #fff); border: 1px solid var(--osubs-line); border-radius: 6px;
  font-size: 12px; color: var(--osubs-muted); white-space: nowrap;
}
.osubs-apkbd {
  display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
  background: var(--osubs-fill-1, rgba(0,0,0,.05)); border: 1px solid var(--osubs-line); border-radius: 4px;
  font-family: inherit; font-size: 12px; color: var(--osubs-muted); font-style: normal;
}
.osubs-apzoom { display: inline-flex; align-items: stretch; height: 28px; border: 1px solid var(--osubs-line); border-radius: 6px; overflow: hidden; background: var(--osubs-bg,#fff); }
.osubs-apzoomb {
  display: inline-flex; align-items: center; justify-content: center; width: 28px;
  border: 0; background: transparent; color: var(--osubs-muted); cursor: pointer; padding: 0;
}
.osubs-apzoomb + .osubs-apzoomb { border-left: 1px solid var(--osubs-line); }
.osubs-apzoomb:hover { background: var(--osubs-fill-1, rgba(0,0,0,.05)); color: var(--osubs-ink); }
.osubs-apzoomb svg { width: 15px; height: 15px; }
/* Chart frame: the svg keeps a fixed 788×380 viewBox so every overlay offset
   stays in logical units; CSS stretches it to the column width and the
   browser scales overlays by percentage so narrow columns still show the
   right-hand frontier points instead of clipping them off. */
/* No overflow:hidden here: post-viewBox the svg scales to exactly the wrap
   width, so nothing needs clipping — and the hover card must float past the
   wrap top at near-top points (site's Radix card overflows the chart too). */
.osubs-apwrap { position: relative; width: 100%; max-width: 788px; height: auto; flex: none; align-self: center; }
.osubs-apchart { display: block; width: 100%; height: auto; flex: none; cursor: grab; touch-action: none; }
.osubs-apchart:active { cursor: grabbing; }
.osubs-apgrid { stroke: var(--osubs-line); stroke-width: 1; stroke-dasharray: 4 4; }
.osubs-apaxis { stroke: var(--osubs-line); stroke-width: 1; }
.osubs-aptick {
  font-family: var(--osubs-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px; fill: var(--osubs-muted); font-variant-numeric: tabular-nums;
}
.osubs-apline {
  fill: none; stroke: var(--osubs-ok); stroke-width: 2.5;
  stroke-linecap: round; stroke-linejoin: round;
}
/* Frontier dots inside the svg — the site draws them as solid #40b841 r=5
   circles (visible, not just hit areas), the white marker tile sits on top. */
.osubs-aphot { pointer-events: all; cursor: pointer; }
/* Scatter layer: clipped to the 688×280 plot (80,30) — the site's own
   absolute overflow-hidden layer at those exact offsets. pointer-events
   stay on the dots; the layer itself passes events through to the svg. */
.osubs-apscat {
  position: absolute; left: 10.15%; top: 7.89%; width: 87.31%; height: 73.68%;
  overflow: hidden; pointer-events: none;
}
.osubs-apsc {
  position: absolute; width: 8px; height: 8px; opacity: .7;
  /* left/top is the point; the square centres on it. The translate lives in
     the base rule so :hover's scale() composes instead of overriding. */
  transform: translate(-50%, -50%);
  cursor: pointer; pointer-events: all;
  transition: transform 150ms ease-out, opacity 150ms ease-out;
}
@supports (width: 1cqw) {
  .osubs-apsc { width: 1.02cqw; height: 1.02cqw; }
}
.osubs-apsc:hover { transform: translate(-50%, -50%) scale(1.8); opacity: 1; }
.osubs-apsc--teal { background: #14b8a6; }
.osubs-apsc--blue8 { background: #1e40af; }
.osubs-apsc--blue7 { background: #1d4ed8; }
.osubs-apsc--blue6 { background: #2563eb; }
.osubs-apsc--blue5 { background: #3b82f6; }
.osubs-apsc--yellow { background: #eab308; }
.osubs-apsc--yellow7 { background: #a16207; }
.osubs-apsc--yellow8 { background: #854d0e; }
.osubs-apsc--neutral7 { background: #404040; }
.osubs-apsc--neutral6 { background: #525252; }
.osubs-apsc--red { background: #ef4444; }
/* Marker layer: offset -18/-18 (site uses 62/12 vs scatter's 80/30) so
   labels can rise past the plot top. Percentage offsets keep the layer
   glued to the plot when the viewBox shrinks. */
.osubs-apmark {
  position: absolute; left: 7.87%; top: 3.16%; width: 91.88%; height: 83.16%;
  /* parent layer passes events; tiles opt back in below. */
  pointer-events: none;
}
.osubs-apmk { pointer-events: all; }
.osubs-apmk {
  position: absolute; display: flex; align-items: center; justify-content: center;
  /* 28px at the 788 viewBox; scales with the column via cqw so the tile
     doesn't dominate when the svg shrinks below its logical width. */
  width: 28px; height: 28px; border-radius: 2px;
  /* left/top is the point; the tile centres on it — keep the translate in the
     base rule so :hover's scale(1.15) composes instead of overriding. */
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, .95); border: 2px solid var(--osubs-ok);
  color: var(--osubs-ink); overflow: hidden;
  cursor: pointer; pointer-events: all;
  transition: transform 150ms ease-out;
}
@supports (width: 1cqw) {
  .osubs-apwrap { container-type: inline-size; }
  .osubs-apmk { width: 3.55cqw; height: 3.55cqw; border-width: 0.254cqw; }
  .osubs-apmk .osubs-amark { width: 2.03cqw; height: 2.03cqw; }
}
.osubs-apmk:hover { transform: translate(-50%, -50%) scale(1.15); }
.osubs-apmk .osubs-amark { width: 16px; height: 16px; }
/* Leader line: a 1px dashed green run from a displaced chip back down to its
   marker — the site draws these so a bumped label still reads as its point. */
.osubs-aplead {
  position: absolute; width: 0;
  border-left: 1px dashed var(--osubs-ok);
  pointer-events: none;
}
.osubs-aplab {
  position: absolute; display: inline-block; padding: 3px 6px;
  /* left is the chip's centre x — translateX centres the label on it without
     needing the measured chip width in the component. */
  transform: translateX(-50%);
  background: var(--osubs-bg, #fff); border: 1px solid var(--osubs-line); border-radius: 4px;
  font-size: 10px; font-weight: 500; color: var(--osubs-muted);
  white-space: nowrap; line-height: 1.2;
}
/* Hover tooltip — the site's card pinned to the point: white surface,
   border-medium edge, rounded-lg, 12×8 padding, max-width 220, z 40. */
.osubs-aptip {
  position: absolute; display: flex; align-items: flex-start; gap: 8px;
  padding: 8px 12px; border-radius: 8px; max-width: 220px;
  background: var(--osubs-bg, #fff); border: 1px solid var(--osubs-line);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1);
  pointer-events: none; z-index: 40;
  /* Anchor is the data point; the card floats centred ~10px above it. */
  transform: translate(-50%, calc(-100% - 10px));
}
/* Too close to the top edge to float above — drop below the point. */
.osubs-aptip--below { transform: translate(-50%, 14px); }
/* 得分/成本换行后卡会收缩到一行宽，名称/厂商跟着折行——给卡体一个
   贴近站点 220 卡的最小宽，名称与 org·license 保持单行。 */
.osubs-aptip-body { min-width: 150px; }
.osubs-aptip .osubs-amark { width: 18px; height: 18px; flex: none; margin-top: 2px; }
.osubs-aptip-name { margin: 0; font-size: 14px; font-weight: 500; color: var(--osubs-ink); line-height: 1.3; }
.osubs-aptip-org { margin: 1px 0 0; font-size: 12px; color: var(--osubs-muted); line-height: 1.3; }
/* 得分/成本两段在 zh 下长于英文（卡 max-width 220 放不下）：行内可换行，
   每段自身 nowrap 保证数字不断行；列间距 12、行间距收紧到 2。 */
.osubs-aptip-figs { margin: 4px 0 0; font-size: 12px; color: var(--osubs-muted); display: flex; flex-wrap: wrap; column-gap: 12px; row-gap: 2px; }
.osubs-aptip-figs > span { white-space: nowrap; }
.osubs-aptip-pos { color: var(--osubs-ok); font-weight: 500; }
/* Axis title: centred under the plot area (the svg's left margin is 80/788,
   right 20/788), mono like the site's footnote row. */
.osubs-apfoot {
  flex: none; font-size: 12px; color: var(--osubs-muted);
  font-family: var(--osubs-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  margin: 0 2.5% 0 10.2%; text-align: center;
}
.osubs-aplist { display: flex; flex-direction: column; flex: none; }
.osubs-aprow {
  display: grid; grid-template-columns: 10px 20px minmax(0, 1fr) auto;
  align-items: center; gap: 12px; padding: 8px 4px;
}
.osubs-apnode {
  position: relative; width: 8px; height: 8px; flex: none;
  border: 1.5px solid var(--osubs-ok); border-radius: 2px; justify-self: center;
}
.osubs-apnode i {
  position: absolute; left: 50%; top: 100%; width: 1px; height: 46px;
  background: var(--osubs-ok); transform: translateX(-50%);
}
.osubs-apwho { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.osubs-apname {
  font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
a.osubs-apname { color: inherit; }
.osubs-apsub { font-size: 11.5px; color: var(--osubs-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.osubs-apfigs { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.osubs-apval { font-size: 13.5px; color: var(--osubs-ok); font-variant-numeric: tabular-nums; white-space: nowrap; }
.osubs-apval--bad { color: var(--osubs-bad); }
.osubs-apcost { font-size: 11.5px; color: var(--osubs-faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* View-as toggle buttons carry the site's glyphs. */
.osubs-vseg { display: inline-flex; align-items: center; gap: 4px; }
.osubs-vseg svg { width: 13px; height: 13px; }

/* Cost per Task — the pareto page's second block: bordered card, header row
   (title+ⓘ/sub left, legend+Sort right), then 15 rows of cost bars scaled
   to the column max. Bar green is brand-green-8, a step darker than the
   frontier line's --osubs-ok. */
.osubs-acostcard {
  flex: none; display: flex; flex-direction: column; gap: var(--osubs-s2);
  border: 1px solid var(--osubs-line); border-radius: 10px; padding: var(--osubs-s3);
}
.osubs-acost-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--osubs-s2);
}
.osubs-acost-titlebox { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.osubs-acost-title {
  display: flex; align-items: center; gap: 6px; margin: 0;
  font-size: 16px; font-weight: 300; color: var(--osubs-ink);
}
.osubs-acost-info {
  display: inline-flex; padding: 0; border: 0; background: none;
  color: var(--osubs-faint); cursor: help;
}
.osubs-acost-info svg { width: 14px; height: 14px; }
.osubs-acost-sub { margin: 0; font-size: 12px; color: var(--osubs-muted); }
.osubs-acost-tools { display: flex; align-items: center; gap: 6px; flex: none; }
.osubs-acost-legend {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 8px; border: 1px solid var(--osubs-line); border-radius: 6px;
  background: transparent; color: var(--osubs-muted);
  font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer;
}
.osubs-acost-legend:hover { color: var(--osubs-ink); }
.osubs-acost-legend--on {
  background: var(--osubs-bg, Canvas); color: var(--osubs-ink);
  border-color: var(--osubs-line);
}
.osubs-acost-legend:focus-visible { outline: 2px solid var(--osubs-accent, #2563eb); outline-offset: 2px; }
.osubs-acost-legend i {
  width: 8px; height: 8px; border-radius: 2px; background: var(--osubs-ok); flex: none;
}
.osubs-acost-sort { position: relative; }
.osubs-acost-sortbtn {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 4px;
  height: 28px; padding: 0 8px; border: 1px solid var(--osubs-line); border-radius: 6px;
  background: var(--osubs-bg, transparent); color: var(--osubs-muted);
  font-size: 12px; cursor: pointer; white-space: nowrap;
}
.osubs-acost-sortbtn:hover { color: var(--osubs-ink); }
.osubs-acost-sortbtn svg { width: 14px; height: 14px; flex: none; }
.osubs-acost-menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 10;
  min-width: 170px; padding: 4px;
  border: 1px solid var(--osubs-line); border-radius: 8px;
  background: var(--osubs-bg, #fff); box-shadow: 0 8px 24px rgb(0 0 0 / .10);
  display: flex; flex-direction: column;
}
.osubs-acost-item {
  display: flex; align-items: center; width: 100%; padding: 7px 10px;
  border: 0; border-radius: 5px; background: none; text-align: left;
  font-size: 12px; color: var(--osubs-muted); cursor: pointer;
}
.osubs-acost-item:hover { background: var(--osubs-fill-1); color: var(--osubs-ink); }
.osubs-acost-item--on { color: var(--osubs-ink); font-weight: 500; }
.osubs-acost-list { display: flex; flex-direction: column; flex: none; }
.osubs-acost-row {
  display: grid; grid-template-columns: 24px 20px minmax(0, 1fr) auto; /* rank, mark, name, figs */
  grid-template-rows: auto auto; align-items: center; column-gap: 10px;
  min-height: 44px; padding: 6px 4px; position: relative;
}
.osubs-acost-num {
  grid-row: 1; width: 24px; height: 24px; border-radius: 2px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--osubs-line); background: var(--osubs-fill-1);
  color: var(--osubs-muted); font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums;
}
.osubs-acost-num--front {
  background: var(--osubs-ok); border-color: var(--osubs-ok); color: #fff;
}
.osubs-acost-row > .osubs-amark { grid-row: 1; }
.osubs-acost-name {
  grid-row: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 14px; color: var(--osubs-ink);
}
.osubs-acost-link { color: inherit; text-decoration: none; }
.osubs-acost-link:hover { text-decoration: underline; }
.osubs-acost-track {
  grid-column: 1 / -1; grid-row: 2; position: relative; display: block;
  height: 6px; margin-top: 6px;
  border-radius: 999px; background: var(--osubs-fill-1); overflow: hidden;
}
.osubs-acost-svg { display: none; }
.osubs-acost-bar {
  position: absolute; inset: 0 auto 0 0; min-width: 4px;
  border-radius: 999px; background: #2e9440; /* hsl(var(--brand-green-8)) */
}
.osubs-acost-figs { display: flex; flex-direction: column; gap: 0; line-height: 1.15; }
.osubs-acost-figs--side { grid-column: 4; grid-row: 1; align-items: flex-end; }
.osubs-acost-figs--float { display: none; }
.osubs-acost-usd {
  font-size: 13px; color: var(--osubs-ink); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.osubs-acost-pct {
  font-size: 11.5px; color: var(--osubs-ok); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.osubs-acost-pct--bad { color: var(--osubs-bad); }
/* ≥560px the site swaps to the tall bar + right-of-bar figures layout. */
@media (min-width: 560px) {
  .osubs-acost-row { grid-template-columns: 24px 20px minmax(0, 220px) minmax(0, 1fr); }
  .osubs-acost-name { grid-row: 1; }
  .osubs-acost-track {
    grid-column: 4; grid-row: 1; height: 44px; margin-top: 0;
    background: none; border-radius: 0; overflow: visible;
  }
  .osubs-acost-svg { display: block; width: 100%; height: 44px; }
  .osubs-acost-svg rect { fill: #2e9440; } /* hsl(var(--brand-green-8)) */
  .osubs-acost-bar { display: none; }
  .osubs-acost-figs--side { display: none; }
  .osubs-acost-figs--float {
    display: flex; position: absolute; top: 0; bottom: 0;
    flex-direction: column; align-items: flex-start; justify-content: center;
  }
}
/* Narrow pane: arena's own table drops columns too; keep rank + model + the
   headline score, let the bar flex smaller. */
@media (max-width: 560px) {
  .osubs-atrow { grid-template-columns: 40px minmax(0, 1fr) minmax(130px, auto) minmax(64px, auto); gap: 8px; padding: 6px 10px; }
  .osubs-atcell--success { display: none; }
}

.osubs-switch { position: relative; display: inline-flex; flex: none; cursor: pointer; }
.osubs-switch input {
  position: absolute; width: 1px; height: 1px; margin: 0;
  opacity: 0; pointer-events: none;
}
.osubs-switch-track {
  display: block; width: 34px; height: 20px; border-radius: 99px;
  border: 1px solid var(--osubs-edge); background: var(--osubs-fill-2);
  position: relative;
  transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1), border-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-switch-track::before {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 99px;
  background: color-mix(in oklab, currentColor 62%, transparent);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-switch input:checked ~ .osubs-switch-track {
  background: color-mix(in oklab, var(--osubs-ok) 30%, transparent);
  border-color: color-mix(in oklab, var(--osubs-ok) 60%, transparent);
}
.osubs-switch input:checked ~ .osubs-switch-track::before { transform: translateX(14px); background: var(--osubs-ok); }
.osubs-switch:has(input:focus-visible) .osubs-switch-track { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-switch:has(input:disabled) { cursor: default; opacity: .55; }

@media (max-width: 720px) {
  .osubs { padding: 0 var(--osubs-s3) var(--osubs-s3); }
  .osubs-ptabs {
    margin: 0 calc(-1 * var(--osubs-s3)); padding: 0 var(--osubs-s3);
  }
  .osubs-body { flex-direction: column; }
  .osubs-rail { flex: none; width: 100%; position: static; flex-direction: row; flex-wrap: wrap; }
  .osubs-rail-item { width: auto; }
}

@keyframes osubs-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
@keyframes osubs-spin { to { transform: rotate(360deg) } }
.osubs-refresh { display: inline-flex; align-items: center; gap: 5px; }
.osubs-refresh svg { width: 12px; height: 12px; display: block; }
.osubs-refresh--spin svg { animation: osubs-spin .8s linear infinite; }
@keyframes osubs-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes osubs-dialog-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
@keyframes osubs-tip-in {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .osubs-auth-dot { animation: none !important; }
  .osubs-logins > .osubs-fields, .osubs-glm-logins > form { animation: none !important; }
  .osubs-login::after, .osubs-glm-login::after { transition: none !important; }
  .osubs-dsw-mask,
  .osubs-dsw-card,
  .osubs-hold-tip { animation: none !important; }
  .osubs-vstat--busy .osubs-vstat-ic { animation: none !important; }
  .osubs-refresh--spin svg { animation: osubs-pulse 1.4s ease-in-out infinite !important; }
  .osubs-rstack--blink .osubs-rcard,
  .osubs-rcard-n--tick { animation: none !important; }
  .osubs-bar > i { transition: background-color 160ms ease; }
  .osubs-auto-track, .osubs-auto-track::before,
  .osubs-switch-track, .osubs-switch-track::before,
  .osubs-ctx-fill, .osubs-ctx-thumb, .osubs-ctx-node,
  .osubs-ptab, .osubs-rail-item, .osubs-ubar { transition: none !important; }
  .osubs-sk { animation: none !important; }
  .osubs-flash { display: none; }
  .osubs-dsw-card { transform: none; }
  .osubs-rcard--ghost { animation: osubs-fade-out 240ms ease forwards !important; }
  .osubs-rtip { animation: none !important; }
  .osubs-rcard-n--in { animation: osubs-fade 240ms ease both !important; }
  .osubs-rstack--busy .osubs-rcard { transform: none; }
}
`;
        const CSS = CSS_SHELL + CSS_VIEWS;
        function ensureStyles() {
            if (typeof document === 'undefined')
                return;
            let el = document.getElementById(STYLE_ID);
            if (!el) {
                el = document.createElement('style');
                el.id = STYLE_ID;
                document.head.appendChild(el);
            }
            el.textContent = CSS;
        }
        ensureStyles();
        function formatQuotaError(raw, limit = 160) {
            const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
            if (!text)
                return '';
            const http = text.match(/\bHTTP\s+(\d{3})\b/i)?.[1];
            const jsonAt = text.indexOf('{');
            let human = '';
            if (jsonAt >= 0) {
                const blob = text.slice(jsonAt);
                let parsed;
                try {
                    parsed = JSON.parse(blob);
                }
                catch {
                    parsed = undefined;
                }
                const err = parsed && typeof parsed === 'object' ? parsed.error : undefined;
                if (err && typeof err === 'object') {
                    if (typeof err.message === 'string' && err.message.trim())
                        human = err.message.trim();
                    else if (typeof err.code === 'string' && err.code.trim())
                        human = err.code.trim();
                }
                else if (typeof err === 'string' && err.trim()) {
                    human = err.trim();
                }
                if (!human && parsed && typeof parsed === 'object') {
                    if (typeof parsed.message === 'string' && parsed.message.trim())
                        human = parsed.message.trim();
                    else if (typeof parsed.code === 'string' && parsed.code.trim())
                        human = parsed.code.trim();
                }
                if (!human) {
                    const named = blob.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
                    const coded = blob.match(/"code"\s*:\s*"((?:\\.|[^"\\])*)"/);
                    const pick = named?.[1] || coded?.[1];
                    if (pick) {
                        try {
                            human = JSON.parse(`"${pick}"`);
                        }
                        catch {
                            human = pick;
                        }
                    }
                }
            }
            if (!human) {
                human = (jsonAt >= 0 ? text.slice(0, jsonAt) : text).replace(/:\s*$/, '').trim();
            }
            if (http && human && !new RegExp(`\\bHTTP\\s+${http}\\b`, 'i').test(human)) {
                human = `${human} (HTTP ${http})`;
            }
            if (human.length <= limit)
                return human;
            return `${human.slice(0, limit).trimEnd()}…`;
        }
        function remainingPercentOf(row) {
            if (typeof row?.remainingPercent === 'number' && Number.isFinite(row.remainingPercent)) {
                return Math.max(0, Math.min(100, row.remainingPercent));
            }
            if (typeof row?.usedPercent === 'number' && Number.isFinite(row.usedPercent)) {
                return Math.max(0, Math.min(100, 100 - row.usedPercent));
            }
            return undefined;
        }
        function quotaTone(remaining) {
            if (typeof remaining !== 'number' || !Number.isFinite(remaining))
                return null;
            if (remaining <= 15)
                return 'bad';
            if (remaining <= 40)
                return 'warn';
            // Healthy windows read in ink: color is reserved for a warning.
            return null;
        }
        /* Bar fill ramp: 100% remaining = --osubs-ok (green), 50% = --osubs-warn,
           0% = --osubs-bad (red). HSL keeps the midpoint a clean amber instead
           of the muddy brown an oklab mix of the endpoints would give. */
        function quotaFillColor(remaining) {
            if (typeof remaining !== 'number' || !Number.isFinite(remaining))
                return undefined;
            const pct = Math.max(0, Math.min(100, remaining));
            return pct >= 50
                ? `color-mix(in hsl, var(--osubs-ok) ${Math.round((pct - 50) * 2)}%, var(--osubs-warn))`
                : `color-mix(in hsl, var(--osubs-warn) ${Math.round(pct * 2)}%, var(--osubs-bad))`;
        }
        // `icon` drops the text padding for a square button whose glyph is the
        // whole label — the name then lives in `ariaLabel` (a11y) + `title`
        // (hover), so an icon-only control never becomes nameless.
        function Button({ label, onClick, variant, size, type = 'button', disabled, mark, icon, title, ariaLabel }) {
            const classes = ['osubs-btn'];
            if (variant)
                classes.push(`osubs-btn--${variant}`);
            if (size)
                classes.push(`osubs-btn--${size}`);
            if (mark)
                classes.push('osubs-btn--update');
            if (icon)
                classes.push('osubs-btn--icon');
            return h('button', {
                type, onClick, disabled, title,
                'aria-label': ariaLabel,
                className: classes.join(' '),
            }, label);
        }
        const HOLD_TIP_MS = 450;
        function HoldTip({ label, children }) {
            const [open, setOpen] = useState(false);
            const timer = useRef(0);
            const shown = useRef(false);
            const clear = () => {
                clearTimeout(timer.current);
                timer.current = 0;
                if (!shown.current)
                    return;
                shown.current = false;
                setOpen(false);
            };
            const start = (event) => {
                if (event.button != null && event.button !== 0)
                    return;
                clearTimeout(timer.current);
                timer.current = setTimeout(() => {
                    shown.current = true;
                    setOpen(true);
                }, HOLD_TIP_MS);
            };
            useEffect(() => () => clearTimeout(timer.current), []);
            if (!label)
                return children;
            return h('span', {
                className: 'osubs-hold',
                onPointerDown: start,
                onPointerUp: clear,
                onPointerCancel: clear,
                onPointerLeave: clear,
            }, children, open && h('span', { className: 'osubs-hold-tip', role: 'tooltip' }, label));
        }
        // LobeHub icons from @lobehub/icons-static-svg@1.95.1
        // https://unpkg.com/@lobehub/icons-static-svg@1.95.1/icons/{grok,zai,cursor,ollama,cline,github,opencode,openai}.svg
        // `raw` entries are the official colored variants (icons/{codex,kiro,antigravity,kimi,devin,deepseek}-color.svg)
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
        };
        function TabIcon({ name, className }) {
            const icon = TAB_ICONS[name];
            if (icon.raw) {
                return h('svg', {
                    className: className ?? 'osubs-tab-icon',
                    viewBox: icon.viewBox ?? '0 0 24 24',
                    width: 18,
                    height: 18,
                    'aria-hidden': 'true',
                    dangerouslySetInnerHTML: { __html: icon.raw },
                });
            }
            return h('svg', {
                className: className ?? 'osubs-tab-icon',
                viewBox: '0 0 24 24',
                width: 18,
                height: 18,
                fill: 'currentColor',
                fillRule: 'evenodd',
                'aria-hidden': 'true',
            }, h('path', icon.clip ? { d: icon.d, clipRule: 'evenodd' } : { d: icon.d }));
        }
        function PageTab({ id, label, view, onSelect }) {
            return h('button', {
                type: 'button',
                role: 'tab',
                'aria-selected': view === id,
                className: `osubs-ptab${view === id ? ' osubs-ptab--on' : ''}`,
                onClick: () => onSelect(id),
            }, label);
        }
        function IconGrid() {
            return h('svg', {
                className: 'osubs-rail-icon',
                viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('rect', { x: 4, y: 4, width: 7, height: 7, rx: 1.5 }), h('rect', { x: 13, y: 4, width: 7, height: 7, rx: 1.5 }), h('rect', { x: 4, y: 13, width: 7, height: 7, rx: 1.5 }), h('rect', { x: 13, y: 13, width: 7, height: 7, rx: 1.5 }));
        }
        /** The rail's "models on" mark: a switch drawn in its on state, the same
            idiom as the switches on the 模型 page — knob right, track an outline —
            so the row reads without a legend. */
        function RailOnMark() {
            return h('svg', {
                className: 'osubs-rail-sw',
                viewBox: '0 0 16 10', width: 16, height: 10,
                'aria-hidden': 'true',
            }, h('rect', { x: 0.5, y: 0.5, width: 15, height: 9, rx: 4.5, fill: 'none', stroke: 'currentColor', strokeOpacity: 0.5 }), h('circle', { cx: 11.5, cy: 5, r: 2.9, fill: 'currentColor' }));
        }
        function RailItem({ item, current, onSelect, t }) {
            const on = item.models?.on ?? 0;
            // The tail is one right-aligned pair: the models-on mark, then the
            // view's own count (accounts / models / models in use).
            const modelsOn = on > 0 ? fill(t.railModelsOn, { n: on, m: item.models.total }) : '';
            return h('button', {
                type: 'button',
                'aria-current': current === item.id ? 'true' : undefined,
                className: `osubs-rail-item${current === item.id ? ' osubs-rail-item--on' : ''}`,
                onClick: () => onSelect(item.id),
            }, h('span', { className: 'osubs-rail-ic', style: item.color ? { color: item.color } : undefined }, item.id === 'all'
                ? h(IconGrid)
                : item.icon && h(TabIcon, { name: item.icon, className: 'osubs-rail-icon' })), h('span', { className: 'osubs-rail-name' }, item.name), h('span', { className: 'osubs-rail-tail' }, 
            // Nothing renders at zero: an unmarked row means nothing is on,
            // so a marked row stays a real signal.
            modelsOn ? h('span', {
                className: 'osubs-rail-on',
                role: 'img',
                'aria-label': modelsOn,
                title: modelsOn,
            }, h(RailOnMark), on) : null, item.count !== undefined && h('span', { className: 'osubs-rail-count' }, item.count)));
        }
        function Switch({ checked, disabled, onChange, label }) {
            return h('label', { className: 'osubs-switch' }, h('input', {
                type: 'checkbox',
                checked,
                disabled,
                'aria-label': label,
                onChange: (event) => { if (!disabled)
                    onChange?.(event.currentTarget.checked); },
            }), h('span', { className: 'osubs-switch-track', 'aria-hidden': 'true' }));
        }
        function IconSearch() {
            return h('svg', {
                viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round',
                'aria-hidden': 'true',
            }, h('circle', { cx: 11, cy: 11, r: 7 }), h('path', { d: 'm20 20-3.8-3.8' }));
        }
        function antigravityGroupLabel(product, t) {
            const text = String(product ?? '');
            if (/claude|gpt/i.test(text))
                return t.agClaudeGpt;
            if (/gemini/i.test(text))
                return t.agGemini;
            return text;
        }
        function rowLabel(row, t, family) {
            if (family === 'ollama') {
                if (row.kind === 'primary')
                    return t.primary;
                if (row.kind === 'weekly')
                    return t.weekly;
            }
            if (family === 'glm' || family === 'antigravity') {
                if (row.kind === 'primary')
                    return t.glmPrimary;
                if (row.kind === 'weekly')
                    return t.glmWeekly;
                if (family === 'glm' && (row.kind === 'mcp' || (row.kind === 'product' && /mcp|zread|web.?search/i.test(row.product ?? '')))) {
                    return t.glmMcp;
                }
            }
            if (row.kind === 'heading')
                return antigravityGroupLabel(row.product, t);
            if (family === 'grok') {
                if (row.product === 'monthly')
                    return t.grokMonthly;
                if (row.product === 'on-demand')
                    return t.grokOnDemand;
            }
            if (family === 'devin') {
                if (row.product === 'prompt')
                    return t.devinPromptCredits;
                if (row.product === 'flow')
                    return t.devinFlowCredits;
                if (row.product === 'flex')
                    return t.devinFlexCredits;
                if (row.product === 'overage')
                    return t.devinOverage;
            }
            if (family === 'command-code' && row.kind === 'credits')
                return t.commandCodeCredits;
            if (family === 'codex' && row.kind === 'prepaid' && row.product === 'credits')
                return t.codexCredits;
            if (family === 'cursor' && row.product === 'included')
                return t.cursorIncluded;
            if (family === 'cursor' && row.kind === 'product') {
                if (row.product === 'auto' || row.key === 'product:auto')
                    return t.cursorComposer;
                if (row.product === 'api' || row.key === 'product:api')
                    return t.cursorApi;
            }
            // 'opencode-zen' is the Zen-side card of the same OpenCode account, so it
            // resolves the same rows (5h / 7d / Monthly and the Zen wallet kinds).
            if (family === 'opencode-go' || family === 'opencode-zen') {
                if (row.label)
                    return row.label;
                if (row.kind === 'primary')
                    return '5h';
                if (row.kind === 'weekly')
                    return '7d';
                if (row.kind === 'monthly')
                    return 'Monthly';
                // Zen (prepaid) side of the same account card: the wallet only.
                if (row.kind === 'zen-balance')
                    return t.opencodeGoZenBalance;
                if (row.kind === 'zen-credit')
                    return t.opencodeGoZenCredit;
            }
            if (row.kind === 'product' && row.product)
                return row.product;
            if (row.kind === 'primary') {
                const minutes = row.windowMinutes;
                if (typeof minutes === 'number' && minutes > 0 && (minutes < 240 || minutes > 360)) {
                    if (minutes % 60 === 0)
                        return `${minutes / 60}h`;
                    return `${minutes}m`;
                }
                return t.primary;
            }
            if (row.kind === 'weekly')
                return t.weekly;
            if (row.kind === 'monthly')
                return t.monthly;
            if (row.kind === 'cycle')
                return t.cycle;
            if (row.kind === 'prepaid')
                return family === 'cline' ? t.clineCredits : t.prepaid;
            if (row.kind === 'mcp')
                return t.glmMcp;
            return row.kind ?? t.quota;
        }
        function RemainingBar({ remainingPercent }) {
            const color = quotaFillColor(remainingPercent);
            return h('div', { className: 'osubs-bar' }, h('i', {
                style: {
                    background: color,
                    transform: `scaleX(${Math.max(0, Math.min(100, remainingPercent)) / 100})`,
                },
            }));
        }
        function QuotaMeter({ t, remainingPercent, amount, label, reset, onToggleAmount }) {
            const tone = quotaTone(remainingPercent);
            const color = tone ? `var(--osubs-${tone})` : 'inherit';
            const caption = remainingPercent === undefined ? '' : fill(t.leftPercent, remainingPercent);
            return h('div', { className: 'osubs-qmeter' }, h('div', { className: 'osubs-qrow-head' }, h('span', { style: { color: 'var(--osubs-muted)' } }, label), h('span', { style: { color, fontWeight: 500 } }, amount
                ? h('span', {
                    onClick: onToggleAmount,
                    style: onToggleAmount ? { cursor: 'pointer' } : undefined,
                    title: onToggleAmount ? t.quotaUnitToggle : undefined,
                }, `${amount} · `)
                : '', caption)), reset && h('span', { className: 'osubs-qreset' }, reset), remainingPercent !== undefined && h(RemainingBar, { remainingPercent }));
        }
        function QuotaRow({ t, row, family, exactUnits, onToggleUnits }) {
            if (row.kind === 'heading') {
                return h('div', { className: 'osubs-qgroup' }, antigravityGroupLabel(row.product, t));
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
                        : formatAmount(row.remaining);
                return h('div', { className: 'osubs-qrow-head' }, h('span', { style: { color: 'var(--osubs-muted)' } }, rowLabel(row, t, family)), h('span', { className: 'osubs-mono' }, amount));
            }
            // OpenCode Zen rows: state-only head rows (no percent bar) — the prepaid
            // wallet of the same account that carries the Go subscription.
            if (row.kind === 'zen-balance' || row.kind === 'zen-credit') {
                const amount = [
                    formatUsd(Number(row.remaining ?? 0)),
                    typeof row.total === 'number' ? ` / ${formatUsd(row.total)}` : '',
                ].join('');
                return h('div', { className: 'osubs-qrow-head' }, h('span', { style: { color: 'var(--osubs-muted)' } }, rowLabel(row, t, family)), h('span', { className: 'osubs-mono' }, amount));
            }
            const remaining = remainingPercentOf(row);
            const tokens = row.unit === 'tokens' && row.used !== undefined && row.total !== undefined;
            const usd = row.unit === 'usd';
            const amount = row.used !== undefined && row.total !== undefined
                ? tokens && !exactUnits
                    ? `${formatTokenAmount(row.used)} / ${formatTokenAmount(row.total)}`
                    : usd
                        ? `${formatUsd(row.used)} / ${formatUsd(row.total)}`
                        : `${formatAmount(row.used)} / ${formatAmount(row.total)}`
                : '';
            const reset = family === 'opencode-go' ? formatMeterReset(row.resetAt, t) : formatReset(row.resetAt, t);
            return h('div', { className: 'osubs-qrow' }, h(QuotaMeter, {
                t,
                remainingPercent: remaining,
                amount,
                label: rowLabel(row, t, family),
                reset,
                onToggleAmount: tokens ? onToggleUnits : undefined,
            }), row.status && row.status !== 'ok' && h('span', { className: 'osubs-tag osubs-tag--warn' }, row.status), Array.isArray(row.noteItems) && row.noteItems.length > 0
                ? h('div', { className: 'osubs-qnote' }, h('span', { className: 'osubs-qnote-label' }, t.quotaModels), h('div', { className: 'osubs-qnote-chips' }, row.noteItems.map((item) => h('span', {
                    className: 'osubs-tag osubs-tag--plain osubs-qnote-chip',
                    key: item.name,
                }, item.name, h('span', { className: 'osubs-qnote-count' }, `×${item.count}`)))))
                : row.note && h('span', { className: 'osubs-note' }, row.note));
        }
        function resetCreditRows(quota) {
            const bank = quota?.resetCredits;
            if (!bank)
                return [];
            if (Array.isArray(bank.credits) && bank.credits.length > 0)
                return bank.credits;
            const count = bank.availableCount ?? 0;
            if (count <= 0)
                return [];
            return Array.from({ length: count }, (_, index) => ({
                id: `available-${index + 1}`,
                expiresAt: bank.nextExpiresAt,
            }));
        }
        function IconWarning({ size = 18 }) {
            return h('svg', {
                width: size, height: size, viewBox: '0 0 14 14', fill: 'none',
                className: 'osubs-dsw-icon', 'aria-hidden': 'true',
            }, h('path', { d: 'M6.3002 3.32843H7.69986V7.79657H6.3002V3.32843Z', fill: 'currentColor' }), h('path', { d: 'M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z', fill: 'currentColor' }), h('path', { d: 'M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z', fill: 'currentColor' }));
        }
        function IconClose({ size = 14 }) {
            return h('svg', {
                width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
            }, h('path', { d: 'M14.1168 13.197L13.197 14.1167L1.8833 2.80303L2.80309 1.88324L14.1168 13.197Z', fill: 'currentColor' }), h('path', { d: 'M13.197 1.88326L14.1168 2.80305L2.80309 14.1168L1.8833 13.197L13.197 1.88326Z', fill: 'currentColor' }));
        }
        const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
        function CenterDialog({ titleId, title, subtitle, icon, closeLabel, onClose, cardClass, bodyClass, footer, children }) {
            const cardRef = useRef(null);
            useEffect(() => {
                const onKey = (event) => {
                    if (event.key === 'Escape')
                        onClose();
                };
                window.addEventListener('keydown', onKey);
                return () => window.removeEventListener('keydown', onKey);
            }, [onClose]);
            // Move focus into the dialog (first body control, else the card) and
            // hand it back to the opener on close.
            useEffect(() => {
                const opener = (typeof document !== 'undefined' ? document.activeElement : null);
                const card = cardRef.current;
                if (card && !card.contains(document.activeElement)) {
                    const first = card.querySelector('.osubs-dsw-body ' + FOCUSABLE.split(', ').join(', .osubs-dsw-body '));
                    (first || card).focus({ preventScroll: true });
                }
                return () => {
                    if (opener && typeof opener.focus === 'function' && opener.isConnected)
                        opener.focus({ preventScroll: true });
                };
            }, []);
            const trap = (event) => {
                if (event.key !== 'Tab' || !cardRef.current)
                    return;
                const nodes = Array.from(cardRef.current.querySelectorAll(FOCUSABLE));
                if (nodes.length === 0)
                    return;
                const first = nodes[0];
                const last = nodes[nodes.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
                else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            };
            return h('div', { className: 'osubs-dsw', role: 'presentation' }, h('div', { className: 'osubs-dsw-mask', 'aria-hidden': 'true', onClick: onClose }), h('div', {
                ref: cardRef,
                tabIndex: -1,
                onKeyDown: trap,
                className: cardClass || 'osubs-dsw-card',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-labelledby': titleId,
            }, h('div', { className: 'osubs-dsw-head' }, h('div', { className: 'osubs-dsw-heading' }, icon, h('div', { className: 'osubs-dsw-titles' }, h('h2', { id: titleId, className: 'osubs-dsw-title' }, title), subtitle && h('p', { className: 'osubs-dsw-sub' }, subtitle))), h('button', {
                type: 'button',
                className: 'osubs-dsw-x',
                'aria-label': closeLabel,
                onClick: onClose,
            }, h(IconClose))), h('div', { className: bodyClass || 'osubs-dsw-body' }, children), 
            // Footer sits outside the scrollable body so long forms keep the
            // actions pinned, matching WarnDialog's own markup.
            footer && h('div', { className: 'osubs-dsw-foot' }, footer)));
        }
        function IconCopy() {
            return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, h('rect', { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5, stroke: 'currentColor', strokeWidth: 1.3 }), h('path', { d: 'M10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5', stroke: 'currentColor', strokeWidth: 1.3 }));
        }
        function IconCopied() {
            return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, h('path', { d: 'M3 8.5l3.2 3L13 4.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }));
        }
        function IconPlus() {
            return h('svg', { width: 10, height: 10, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true' }, h('path', { d: 'M6 1v10M1 6h10', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }));
        }
        // Device / pairing code with one-click copy. Copy falls back silently
        // when the webview denies clipboard access; the code stays selectable.
        function PairCode({ t, code, large }) {
            const [copied, setCopied] = useState(false);
            const timer = useRef(0);
            useEffect(() => () => clearTimeout(timer.current), []);
            const copy = async () => {
                try {
                    await navigator.clipboard.writeText(String(code));
                    setCopied(true);
                    clearTimeout(timer.current);
                    timer.current = setTimeout(() => setCopied(false), 1600);
                }
                catch {
                    setCopied(false);
                }
            };
            return h('div', { className: 'osubs-pair' + (large ? ' osubs-pair--lg' : '') }, h('span', { className: 'osubs-pair-label' }, t.userCode), h('code', { className: 'osubs-pair-code' }, code), h('button', {
                type: 'button',
                className: 'osubs-pair-copy',
                onClick: copy,
                'aria-label': copied ? t.copied : `${t.copy} ${t.userCode}`,
            }, copied ? h(IconCopied) : h(IconCopy), h('span', { 'aria-live': 'polite' }, copied ? t.copied : t.copy)));
        }
        // Mid-auth view of the add-account dialog: what to do next, the pairing
        // code, the authorize link, the manual callback paste, and cancel.
        function AuthPanel({ t, id, pending, paste, onPaste, onManual, onCancel }) {
            const manual = pending?.mode === 'pkce' || pending?.mode === 'oauth';
            return h('div', { className: 'osubs-auth', 'aria-live': 'polite' }, h('div', { className: 'osubs-auth-status' }, h('span', { className: 'osubs-auth-dot', 'aria-hidden': 'true' }), h('div', { className: 'osubs-auth-copy' }, h('p', { className: 'osubs-auth-title' }, t.waitingAuth), h('p', { className: 'osubs-hint' }, pending?.userCode ? t.waitingAuthCode : t.waitingAuthHint))), pending?.userCode && h(PairCode, { t, code: pending.userCode, large: true }), pending?.authorizeUrl && h('a', {
                className: 'osubs-btn osubs-btn--primary osubs-auth-open',
                href: pending.authorizeUrl,
                target: '_blank',
                rel: 'noreferrer',
            }, t.openUrl, h('svg', { className: 'osubs-auth-ext', width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, h('path', { d: 'M6 3.5H3.5v9h9V10M9 2.5h4.5V7M13.5 2.5 7.5 8.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))), manual && h('form', {
                className: 'osubs-fields osubs-auth-paste',
                onSubmit: (event) => {
                    event.preventDefault();
                    onManual();
                },
            }, h('label', { className: 'osubs-field-label', htmlFor: `osubs-paste-${id}` }, t.paste), h('div', { className: 'osubs-inline' }, h('input', {
                id: `osubs-paste-${id}`,
                className: 'osubs-input',
                value: paste,
                onChange: (event) => onPaste(event.target.value),
                placeholder: id === 'antigravity' ? t.antigravityPastePlaceholder : t.pastePlaceholder,
                autoComplete: 'off',
                spellCheck: false,
            }), h(Button, { type: 'submit', disabled: !paste.trim(), label: t.submitPaste })), h('p', { className: 'osubs-hint' }, t.pasteHint)), h('div', { className: 'osubs-auth-foot' }, h(Button, { onClick: onCancel, label: t.cancel })));
        }
        // The one destructive-confirm dialog: an alertdialog with the action's
        // consequence, an explicit acknowledgement checkbox, and the confirm that
        // only unlocks once it is ticked. Callers name their own action (reset
        // cards, account 退出); the reset-card copy stays the default.
        function WarnDialog({ t, title, description, acknowledgeLabel, confirmLabel, closeLabel, idPrefix = 'osubs-warn', acknowledged, onAcknowledgedChange, onCancel, onConfirm }) {
            useEffect(() => {
                const onKey = (event) => {
                    if (event.key === 'Escape')
                        onCancel();
                };
                window.addEventListener('keydown', onKey);
                return () => window.removeEventListener('keydown', onKey);
            }, [onCancel]);
            const heading = title || t.quotaResetWarnTitle;
            const ack = acknowledgeLabel || t.quotaResetAck;
            const ok = confirmLabel || t.quotaResetConfirmOk;
            const close = closeLabel || t.quotaResetClose;
            if (typeof HostRisk === 'function') {
                return h(HostRisk, {
                    open: true,
                    title: heading,
                    description,
                    acknowledgeLabel: ack,
                    cancelLabel: t.cancel,
                    closeLabel: close,
                    confirmLabel: ok,
                    acknowledged,
                    onAcknowledgedChange,
                    onCancel,
                    onConfirm,
                });
            }
            return h('div', { className: 'osubs-dsw', role: 'presentation' }, h('div', { className: 'osubs-dsw-mask', 'aria-hidden': 'true', onClick: onCancel }), h('div', {
                className: 'osubs-dsw-card',
                role: 'alertdialog',
                'aria-modal': 'true',
                'aria-labelledby': `${idPrefix}-title`,
                'aria-describedby': `${idPrefix}-body`,
            }, h('div', { className: 'osubs-dsw-head' }, h('h2', { id: `${idPrefix}-title`, className: 'osubs-dsw-title' }, heading), h('button', {
                type: 'button',
                className: 'osubs-dsw-x',
                'aria-label': close,
                onClick: onCancel,
            }, h(IconClose))), h('div', { className: 'osubs-dsw-body' }, h('div', { className: 'osubs-dsw-warning' }, h(IconWarning), h('p', { id: `${idPrefix}-body` }, description)), h('label', { className: 'osubs-dsw-ack' }, h('input', {
                type: 'checkbox',
                checked: acknowledged,
                autoFocus: true,
                onChange: (event) => onAcknowledgedChange(event.currentTarget.checked),
            }), h('span', null, ack))), h('div', { className: 'osubs-dsw-foot' }, h('button', { type: 'button', className: 'osubs-dsw-btn osubs-dsw-btn--outline', onClick: onCancel }, t.cancel), h('button', {
                type: 'button',
                className: 'osubs-dsw-btn osubs-dsw-btn--primary',
                disabled: !acknowledged,
                onClick: onConfirm,
            }, ok))));
        }
        function expiryOf(credit) {
            return typeof credit?.expiresAt === 'number' && Number.isFinite(credit.expiresAt) && credit.expiresAt > 0
                ? credit.expiresAt
                : Infinity;
        }
        /**
         * Reset windows per family. GLM banks one card type per window (each clears
         * only its own); a Codex credit or a Grok card refreshes the weekly window.
         * Every group spends its earliest-expiring card. A card whose expiry has
         * passed drops out at `now` instead of waiting for the next quota read,
         * so the count (and the spend ghost) moves the moment it lapses.
         */
        function resetGroups(quota, family, now = Date.now()) {
            const credits = resetCreditRows(quota).filter((credit) => expiryOf(credit) > now);
            const defs = family === 'glm'
                ? [{ key: 'FIVE_HOUR', window: 'resetWinFive' }, { key: 'WEEK', window: 'resetWinWeek' }]
                : [{ key: 'all', window: 'resetWinWeek' }];
            return defs.map((def) => ({
                ...def,
                cards: credits
                    .filter((credit) => family !== 'glm' || credit.resetType === def.key)
                    .sort((a, b) => expiryOf(a) - expiryOf(b)),
            }));
        }
        /**
         * The count sits on a small card with up to two lips peeking behind it.
         * When the count drops, a ghost of the old top card flies off the stack
         * and the new number rolls in beneath it.
         */
        let resetTipSeq = 0;
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
        const RESET_URGENT_MS = 24 * 60 * 60_000;
        const RESET_BLINK_MS = 60 * 60_000;
        const RESET_CD_MS = 10 * 60_000;
        /** Blink period: ~1600ms at 60min → ~400ms at zero, quadratic ease. */
        function resetBlinkInt(leftMs) {
            if (leftMs >= RESET_BLINK_MS)
                return null;
            const f = 1 - Math.max(0, leftMs) / RESET_BLINK_MS;
            return Math.round(1600 - 1200 * f * f);
        }
        function formatCountdown(leftMs) {
            const total = Math.max(0, Math.ceil(leftMs / 1000));
            const m = Math.floor(total / 60);
            const s = total % 60;
            return `${m}:${String(s).padStart(2, '0')}`;
        }
        function ResetStack({ t, count, cards = [], busy, ghost, onGhostDone }) {
            const [tipOpen, setTipOpen] = useState(false);
            const [tipId] = useState(() => `osubs-rtip-${++resetTipSeq}`);
            const [tickNow, setTickNow] = useState(0);
            const hasTip = count > 0 && cards.length > 0;
            useEffect(() => {
                if (!tipOpen)
                    return;
                const onKey = (event) => { if (event.key === 'Escape')
                    setTipOpen(false); };
                window.addEventListener('keydown', onKey);
                return () => window.removeEventListener('keydown', onKey);
            }, [tipOpen]);
            useEffect(() => { if (!hasTip)
                setTipOpen(false); }, [hasTip]);
            const urgentAt = count > 0 ? expiryOf(cards[0]) : Infinity;
            // Tick 1s inside the countdown window, 5s inside the blink window —
            // where the urgency flags can only flip near boundaries this also
            // re-derives them on time.
            const leftMs0 = urgentAt - Date.now();
            const tickRate = count > 0 && leftMs0 <= RESET_CD_MS + 10_000
                ? 1000
                : leftMs0 <= RESET_BLINK_MS + 60_000 ? 5000 : 0;
            useEffect(() => {
                if (!tickRate)
                    return;
                let live = true;
                let timer;
                const step = () => {
                    if (!live)
                        return;
                    setTickNow(Date.now());
                    timer = setTimeout(step, tickRate);
                };
                timer = setTimeout(step, tickRate);
                return () => { live = false; clearTimeout(timer); };
            }, [tickRate]);
            const leftMs = urgentAt - (tickNow || Date.now());
            const urgent = urgentAt < Infinity && leftMs < RESET_URGENT_MS;
            const blinkMs = urgent ? resetBlinkInt(leftMs) : null;
            const cd = urgent && leftMs <= RESET_CD_MS && leftMs > 0 ? Math.ceil(leftMs / 1000) : 0;
            const behind = Math.max(0, count - 1);
            const classes = ['osubs-rstack'];
            if (count === 0)
                classes.push('osubs-rstack--empty');
            if (busy)
                classes.push('osubs-rstack--busy');
            if (urgent)
                classes.push('osubs-rstack--urgent');
            if (blinkMs)
                classes.push('osubs-rstack--blink');
            const open = () => { if (hasTip)
                setTipOpen(true); };
            const shut = () => setTipOpen(false);
            return h('div', {
                className: classes.join(' '),
                'data-depth': count,
                style: {
                    '--rcard-behind': behind,
                    ...(blinkMs ? { '--osubs-blink-int': `${blinkMs}ms` } : {}),
                },
                tabIndex: hasTip ? 0 : undefined,
                'aria-label': hasTip ? fill(t.resetTipLabel, count) : undefined,
                'aria-describedby': hasTip && tipOpen ? tipId : undefined,
                onMouseEnter: open,
                onMouseLeave: shut,
                onFocus: open,
                onBlur: shut,
            }, Array.from({ length: behind }, (_, index) => {
                const step = behind - index;
                return h('span', {
                    key: `back-${step}`,
                    className: 'osubs-rcard-back',
                    'aria-hidden': 'true',
                    style: { left: `calc(var(--rcard-step) * ${step})`, zIndex: 1 },
                });
            }), h('span', { className: 'osubs-rcard', 'aria-hidden': 'true' }, h('span', {
                // cd: remount each second so the tick animation replays as a beat.
                key: cd ? `cd-${cd}` : `n-${count}`,
                className: [
                    'osubs-rcard-n',
                    cd ? 'osubs-rcard-n--cd osubs-rcard-n--tick' : '',
                    ghost ? 'osubs-rcard-n--in' : '',
                ].filter(Boolean).join(' '),
            }, cd || count), h('span', { className: cd ? 'osubs-rcard-u osubs-rcard-u--cd' : 'osubs-rcard-u' }, cd ? t.resetUnitCd : t.resetUnit)), ghost && h('span', {
                key: `ghost-${ghost.token}`,
                className: 'osubs-rcard osubs-rcard--ghost',
                'aria-hidden': 'true',
                onAnimationEnd: onGhostDone,
            }, h('span', { className: 'osubs-rcard-n' }, ghost.count), h('span', { className: 'osubs-rcard-u' }, t.resetUnit)), hasTip && tipOpen && h('span', { id: tipId, role: 'tooltip', className: 'osubs-rtip' }, cards.map((card, index) => {
                const stamp = formatStamp(card.expiresAt);
                return h('span', { className: 'osubs-rtip-line', key: card.id ?? index }, h('span', { className: 'osubs-rtip-i' }, index + 1), h('span', null, stamp ? fill(t.resetExpires, stamp) : t.resetNoExpiry));
            })));
        }
        function ResetBank({ t, quota, family, onReset }) {
            const [busyKey, setBusyKey] = useState(null);
            const [pending, setPending] = useState(null);
            const [acked, setAcked] = useState(false);
            const [ghosts, setGhosts] = useState({});
            const [now, setNow] = useState(0);
            const seen = useRef(null);
            const groups = resetGroups(quota, family, now || Date.now());
            // One shared clock for the urgency ladder. 1s while any group is
            // counting down or could cross the 10-minute edge, else 15s while
            // any group is inside the 24h red window (so the edge lands on
            // time), otherwise idle.
            const minLeftMs = groups.reduce((acc, group) => (group.cards.length ? Math.min(acc, expiryOf(group.cards[0])) : acc), Infinity);
            const leftNow = minLeftMs - Date.now();
            const bankTick = leftNow < Infinity
                ? (leftNow <= RESET_CD_MS + 10_000 ? 1000 : leftNow <= RESET_URGENT_MS + 60_000 ? 15_000 : 0)
                : 0;
            useEffect(() => {
                if (!bankTick)
                    return;
                let live = true;
                let timer;
                const step = () => {
                    if (!live)
                        return;
                    setNow(Date.now());
                    timer = setTimeout(step, bankTick);
                };
                timer = setTimeout(step, bankTick);
                return () => { live = false; clearTimeout(timer); };
            }, [bankTick]);
            const counts = groups.map((group) => `${group.key}:${group.cards.length}`).join('|');
            useEffect(() => {
                const next = Object.fromEntries(groups.map((group) => [group.key, group.cards.length]));
                const before = seen.current;
                seen.current = next;
                if (!before)
                    return;
                const spent = {};
                for (const group of groups) {
                    const was = before[group.key];
                    if (typeof was === 'number' && group.cards.length < was) {
                        spent[group.key] = { count: was, token: Date.now() };
                    }
                }
                if (Object.keys(spent).length === 0)
                    return;
                setGhosts((current) => ({ ...current, ...spent }));
                // animationend is the normal exit; this covers a hidden or detached row.
                const timer = setTimeout(() => {
                    setGhosts((current) => {
                        const rest = { ...current };
                        for (const key of Object.keys(spent)) {
                            if (rest[key]?.token === spent[key].token)
                                delete rest[key];
                        }
                        return rest;
                    });
                }, 1200);
                return () => clearTimeout(timer);
            }, [counts]);
            if (typeof onReset !== 'function')
                return null;
            const close = () => {
                setPending(null);
                setAcked(false);
            };
            const confirm = async () => {
                if (!pending || busyKey || !acked)
                    return;
                const { group, credit } = pending;
                close();
                setBusyKey(group.key);
                try {
                    await onReset(credit);
                }
                finally {
                    setBusyKey(null);
                }
            };
            const dropGhost = (key) => setGhosts((current) => {
                if (!current[key])
                    return current;
                const rest = { ...current };
                delete rest[key];
                return rest;
            });
            const whenOf = (credit) => formatStamp(credit?.expiresAt) || formatReset(credit?.expiresAt, t, 'expires') || '—';
            return h('fieldset', { className: 'osubs-qbox' }, h('legend', { className: 'osubs-qbox-title' }, t.resetBank), groups.map((group) => {
                const count = group.cards.length;
                const next = group.cards[0];
                const stamp = next ? formatStamp(next.expiresAt) : '';
                const groupLeftMs = next ? expiryOf(next) - (now || Date.now()) : Infinity;
                const groupUrgent = groupLeftMs < RESET_URGENT_MS;
                const groupCd = groupUrgent && groupLeftMs <= RESET_CD_MS && groupLeftMs > 0;
                const sub = count === 0
                    ? t.resetNone
                    : groupCd ? fill(t.resetCd, formatCountdown(groupLeftMs))
                        : stamp ? fill(count === 1 ? t.resetExpires : t.resetNext, stamp) : '';
                const ghost = ghosts[group.key];
                const busy = busyKey === group.key;
                return h('div', {
                    className: `osubs-reset-row${ghost ? ' osubs-reset-row--spent' : ''}`,
                    key: group.key,
                }, h(ResetStack, { t, count, cards: group.cards, busy, ghost, onGhostDone: () => dropGhost(group.key) }), h('div', { className: 'osubs-reset-meta', 'aria-live': 'polite' }, h('span', { className: 'osubs-reset-when' }, t[group.window]), h('span', {
                    className: `osubs-reset-rel${groupUrgent ? ' osubs-reset-rel--bad' : ''}`,
                }, h('span', { className: 'osubs-sr' }, fill(t.resetLeft, count)), sub)), h(Button, {
                    size: 'sm',
                    disabled: busyKey !== null || count === 0,
                    onClick: () => {
                        if (busyKey || !next)
                            return;
                        setAcked(false);
                        setPending({ group, credit: next });
                    },
                    label: busy ? t.quotaResetBusy : t.quotaReset,
                }));
            }), pending && h(WarnDialog, {
                t,
                description: fill(t.resetConfirm, { window: t[pending.group.window], when: whenOf(pending.credit) }),
                acknowledged: acked,
                onAcknowledgedChange: setAcked,
                onCancel: close,
                onConfirm: confirm,
            }));
        }
        function renderQuotaRows(rows, t, family, units) {
            const nodes = [];
            let cluster;
            const flush = () => {
                if (!cluster)
                    return;
                nodes.push(h('div', { className: 'osubs-qcluster', key: cluster.key }, h('div', { className: 'osubs-qgroup' }, antigravityGroupLabel(cluster.title, t)), cluster.rows.map((row) => h(QuotaRow, { t, row, family, ...units, key: row.key }))));
                cluster = undefined;
            };
            for (const row of rows) {
                if (row.kind === 'heading') {
                    flush();
                    cluster = { key: row.key, title: row.product, rows: [] };
                    continue;
                }
                if (cluster && (row.kind === 'weekly' || row.kind === 'primary')) {
                    cluster.rows.push(row);
                    continue;
                }
                flush();
                nodes.push(h(QuotaRow, { t, row, family, ...units, key: row.key }));
            }
            flush();
            return nodes;
        }
        function QuotaBlock({ t, quota, onReset, family }) {
            const [exactUnits, setExactUnits] = useState(readExactAmountUnits);
            if (!quota || quota.status === 'idle')
                return null;
            const rows = Array.isArray(quota.rows) ? quota.rows : [];
            const hasUsage = rows.some((row) => (typeof row.usedPercent === 'number'
                || typeof row.remainingPercent === 'number'
                || (row.kind === 'prepaid' && typeof row.remaining === 'number' && row.remaining > 0)
                || (row.used !== undefined && row.total !== undefined)
                // Zen states count as content even at $0: a zero prepaid balance is the
                // state that blocks Zen calls, not an empty card.
                || (row.kind === 'zen-balance' && typeof row.remaining === 'number')
                || (row.kind === 'zen-credit' && typeof row.remaining === 'number')));
            const hasTokens = rows.some((row) => row.unit === 'tokens' && row.used !== undefined && row.total !== undefined);
            const units = hasTokens
                ? {
                    exactUnits,
                    onToggleUnits: () => setExactUnits((current) => {
                        const next = !current;
                        writeExactAmountUnits(next);
                        return next;
                    }),
                }
                : undefined;
            return h('div', { className: 'osubs-quota' }, quota.status === 'loading' && rows.length === 0 && h('p', { className: 'osubs-hint' }, t.quotaLoading), 
            // A failed read is always said out loud, rows or not: the rows in an
            // error entry are the previous reading, so suppressing the line left a
            // frozen card looking like a successful refresh (Cline, 2026-10-11).
            quota.status === 'error' && h('p', {
                className: 'osubs-hint osubs-bad',
                title: quota.error || undefined,
            }, `${t.quotaFailed}${quota.error ? ` · ${formatQuotaError(quota.error)}` : ''}`), 
            // The Go card explains its empty meters with the subscription state —
            // "周额度未返回" would read as a fetch hiccup, not a lapsed/never-
            // subscribed workspace.
            family === 'opencode-go' && quota.status === 'ready' && !hasUsage
                && (quota.subscription?.state === 'ended' || quota.subscription?.state === 'none')
                && h('p', { className: 'osubs-hint' }, `${quota.subscription.state === 'ended' ? t.opencodeGoSubscriptionEnded : t.opencodeGoNoSubscription} `, h('a', { className: 'osubs-link', href: 'https://opencode.ai/console', target: '_blank', rel: 'noreferrer' }, t.opencodeGoConsoleLink)), quota.status === 'ready' && !hasUsage && !(family === 'opencode-go' && quota.subscription?.state) && family !== 'chatgpt' && h('p', { className: 'osubs-hint' }, t.quotaUnknown), family === 'chatgpt' && quota.status !== 'error' && h('p', { className: 'osubs-hint' }, `${t.chatgptPlanHint} `, h('a', { className: 'osubs-link', href: 'https://chatgpt.com/settings/usage', target: '_blank', rel: 'noreferrer' }, t.chatgptManageUsage)), renderQuotaRows(rows, t, family, units), h(ResetBank, { t, quota, family, onReset }));
        }
        // 切换 / switch: two arrows trading places — the account this row would
        // promote — drawn in the same 12px stroke as its two head-mates.
        function IconSwitch() {
            return h('svg', {
                width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('path', { d: 'M3 7h14' }), h('path', { d: 'M14.5 4.5L17 7l-2.5 2.5' }), h('path', { d: 'M21 17H7' }), h('path', { d: 'M9.5 14.5L7 17l2.5 2.5' }));
        }
        // Active account: a circled check glued to the identity, not a text chip.
        function IconAccountCheck() {
            return h('svg', {
                width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
                stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('circle', { cx: 8, cy: 8, r: 6.2 }), h('path', { d: 'M5.1 8.15l1.85 1.85L10.9 5.9' }));
        }
        // 退出 / logout: the door the arrow leaves through, drawn in the same
        // 12px stroke style as IconRefresh so the icon-only actions in the
        // account head read as one set.
        function IconLogout() {
            return h('svg', {
                width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }), h('path', { d: 'M16 17l5-5-5-5' }), h('path', { d: 'M21 12H9' }));
        }
        function AccountCard({ t, id, row, quota, onSwitch, onLogout, onRefreshQuota, onResetQuota }) {
            const regionLabel = (region) => region === 'bigmodel' ? t.glmRegionCn : t.glmRegionGlobal;
            const planLabel = planOf({ ...row, quota }, id);
            const [refreshBusy, setRefreshBusy] = useState(false);
            const refreshing = refreshBusy || quota?.status === 'loading';
            const clickable = !row.active;
            return h('article', {
                className: `osubs-acct${row.active ? ' osubs-acct--on' : ''}`,
                role: clickable ? 'button' : undefined,
                tabIndex: clickable ? 0 : undefined,
                onClick: clickable ? () => onSwitch(id, row.id) : undefined,
                onKeyDown: clickable ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSwitch(id, row.id);
                    }
                } : undefined,
                style: clickable ? undefined : { cursor: 'default' },
            }, h('div', { className: 'osubs-acct-head' }, h('div', { className: 'osubs-acct-main' }, h('div', { className: 'osubs-acct-row' }, h('span', { className: 'osubs-acct-id' }, h('span', { className: 'osubs-mono', 'data-shot-mask': '' }, identityOf(row, id)), row.active && h('span', {
                className: 'osubs-acct-mark',
                role: 'img',
                title: t.inUse,
                'aria-label': t.inUse,
            }, h(IconAccountCheck))), planLabel && h('span', { className: 'osubs-tag' }, planLabel), id === 'glm' && row.region && h('span', { className: 'osubs-tag' }, regionLabel(row.region)), id === 'kiro' && row.methodLabel && h('span', { className: 'osubs-tag' }, row.methodLabel), (id === 'cursor' || id === 'ollama' || id === 'kimi' || id === 'devin' || id === 'cline' || id === 'command-code') && row.methodLabel && h('span', { className: 'osubs-tag' }, row.methodLabel), id === 'opencode-go' && row.workspaceName && h('span', { className: 'osubs-tag osubs-tag--plain' }, row.workspaceName), id === 'grok' && quota?.hasGrokCodeAccess === true && h('span', { className: 'osubs-tag osubs-tag--plain', title: t.grokCodeHint }, t.grokCode), id === 'grok' && quota?.subscriptionStatus && quota.subscriptionStatus !== 'active' && h('span', { className: 'osubs-tag osubs-tag--warn' }, quota.subscriptionStatus))), h('div', { className: 'osubs-actions', 'data-noshot': '', onClick: (event) => event.stopPropagation() }, !row.active && h(Button, {
                size: 'sm',
                icon: true,
                onClick: () => onSwitch(id, row.id),
                title: t.switchTo,
                ariaLabel: t.switchTo,
                label: h(IconSwitch),
            }), h(Button, {
                size: 'sm',
                icon: true,
                disabled: refreshing,
                title: t.quotaRefresh,
                ariaLabel: t.quotaRefresh,
                onClick: async () => {
                    if (refreshBusy)
                        return;
                    setRefreshBusy(true);
                    try {
                        await Promise.all([
                            onRefreshQuota(id, row.id),
                            new Promise((resolve) => setTimeout(resolve, 400)),
                        ]);
                    }
                    finally {
                        setRefreshBusy(false);
                    }
                },
                label: h('span', { className: 'osubs-refresh' + (refreshing ? ' osubs-refresh--spin' : '') }, h(IconRefresh)),
            }), h(Button, {
                size: 'sm',
                icon: true,
                onClick: () => onLogout(id, row.id),
                title: t.logout,
                ariaLabel: t.logout,
                label: h(IconLogout),
            }))), h('div', { onClick: (event) => event.stopPropagation() }, id === 'antigravity' && row.needsValidation && h('div', { className: 'osubs-verify' }, h('p', { className: 'osubs-hint osubs-warn' }, t.antigravityVerify), row.validationUrl && h(Button, {
                size: 'sm',
                onClick: () => { window.open(row.validationUrl, '_blank', 'noopener'); },
                label: t.antigravityVerifyGo,
            })), h(QuotaBlock, {
                t,
                family: id,
                quota,
                onReset: (id === 'codex' || id === 'glm' || id === 'grok') && onResetQuota
                    ? (credit) => onResetQuota(id, row.id, credit?.id)
                    : undefined,
            }), id === 'opencode-go' && quota?.useBalance && Number(quota.balance) > 0
                && h('p', { className: 'osubs-hint' }, fill(t.opencodeGoBalance, `$${Number(quota.balance).toFixed(2)}`))));
        }
        /**
         * OpenCode Zen's own card: the prepaid side of the same OpenCode account
         * that carries the Go subscription (one key, one vault), so it holds no
         * credential UI — just the wallet rows and a refresh that re-reads the
         * shared account quota. Go's subscription meters never mix in here.
         */
        function ZenQuotaCard({ t, account, onRefresh }) {
            const roster = Array.isArray(account?.accounts) ? account.accounts : [];
            const row = roster.find((entry) => entry?.active) ?? roster[0];
            const quota = row?.quota ?? { status: 'loading' };
            const [busy, setBusy] = useState(false);
            const refreshing = busy || quota.status === 'loading';
            return h('article', { className: 'osubs-acct osubs-acct--on' }, h('div', { className: 'osubs-acct-head' }, h('div', { className: 'osubs-acct-main' }, h('div', { className: 'osubs-acct-row' }, h('span', { className: 'osubs-acct-id' }, h('span', { className: 'osubs-mono', 'data-shot-mask': '' }, identityOf(row, 'opencode-go'))), h('span', { className: 'osubs-tag osubs-tag--plain' }, 'OpenCode Zen'), row?.workspaceName && h('span', { className: 'osubs-tag osubs-tag--plain' }, row.workspaceName))), h('div', { className: 'osubs-actions', 'data-noshot': '', onClick: (event) => event.stopPropagation() }, h(Button, {
                size: 'sm',
                icon: true,
                disabled: refreshing,
                title: t.quotaRefresh,
                ariaLabel: t.quotaRefresh,
                onClick: async () => {
                    if (busy)
                        return;
                    setBusy(true);
                    try {
                        await Promise.all([
                            onRefresh(row?.id),
                            new Promise((resolve) => setTimeout(resolve, 400)),
                        ]);
                    }
                    finally {
                        setBusy(false);
                    }
                },
                label: h('span', { className: 'osubs-refresh' + (refreshing ? ' osubs-refresh--spin' : '') }, h(IconRefresh)),
            }))), h('div', {}, h(QuotaBlock, { t, family: 'opencode-zen', quota })));
        }
        function ProviderCard({ t, id, title, account, pending, onLogin, onImport, onLogout, onCancel, onManual, onSwitch, onRefreshQuota, onResetQuota, onUseKey, onGoSave }) {
            const [addOpen, setAddOpen] = useState(false);
            const [paste, setPaste] = useState('');
            const [apiKey, setApiKey] = useState('');
            const [keyRegion, setKeyRegion] = useState('zai');
            // One inline method form at a time; toggling another closes the first.
            const [method, setMethod] = useState('');
            const showKey = method === 'key';
            const showIdc = method === 'idc';
            const showEntra = method === 'entra';
            const showRefresh = method === 'refresh';
            const toggleMethod = (next) => setMethod((current) => current === next ? '' : next);
            // Guards double-clicks between the click and the host flipping busy.
            const [starting, setStarting] = useState('');
            const [startUrl, setStartUrl] = useState('');
            const [entraEndpoint, setEntraEndpoint] = useState('');
            const [entraClient, setEntraClient] = useState('');
            const [entraScopes, setEntraScopes] = useState('');
            const [refreshToken, setRefreshToken] = useState('');
            const [goCookie, setGoCookie] = useState('');
            const [goWorkspace, setGoWorkspace] = useState('');
            const [goBusy, setGoBusy] = useState(false);
            const [goMessage, setGoMessage] = useState('');
            const roster = Array.isArray(account?.accounts) ? account.accounts : [];
            const loggedIn = Boolean(account?.loggedIn) || roster.length > 0;
            const busy = Boolean(account?.busy);
            const closeAdd = () => {
                setGoMessage('');
                setMethod('');
                setAddOpen(false);
            };
            // 退出 drops the stored credential on the host, so the row button only
            // stages it: WarnDialog names the account, and the RPC runs on 确认退出.
            const [logoutFor, setLogoutFor] = useState(null);
            const [logoutAcked, setLogoutAcked] = useState(false);
            const closeLogout = () => {
                setLogoutAcked(false);
                setLogoutFor(null);
            };
            const requestLogout = (family, accountId, row) => {
                setLogoutAcked(false);
                setLogoutFor({ accountId, label: identityOf(row, family) || title });
            };
            const confirmLogout = async () => {
                if (!logoutFor || !logoutAcked)
                    return;
                const target = logoutFor;
                closeLogout();
                await onLogout(id, target.accountId);
            };
            // Starts a login/import once; the pressed row spins until the host
            // answers, the others stay disabled so a double-click can't fork flows.
            const begin = async (key, action, close = false) => {
                if (starting)
                    return;
                setStarting(key);
                try {
                    await action();
                }
                finally {
                    setStarting('');
                }
                if (close)
                    closeAdd();
            };
            const startAttrs = (key) => ({
                disabled: Boolean(starting),
                'aria-busy': starting === key ? 'true' : undefined,
            });
            useEffect(() => {
                if (busy)
                    setAddOpen(true);
            }, [busy]);
            // One dashed tail row is the add/login entry: last line of the
            // account list, or the card's only row when logged out. Hidden
            // while busy — the continue/cancel row takes over mid-auth.
            const addRow = !busy && h('button', {
                type: 'button',
                className: 'osubs-acct-add',
                'data-noshot': '',
                onClick: () => setAddOpen(true),
            }, h(IconPlus), t.addAccount);
            // A family with no account is only an add row: left out of 分享 images.
            return h('section', { className: 'osubs-card osubs-card--legend', 'data-noshot': roster.length === 0 ? '' : undefined }, h('h3', { className: 'osubs-card-title' }, title), roster.length > 0 && h('div', { className: 'osubs-accts' }, roster.map((row) => h(AccountCard, {
                t,
                id,
                row,
                quota: row.quota,
                onSwitch,
                onLogout: (family, accountId) => requestLogout(family, accountId, row),
                onRefreshQuota,
                onResetQuota,
                key: row.id,
            })), addRow), roster.length === 0 && addRow, account?.detail && h('p', { className: 'osubs-hint osubs-bad' }, `${t.error}: ${account.detail}`), pending?.userCode && busy && h(PairCode, { t, code: pending.userCode }), pending?.authorizeUrl && busy && h('a', {
                className: 'osubs-link',
                href: pending.authorizeUrl,
                target: '_blank',
                rel: 'noreferrer',
            }, t.openUrl), busy && h('div', { className: 'osubs-actions' }, h(Button, {
                variant: 'primary',
                onClick: () => setAddOpen(true),
                label: t.continueAuth,
            }), h(Button, { onClick: () => onCancel(id), label: t.cancel })), addOpen && h(CenterDialog, {
                titleId: `osubs-add-${id}`,
                title: t.addAccountTitle,
                closeLabel: t.dialogClose,
                onClose: closeAdd,
                cardClass: 'osubs-dsw-card osubs-dsw-card--add',
                bodyClass: 'osubs-dsw-body osubs-dsw-body--stack',
                icon: FAMILY_ICON[id] && h('span', { className: 'osubs-dsw-mark', style: FAMILY_COLOR[id] ? { color: FAMILY_COLOR[id] } : undefined }, h(TabIcon, { name: FAMILY_ICON[id], className: 'osubs-dsw-mark-icon' })),
                subtitle: title,
            }, busy && h(AuthPanel, {
                t,
                id,
                pending,
                paste,
                onPaste: setPaste,
                onManual: () => { if (paste.trim())
                    onManual(id, paste.trim()); },
                onCancel: () => { onCancel(id); closeAdd(); },
            }), !busy && account?.detail && h('p', { className: 'osubs-dsw-error', role: 'alert' }, `${t.error}: ${account.detail}`), id !== 'glm' && id !== 'kiro' && id !== 'ollama' && id !== 'opencode-go' && !busy && h('div', { className: 'osubs-logins' }, h('button', {
                type: 'button',
                className: 'osubs-login',
                ...startAttrs('primary'), onClick: () => begin('primary', () => onLogin(id)),
            }, h('span', null, id === 'chatgpt' ? t.chatgptLogin : id === 'grok' || id === 'kimi' || id === 'cline' ? t.device : loggedIn ? t.addAccount : t.login)), id === 'grok' && h('button', {
                type: 'button',
                className: 'osubs-login',
                ...startAttrs('pkce'), onClick: () => begin('pkce', () => onLogin(id, 'pkce')),
            }, h('span', null, t.pkce)), id === 'kimi' && h('button', {
                type: 'button',
                className: 'osubs-login',
                'aria-expanded': showKey, onClick: () => toggleMethod('key'),
            }, h('span', null, t.kimiLoginApiKey)), id === 'kimi' && showKey && !busy && h('form', {
                className: 'osubs-fields',
                onSubmit: (event) => {
                    event.preventDefault();
                    onUseKey(id, apiKey);
                    setApiKey('');
                    setMethod('');
                    closeAdd();
                },
            }, h('input', {
                className: 'osubs-input',
                value: apiKey,
                onChange: (event) => setApiKey(event.target.value),
                placeholder: t.kimiKeyPlaceholder,
                type: 'password',
                autoFocus: true,
                spellCheck: false,
                'aria-label': t.kimiLoginApiKey,
                autoComplete: 'off',
            }), h('p', { className: 'osubs-hint' }, t.kimiKeyHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.kimiKeyGo }))), id === 'devin' && h('button', {
                type: 'button',
                className: 'osubs-login',
                'aria-expanded': showKey, onClick: () => toggleMethod('key'),
            }, h('span', null, t.devinLoginApiKey)), id === 'devin' && showKey && !busy && h('form', {
                className: 'osubs-fields',
                onSubmit: (event) => {
                    event.preventDefault();
                    onUseKey(id, apiKey);
                    setApiKey('');
                    setMethod('');
                    closeAdd();
                },
            }, h('input', {
                className: 'osubs-input',
                value: apiKey,
                onChange: (event) => setApiKey(event.target.value),
                placeholder: t.devinKeyPlaceholder,
                type: 'password',
                autoFocus: true,
                spellCheck: false,
                'aria-label': t.devinLoginApiKey,
                autoComplete: 'off',
            }), h('p', { className: 'osubs-hint' }, t.devinKeyHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.devinKeyGo }))), id === 'command-code' && h('button', {
                type: 'button',
                className: 'osubs-login',
                'aria-expanded': showKey, onClick: () => toggleMethod('key'),
            }, h('span', null, t.commandCodeLoginApiKey)), id === 'command-code' && showKey && !busy && h('form', {
                className: 'osubs-fields',
                onSubmit: (event) => {
                    event.preventDefault();
                    onUseKey(id, apiKey);
                    setApiKey('');
                    setMethod('');
                    closeAdd();
                },
            }, h('input', {
                className: 'osubs-input',
                value: apiKey,
                onChange: (event) => setApiKey(event.target.value),
                placeholder: t.commandCodeKeyPlaceholder,
                type: 'password',
                autoFocus: true,
                spellCheck: false,
                'aria-label': t.commandCodeLoginApiKey,
                autoComplete: 'off',
            }), h('p', { className: 'osubs-hint' }, t.commandCodeKeyHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.commandCodeKeyGo }))), id !== 'chatgpt' && h('button', {
                type: 'button',
                className: 'osubs-login osubs-login-ghost',
                ...startAttrs('import'), onClick: () => begin('import', () => onImport(id), true),
            }, h('span', null, id === 'cursor' ? t.cursorImport : id === 'kimi' ? t.kimiImport : id === 'devin' ? t.devinImport : id === 'cline' ? t.clineImport : id === 'command-code' ? t.commandCodeImport : t.import))), id === 'ollama' && !busy && h('div', { className: 'osubs-logins' }, h('button', {
                type: 'button',
                className: 'osubs-login',
                'aria-expanded': showKey, onClick: () => toggleMethod('key'),
            }, h('span', null, t.ollamaLoginApiKey)), id === 'ollama' && showKey && !busy && h('form', {
                className: 'osubs-fields',
                onSubmit: (event) => {
                    event.preventDefault();
                    onUseKey(id, apiKey);
                    setApiKey('');
                    setMethod('');
                    closeAdd();
                },
            }, h('input', {
                className: 'osubs-input',
                value: apiKey,
                onChange: (event) => setApiKey(event.target.value),
                placeholder: t.ollamaKeyPlaceholder,
                type: 'password',
                autoFocus: true,
                spellCheck: false,
                'aria-label': t.ollamaLoginApiKey,
                autoComplete: 'off',
            }), h('p', { className: 'osubs-hint' }, t.ollamaKeyHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.ollamaKeyGo }))), h('button', {
                type: 'button',
                className: 'osubs-login osubs-login-ghost',
                ...startAttrs('import'), onClick: () => begin('import', () => onImport(id), true),
            }, h('span', null, t.ollamaImport))), id === 'opencode-go' && !busy && h('p', { className: 'osubs-hint' }, t.opencodeGoHint), id === 'opencode-go' && !busy && h('form', {
                className: 'osubs-fields',
                onSubmit: async (event) => {
                    event.preventDefault();
                    if (goBusy)
                        return;
                    setGoBusy(true);
                    setGoMessage('');
                    try {
                        await onGoSave({
                            apiKey: apiKey.trim() ? apiKey : undefined,
                            cookie: goCookie.trim() ? goCookie : undefined,
                            workspace: goWorkspace.trim() ? goWorkspace : undefined,
                        });
                        setApiKey('');
                        setGoCookie('');
                        setGoWorkspace('');
                        closeAdd();
                    }
                    catch (error) {
                        const text = error instanceof Error ? error.message : String(error);
                        setGoMessage(isUnknownOauthMethod(text) ? t.opencodeGoHostStale : t.opencodeGoFailed + ': ' + text);
                    }
                    finally {
                        setGoBusy(false);
                    }
                },
            }, h('span', { className: 'osubs-eyebrow' }, t.opencodeGoKey), h('input', {
                className: 'osubs-input',
                type: 'password',
                autoComplete: 'off',
                spellCheck: false,
                placeholder: roster.some((row) => row.apiKeySet) ? t.opencodeGoKeySet : t.opencodeGoKeyPlaceholder,
                value: apiKey,
                onChange: (event) => setApiKey(event.target.value),
            }), h('span', { className: 'osubs-eyebrow' }, t.opencodeGoCookie), h('input', {
                className: 'osubs-input',
                type: 'password',
                autoComplete: 'off',
                spellCheck: false,
                placeholder: roster.some((row) => row.cookieSet) ? t.opencodeGoCookieSet : t.opencodeGoCookiePlaceholder,
                value: goCookie,
                onChange: (event) => setGoCookie(event.target.value),
            }), h('span', { className: 'osubs-eyebrow' }, t.opencodeGoWorkspace), h('input', {
                className: 'osubs-input',
                autoComplete: 'off',
                spellCheck: false,
                placeholder: t.opencodeGoWorkspacePlaceholder,
                value: goWorkspace,
                onChange: (event) => setGoWorkspace(event.target.value),
            }), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: goBusy, label: t.opencodeGoSave }))), id === 'opencode-go' && goMessage && h('p', { className: 'osubs-hint osubs-bad' }, goMessage), id === 'glm' && !busy && h('div', { className: 'osubs-glm-logins' }, h('button', {
                type: 'button',
                className: 'osubs-glm-login',
                ...startAttrs('zai'), onClick: () => begin('zai', () => onLogin(id, 'zai')),
            }, h('span', null, loggedIn ? t.glmAddZai : t.glmLoginZai), h('span', { className: 'osubs-tag' }, t.glmRegionGlobal)), h('button', {
                type: 'button',
                className: 'osubs-glm-login',
                ...startAttrs('bigmodel'), onClick: () => begin('bigmodel', () => onLogin(id, 'bigmodel')),
            }, h('span', null, loggedIn ? t.glmAddBigmodel : t.glmLoginBigmodel), h('span', { className: 'osubs-tag' }, t.glmRegionCn)), h('button', {
                type: 'button',
                className: 'osubs-glm-login osubs-glm-ghost',
                'aria-expanded': showKey, onClick: () => toggleMethod('key'),
            }, h('span', null, t.glmLoginApiKey)), id === 'glm' && showKey && !busy && h('form', {
                onSubmit: (event) => {
                    event.preventDefault();
                    onUseKey(id, apiKey, keyRegion);
                    setApiKey('');
                    setMethod('');
                    closeAdd();
                },
                style: { display: 'flex', flexDirection: 'column', gap: 8 },
            }, h('div', { className: 'osubs-actions' }, h(Button, {
                size: 'sm',
                variant: keyRegion === 'zai' ? 'primary' : undefined,
                onClick: () => setKeyRegion('zai'),
                label: t.glmRegionGlobal,
            }), h(Button, {
                size: 'sm',
                variant: keyRegion === 'bigmodel' ? 'primary' : undefined,
                onClick: () => setKeyRegion('bigmodel'),
                label: t.glmRegionCn,
            })), h('input', {
                className: 'osubs-input',
                value: apiKey,
                onChange: (event) => setApiKey(event.target.value),
                placeholder: t.glmKeyPlaceholder,
                type: 'password',
                autoFocus: true,
                spellCheck: false,
                'aria-label': t.glmKeyLabel,
                autoComplete: 'off',
            }), h('p', { className: 'osubs-hint' }, t.glmKeyHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.glmKeyGo }))), h('button', {
                type: 'button',
                className: 'osubs-glm-login osubs-glm-ghost',
                ...startAttrs('import'), onClick: () => begin('import', () => onImport(id), true),
            }, h('span', null, t.import))), id === 'kiro' && !busy && h('div', { className: 'osubs-logins' }, h('button', {
                type: 'button',
                className: 'osubs-login',
                ...startAttrs('social'), onClick: () => begin('social', () => onLogin(id, 'social')),
            }, h('span', null, loggedIn ? t.kiroAddSocial : t.kiroLoginSocial), h('span', { className: 'osubs-tag' }, 'Social')), h('button', {
                type: 'button',
                className: 'osubs-login',
                ...startAttrs('builder'), onClick: () => begin('builder', () => onLogin(id, 'builder')),
            }, h('span', null, loggedIn ? t.kiroAddBuilder : t.kiroLoginBuilder), h('span', { className: 'osubs-tag' }, 'Builder')), h('button', {
                type: 'button',
                className: 'osubs-login',
                'aria-expanded': showIdc, onClick: () => toggleMethod('idc'),
            }, h('span', null, loggedIn ? t.kiroAddIdc : t.kiroLoginIdc), h('span', { className: 'osubs-tag' }, 'IdC')), id === 'kiro' && showIdc && !busy && h('form', {
                className: 'osubs-fields',
                onSubmit: (event) => {
                    event.preventDefault();
                    begin('idc', () => onLogin(id, 'idc', { startUrl: startUrl.trim() }));
                },
            }, h('input', {
                className: 'osubs-input',
                value: startUrl,
                onChange: (event) => setStartUrl(event.target.value),
                placeholder: t.kiroStartUrlPlaceholder,
                autoFocus: true,
                spellCheck: false,
                'aria-label': t.kiroStartUrl,
                autoComplete: 'off',
            }), h('p', { className: 'osubs-hint' }, t.kiroStartUrlHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !startUrl.trim() || starting === 'idc', label: t.kiroStartUrlGo }))), h('button', {
                type: 'button',
                className: 'osubs-login osubs-login-ghost',
                'aria-expanded': showEntra, onClick: () => toggleMethod('entra'),
            }, h('span', null, t.kiroLoginEntra)), id === 'kiro' && showEntra && !busy && h('form', {
                className: 'osubs-fields',
                onSubmit: (event) => {
                    event.preventDefault();
                    onUseKey(id, refreshToken, {
                        mode: 'external_idp',
                        tokenEndpoint: entraEndpoint,
                        clientId: entraClient,
                        scopes: entraScopes,
                    });
                    setRefreshToken('');
                    setMethod('');
                    closeAdd();
                },
            }, h('input', {
                className: 'osubs-input',
                value: entraEndpoint,
                onChange: (event) => setEntraEndpoint(event.target.value),
                placeholder: t.kiroEntraEndpointPlaceholder,
                autoFocus: true,
                spellCheck: false,
                'aria-label': t.kiroEntraEndpoint,
                autoComplete: 'off',
            }), h('input', {
                className: 'osubs-input',
                value: entraClient,
                onChange: (event) => setEntraClient(event.target.value),
                placeholder: t.kiroEntraClient,
                'aria-label': t.kiroEntraClient,
                autoComplete: 'off',
            }), h('textarea', {
                className: 'osubs-textarea',
                value: refreshToken,
                onChange: (event) => setRefreshToken(event.target.value),
                placeholder: t.kiroEntraRefresh,
                'aria-label': t.kiroEntraRefresh,
            }), h('input', {
                className: 'osubs-input',
                value: entraScopes,
                onChange: (event) => setEntraScopes(event.target.value),
                placeholder: t.kiroEntraScopes,
                'aria-label': t.kiroEntraScopes,
                autoComplete: 'off',
            }), h('p', { className: 'osubs-hint' }, t.kiroEntraHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !(refreshToken.trim() && entraEndpoint.trim() && entraClient.trim()), label: t.kiroEntraGo }))), h('button', {
                type: 'button',
                className: 'osubs-login osubs-login-ghost',
                'aria-expanded': showKey, onClick: () => toggleMethod('key'),
            }, h('span', null, t.kiroLoginApiKey)), id === 'kiro' && showKey && !busy && h('form', {
                className: 'osubs-fields',
                onSubmit: (event) => {
                    event.preventDefault();
                    onUseKey(id, apiKey, { mode: 'api_key' });
                    setApiKey('');
                    setMethod('');
                    closeAdd();
                },
            }, h('input', {
                className: 'osubs-input',
                value: apiKey,
                onChange: (event) => setApiKey(event.target.value),
                placeholder: t.kiroKeyPlaceholder,
                type: 'password',
                autoFocus: true,
                spellCheck: false,
                'aria-label': t.kiroLoginApiKey,
                autoComplete: 'off',
            }), h('p', { className: 'osubs-hint' }, t.kiroKeyHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.kiroKeyGo }))), h('button', {
                type: 'button',
                className: 'osubs-login osubs-login-ghost',
                'aria-expanded': showRefresh, onClick: () => toggleMethod('refresh'),
            }, h('span', null, t.kiroLoginRefresh)), id === 'kiro' && showRefresh && !busy && h('form', {
                className: 'osubs-fields',
                onSubmit: (event) => {
                    event.preventDefault();
                    onUseKey(id, refreshToken, { mode: 'social' });
                    setRefreshToken('');
                    setMethod('');
                    closeAdd();
                },
            }, h('textarea', {
                className: 'osubs-textarea',
                value: refreshToken,
                onChange: (event) => setRefreshToken(event.target.value),
                placeholder: t.kiroRefreshPlaceholder,
                autoFocus: true,
                spellCheck: false,
                'aria-label': t.kiroLoginRefresh,
            }), h('p', { className: 'osubs-hint' }, t.kiroRefreshHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !refreshToken.trim(), label: t.kiroRefreshGo }))), h('button', {
                type: 'button',
                className: 'osubs-login osubs-login-ghost',
                ...startAttrs('import'), onClick: () => begin('import', () => onImport(id), true),
            }, h('span', null, t.import)))), logoutFor && h(WarnDialog, {
                t,
                idPrefix: 'osubs-logout',
                title: t.logoutConfirmTitle,
                description: fill(t.logoutConfirmBody, { n: logoutFor.label }),
                acknowledgeLabel: t.logoutConfirmAck,
                confirmLabel: t.logoutConfirmOk,
                closeLabel: t.dialogClose,
                acknowledged: logoutAcked,
                onAcknowledgedChange: setLogoutAcked,
                onCancel: closeLogout,
                onConfirm: confirmLogout,
            }));
        }
        /** 4096 → '4K', 1000000 → '1M', 1048576 → '1M' — same shape as the
            catalog's formatWindow (src/utils/context-mode.ts). */
        function formatTokens(tokens) {
            if (tokens % 1_000_000 === 0)
                return `${tokens / 1_000_000}M`;
            if (tokens % 1000 !== 0) {
                if (tokens % 1_048_576 === 0)
                    return `${tokens / 1_048_576}M`;
                if (tokens % 1024 === 0)
                    return `${tokens / 1024}K`;
            }
            return `${Math.round(tokens / 1000)}K`;
        }
        /** `400000` / `400k` / `1.5m` → integer tokens; anything else is invalid. */
        function parseContextInput(text) {
            const match = /^(\d+(?:\.\d+)?)([kKmM])?$/.exec(String(text ?? '').trim());
            if (!match)
                return undefined;
            const scale = match[2] === undefined ? 1 : match[2].toLowerCase() === 'm' ? 1_000_000 : 1_000;
            const tokens = Math.round(Number(match[1]) * scale);
            return Number.isSafeInteger(tokens) ? tokens : undefined;
        }
        const CONTEXT_WINDOW_MIN = 4096;
        const CONTEXT_WINDOW_ABS_MAX = 2_097_152;
        /** upstream formatUsd: full precision when the value needs it, else $0.60. */
        function priceUsd(value) {
            const rounded = Number(value).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
            const dot = rounded.indexOf('.');
            return `$${(dot === -1 ? 0 : rounded.length - dot - 1) >= 2 ? rounded : Number(value).toFixed(2)}`;
        }
        /** Gold-coin mark: ring + a centered $, sized like the eye icon. */
        function IconCoin() {
            return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' }, h('circle', { cx: 8, cy: 8, r: 6, stroke: 'currentColor', strokeWidth: 1.4 }), h('path', { d: 'M8 4.3v7.4', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' }), h('path', { d: 'M10.1 5.9c-.4-.7-1.2-1.1-2.1-1.1-1.2 0-2.1.7-2.1 1.6 0 2.2 4.2 1.1 4.2 3.1 0 1-.9 1.8-2.1 1.8-.9 0-1.7-.4-2.1-1', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' }));
        }
        /** One tooltip line; a price the source does not list (absent cache read) is omitted, never shown as $0. */
        function PriceLine({ label, value }) {
            if (typeof value !== 'number' || !Number.isFinite(value))
                return null;
            return h('span', { className: 'osubs-ptip-line' }, h('span', { className: 'osubs-ptip-l' }, label), h('span', { className: 'osubs-ptip-v' }, priceUsd(value)));
        }
        /**
         * Money tag on a Models-tab row: hover/focus lists the model's
         * USD-per-1M-token rates (src/catalog/rates.json). Peak bands render under
         * the standard rows with the shared time-of-day schedule as a footnote;
         * tier rows ("over N context") come after the base triple.
         */
        function PriceTag({ t, pricing, tod }) {
            const [open, setOpen] = useState(false);
            const [tipId] = useState(() => `osubs-ptip-${++resetTipSeq}`);
            useEffect(() => {
                if (!open)
                    return;
                const onKey = (event) => { if (event.key === 'Escape')
                    setOpen(false); };
                window.addEventListener('keydown', onKey);
                return () => window.removeEventListener('keydown', onKey);
            }, [open]);
            if (!pricing)
                return null;
            const hasPeak = Boolean(pricing.tod?.peak);
            const todNote = hasPeak && tod ? fill(t.priceTodNote, {
                date: tod.effectiveFrom,
                win: (tod.peakWindowsUtc ?? []).map((w) => `${String(w[0]).padStart(2, '0')}:00–${String(w[1]).padStart(2, '0')}:00`).join(', '),
            }) : null;
            return h('span', {
                className: 'osubs-ptag',
                tabIndex: 0,
                'aria-label': t.priceTag,
                'aria-describedby': open ? tipId : undefined,
                onMouseEnter: () => setOpen(true),
                onMouseLeave: () => setOpen(false),
                onFocus: () => setOpen(true),
                onBlur: () => setOpen(false),
            }, h(IconCoin), open && h('span', { id: tipId, role: 'tooltip', className: 'osubs-rtip' }, hasPeak ? h(PriceLine, { label: t.priceIn, value: pricing.tod.offPeak.in }) : h(PriceLine, { label: t.priceIn, value: pricing.in }), hasPeak ? h(PriceLine, { label: t.priceOut, value: pricing.tod.offPeak.out }) : h(PriceLine, { label: t.priceOut, value: pricing.out }), hasPeak ? h(PriceLine, { label: t.priceCache, value: pricing.tod.offPeak.cacheRead }) : h(PriceLine, { label: t.priceCache, value: pricing.cacheRead }), pricing.cacheWrite != null && h(PriceLine, { label: t.priceWrite, value: pricing.cacheWrite }), pricing.cacheWrite1h != null && pricing.cacheWrite1h !== pricing.cacheWrite && h(PriceLine, { label: t.priceWrite1h, value: pricing.cacheWrite1h }), hasPeak && h('span', { className: 'osubs-ptip-sep' }), hasPeak && h(PriceLine, { label: `${t.pricePeak} · ${t.priceIn}`, value: pricing.tod.peak.in }), hasPeak && h(PriceLine, { label: `${t.pricePeak} · ${t.priceOut}`, value: pricing.tod.peak.out }), hasPeak && h(PriceLine, { label: `${t.pricePeak} · ${t.priceCache}`, value: pricing.tod.peak.cacheRead }), Array.isArray(pricing.tiers) && pricing.tiers.length > 0 && h('span', { className: 'osubs-ptip-sep' }), Array.isArray(pricing.tiers) && pricing.tiers.map((tier, i) => h('span', { key: i }, h('span', { className: 'osubs-ptip-note' }, fill(t.priceTier, formatTokens(pricing.tierThreshold))), h(PriceLine, { label: t.priceIn, value: tier.in }), h(PriceLine, { label: t.priceOut, value: tier.out }), h(PriceLine, { label: t.priceCache, value: tier.cacheRead }))), todNote && h('span', { className: 'osubs-ptip-note' }, todNote)));
        }
        function ModelRow({ t, model, family, tod, onToggle, onContext, locked, overrides }) {
            const enabled = Boolean(overrides?.[model.key] ?? model.enabled) && !locked;
            return h('div', { className: 'osubs-mrow' }, h('div', { className: 'osubs-mname' }, h('span', null, model.name), Array.isArray(model.input) && model.input.includes('image')
                && h('span', { className: 'osubs-vision', title: t.visionTag }, h(IconEye)), 
            // The window tag is a button: every model row's entry into the
            // custom input-context editor (route contextWindow + compaction).
            model.window && h('button', {
                type: 'button',
                className: `osubs-tag osubs-tag--ctx${model.custom ? ' osubs-tag--custom' : ''}`,
                title: model.custom ? fill(t.ctxCustomTitle, model.window) : t.ctxTagTitle,
                'aria-label': `${model.name} ${t.ctxTagTitle}`,
                onClick: () => onContext?.({ ...model, family }),
            }, model.window), model.rate && h('span', { className: 'osubs-tag osubs-tag--plain', title: t.rateTag }, `×${model.rate}`), h(PriceTag, { t, pricing: model.pricing, tod })), h(Switch, {
                checked: enabled,
                disabled: Boolean(locked),
                label: model.name,
                onChange: (on) => onToggle(model.key, on),
            }));
        }
        function ModelsPanel({ t, catalog, scope, railIdOf, query, onQuery, onToggle, onFamily, onAll, onOpenFamily, onContext, onResetContexts, overrides, efforts, onEffort }) {
            const all = Array.isArray(catalog) ? catalog : [];
            // 默认档位 edits the families in scope: 全部 sets (and unifies) every family.
            const effortFamilies = all.filter((group) => scope === 'all' || railIdOf(group.family) === scope).map((group) => group.family);
            const effortValues = [...new Set(effortFamilies.map((family) => efforts?.[family] ?? ''))];
            const effort = effortValues.length > 1 ? 'mixed' : (effortValues[0] ?? '');
            const q = String(query ?? '').trim().toLowerCase();
            const groups = all
                .filter((group) => scope === 'all' || railIdOf(group.family) === scope)
                .map((group) => ({
                ...group,
                models: (Array.isArray(group.models) ? group.models : [])
                    .filter((model) => !q || `${model.name} ${model.id}`.toLowerCase().includes(q)),
            }))
                .filter((group) => !q || group.models.length > 0);
            const total = groups.reduce((n, group) => n + group.models.length, 0);
            const enabled = groups.reduce((n, group) => (n + (group.loggedIn ? group.models.filter((model) => model.enabled).length : 0)), 0);
            const hasCustom = groups.some((group) => group.models.some((model) => model.custom));
            const scopeAll = scope === 'all';
            const single = groups.length === 1 ? groups[0] : undefined;
            const rows = [];
            for (const group of groups) {
                if (!single) {
                    const groupOn = group.loggedIn ? group.models.filter((model) => model.enabled).length : 0;
                    rows.push(h('div', { className: 'osubs-mgroup', key: `g:${group.provider}` }, h('span', null, group.displayName), h('span', { className: 'osubs-mgroup-side' }, group.loggedIn && h('span', { className: 'osubs-note' }, fill(t.modelsEnabled, `${groupOn} / ${group.models.length}`)), 
                    // 登录默认: signed in here, every row deliberately off until picked.
                    group.loggedIn && group.awaitingPick && h('span', { className: 'osubs-note' }, t.modelsLoginOff), group.loggedIn && h('div', { className: 'osubs-seg' }, h(Button, { size: 'sm', onClick: () => onFamily(group.family, true), label: t.modelsAll }), h(Button, { size: 'sm', onClick: () => onFamily(group.family, false), label: t.modelsNone })), !group.loggedIn && h('span', { className: 'osubs-note' }, t.modelsNeedLogin), !group.loggedIn && h(Button, { size: 'sm', onClick: () => onOpenFamily?.(group.family), label: t.login }))));
                }
                for (const model of group.models) {
                    rows.push(h(ModelRow, {
                        t, model, family: railIdOf(group.family), tod: group.pricingTimeOfDay, onToggle, onContext,
                        locked: !group.loggedIn, overrides, key: model.key,
                    }));
                }
            }
            return h('section', { className: 'osubs-card' }, h('div', { className: 'osubs-mtools' }, h('div', { className: 'osubs-msearch' }, h(IconSearch), h('input', {
                value: query,
                placeholder: t.modelsSearch,
                'aria-label': t.modelsSearch,
                autoComplete: 'off',
                onChange: (event) => onQuery(event.target.value),
            })), h('label', { className: 'osubs-meffort', title: t.modelsEffortHint }, h('span', null, t.modelsEffort), h('select', { value: effort, onChange: (event) => onEffort?.(event.target.value || null, effortFamilies, scope === 'all') }, effort === 'mixed' && h('option', { value: 'mixed', disabled: true }, t.modelsEffortMixed), h('option', { value: '' }, t.modelsEffortNone), 
            // Same names as DSH's own picker (it capitalizes the level id).
            ['off', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) => h('option', { key: level, value: level }, level[0].toUpperCase() + level.slice(1))))), h('span', { className: 'osubs-mcount' }, fill(t.modelsEnabled, `${enabled} / ${total}`)), scopeAll && h('div', { className: 'osubs-seg' }, h(Button, { size: 'sm', onClick: () => onAll(true), label: t.modelsAll }), h(Button, { size: 'sm', onClick: () => onAll(false), label: t.modelsNone })), hasCustom && h(Button, { size: 'sm', onClick: onResetContexts, label: t.ctxResetAll }), single && (single.loggedIn
                ? h(Fragment || 'span', null, single.awaitingPick && h('span', { className: 'osubs-note' }, t.modelsLoginOff), h('div', { className: 'osubs-seg' }, h(Button, { size: 'sm', onClick: () => onFamily(single.family, true), label: t.modelsAll }), h(Button, { size: 'sm', onClick: () => onFamily(single.family, false), label: t.modelsNone })))
                : h(Fragment || 'span', null, h('span', { className: 'osubs-note' }, t.modelsNeedLogin), h(Button, { size: 'sm', variant: 'primary', onClick: () => onOpenFamily?.(single.family), label: t.login })))), h('p', { className: 'osubs-note' }, t.modelsHint), h('div', { className: 'osubs-mtable' }, h('div', { className: 'osubs-mhead' }, h('span', null, t.modelsColumnName), h('span', null, t.modelsColumnOn)), rows.length === 0 && h('p', { className: 'osubs-hint osubs-mempty' }, all.length === 0 ? t.loading : t.modelsEmpty), ...rows));
        }
        /** Edit one model row's input-context window; `null` resets to catalog.
            Edits cap at the row's own maximum (`contextMax`: the vendor's large
            window when advertised, else the catalog window). Typing the catalog
            default folds into the same reset so `contexts` only holds real
            deviations (and the row's `--custom` tint never lies). */
        function ContextEditDialog({ t, model, onClose, onSubmit }) {
            const [value, setValue] = useState('');
            const [busy, setBusy] = useState(false);
            const trackRef = useRef(null);
            const parsed = parseContextInput(value);
            const max = Number(model.contextMax);
            const ceiling = Number.isFinite(max) && max > 0 ? max : CONTEXT_WINDOW_ABS_MAX;
            const current = Number(model.contextValue);
            const catalogDefault = Number(model.contextDefault);
            const editing = value.trim() !== '';
            const inRange = parsed !== undefined && parsed >= CONTEXT_WINDOW_MIN && parsed <= ceiling;
            const bad = editing && !inRange;
            const unchanged = inRange && Number.isFinite(current) && parsed === current;
            // The scale always has a position: the parsed draft when it parses,
            // else the window the row currently runs at.
            const shown = parsed !== undefined ? parsed : (Number.isFinite(current) ? current : 0);
            const shownRatio = Math.max(0, Math.min(1, shown / ceiling));
            const defaultRatio = Number.isFinite(catalogDefault) && catalogDefault < ceiling
                ? Math.min(98, Math.max(2, (catalogDefault / ceiling) * 100))
                : undefined;
            // The track doubles as the slider: drag (or arrow keys) writes the
            // k/m shorthand back into the draft at a 1K step, and each preset
            // node is a button that fills the draft directly. The catalog
            // default already sits on the track as the tick, so it never gets a
            // node; nodes within ~2% of an end would crowd the end labels.
            // Binary labels are lossy ('1M' parses back as 1000000), so the
            // draft falls back to exact digits when the label would not round-trip.
            const draft = (tokens) => {
                const label = formatTokens(tokens);
                setValue(parseContextInput(label) === tokens ? label : String(tokens));
            };
            const endLabel = model.windowMax ?? formatTokens(ceiling);
            const presets = [128_000, 256_000, 512_000, 1_000_000]
                .filter((tokens) => tokens >= CONTEXT_WINDOW_MIN && tokens < ceiling && tokens !== catalogDefault
                && formatTokens(tokens) !== endLabel);
            const slideTo = (clientX) => {
                const box = trackRef.current?.getBoundingClientRect();
                if (!box || box.width <= 0)
                    return;
                const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
                draft(Math.max(CONTEXT_WINDOW_MIN, Math.min(ceiling, Math.round(ratio * ceiling / 1000) * 1000)));
            };
            const slide = {
                onPointerDown: (event) => {
                    if (busy || (event.button != null && event.button !== 0))
                        return;
                    trackRef.current?.setPointerCapture?.(event.pointerId);
                    slideTo(event.clientX);
                },
                onPointerMove: (event) => {
                    if (event.buttons & 1)
                        slideTo(event.clientX);
                },
                onKeyDown: (event) => {
                    if (busy)
                        return;
                    const base = Math.max(CONTEXT_WINDOW_MIN, Math.min(ceiling, shown));
                    let next;
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
                        next = base - 1000;
                    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
                        next = base + 1000;
                    else if (event.key === 'PageDown')
                        next = base - 64_000;
                    else if (event.key === 'PageUp')
                        next = base + 64_000;
                    else if (event.key === 'Home')
                        next = CONTEXT_WINDOW_MIN;
                    else if (event.key === 'End')
                        next = ceiling;
                    else
                        return;
                    event.preventDefault();
                    draft(Math.max(CONTEXT_WINDOW_MIN, Math.min(ceiling, Math.round(next / 1000) * 1000)));
                },
            };
            const submit = async (context) => {
                if (busy)
                    return;
                setBusy(true);
                const ok = await onSubmit(context);
                setBusy(false);
                if (ok !== false)
                    onClose();
            };
            const mark = model.family && FAMILY_ICON[model.family];
            return h(CenterDialog, {
                titleId: 'osubs-ctx',
                title: t.ctxDialogTitle,
                subtitle: model.name,
                icon: mark && h('span', {
                    className: 'osubs-dsw-mark',
                    style: FAMILY_COLOR[model.family] ? { color: FAMILY_COLOR[model.family] } : undefined,
                }, h(TabIcon, { name: mark, className: 'osubs-dsw-mark-icon' })),
                closeLabel: t.dialogClose,
                onClose: busy ? () => undefined : onClose,
                cardClass: 'osubs-dsw-card osubs-dsw-card--add',
                bodyClass: 'osubs-dsw-body osubs-dsw-body--stack',
                footer: [
                    // Outline button at the footer's left edge, icon + label so it
                    // reads as an action, not chrome. It stages the catalog default
                    // into the draft (exact digits, so applying folds into the same
                    // reset) — enabled whenever the draft isn't already the default,
                    // and for a customized row even before anything is typed.
                    h('button', {
                        key: 'reset', type: 'button',
                        className: 'osubs-dsw-btn osubs-dsw-btn--outline osubs-ctx-reset',
                        title: `${t.ctxReset}（${model.windowDefault}）`,
                        disabled: busy || !Number.isFinite(catalogDefault) ||
                            (editing ? parsed === catalogDefault : !model.custom),
                        onClick: () => setValue(String(catalogDefault)),
                    }, h(IconRefresh), t.ctxReset),
                    h('button', {
                        key: 'save', type: 'submit', form: 'osubs-ctx-form',
                        className: 'osubs-dsw-btn osubs-dsw-btn--primary',
                        disabled: busy || !inRange || unchanged,
                    }, busy ? t.ctxSaving : t.ctxSave),
                ],
            }, h('div', { className: 'osubs-ctx-stats' }, model.custom && h('div', { className: 'osubs-ctx-stat osubs-ctx-stat--now' }, h('span', { className: 'osubs-ctx-stat-label' }, t.ctxStatNow), h('span', { className: 'osubs-ctx-stat-value' }, model.window)), h('div', { className: 'osubs-ctx-stat' }, h('span', { className: 'osubs-ctx-stat-label' }, t.ctxStatDefault), h('span', { className: 'osubs-ctx-stat-value' }, model.windowDefault)), h('div', { className: 'osubs-ctx-stat' }, h('span', { className: 'osubs-ctx-stat-label' }, t.ctxStatMax), h('span', { className: 'osubs-ctx-stat-value' }, model.windowMax))), h('form', {
                id: 'osubs-ctx-form',
                className: 'osubs-fields',
                onSubmit: (event) => {
                    event.preventDefault();
                    if (inRange && !unchanged) {
                        void submit(Number.isFinite(catalogDefault) && parsed === catalogDefault ? null : parsed);
                    }
                },
            }, h('input', {
                className: `osubs-input osubs-input--num${bad ? ' osubs-input--bad' : ''}`,
                value,
                onChange: (event) => setValue(event.target.value),
                placeholder: '400k',
                autoFocus: true,
                spellCheck: false,
                autoComplete: 'off',
                inputMode: 'decimal',
                'aria-label': t.ctxDialogTitle,
                'aria-invalid': bad || undefined,
                'aria-describedby': 'osubs-ctx-feedback',
            }), h('p', { className: 'osubs-note' }, t.ctxSyntax)), h('div', { className: 'osubs-ctx-scale' }, h('div', {
                id: 'osubs-ctx-feedback',
                className: `osubs-ctx-readout${bad ? ' osubs-bad' : ''}`,
                'aria-live': 'polite',
            }, h('span', { className: 'osubs-ctx-tokens' }, editing && parsed === undefined
                ? t.ctxInvalid
                : bad
                    ? fill(t.ctxOutOfRange, `${CONTEXT_WINDOW_MIN.toLocaleString('en-US')}–${ceiling.toLocaleString('en-US')}`)
                    : fill(t.ctxPreview, shown.toLocaleString('en-US'))), h('span', { className: 'osubs-ctx-pct' }, `${Math.round((shown / ceiling) * 100)}%`)), 
            // A slider's children are presentational to AT, so the preset
            // buttons sit beside the track in the wrapper, not inside it.
            h('div', { className: 'osubs-ctx-slider' }, h('div', {
                ref: trackRef,
                className: 'osubs-ctx-track',
                role: 'slider',
                tabIndex: busy ? -1 : 0,
                'aria-valuemin': CONTEXT_WINDOW_MIN,
                'aria-valuemax': ceiling,
                'aria-valuenow': Math.max(CONTEXT_WINDOW_MIN, Math.min(ceiling, shown)),
                'aria-valuetext': fill(t.ctxPreview, Math.max(CONTEXT_WINDOW_MIN, Math.min(ceiling, shown)).toLocaleString('en-US')),
                'aria-label': t.ctxDialogTitle,
                'aria-disabled': busy || undefined,
                ...slide,
            }, h('i', {
                className: 'osubs-ctx-fill',
                style: {
                    transform: `scaleX(${shownRatio})`,
                    background: bad
                        ? 'var(--osubs-bad)'
                        : editing ? 'var(--osubs-accent)' : undefined,
                },
            }), defaultRatio !== undefined && h('b', {
                className: 'osubs-ctx-tick',
                style: { left: `${defaultRatio}%` },
                title: `${t.ctxStatDefault} ${model.windowDefault}`,
            }), h('i', {
                className: 'osubs-ctx-thumb',
                style: { left: `${shownRatio * 100}%` },
            })), presets.map((tokens) => h('button', {
                key: tokens,
                type: 'button',
                className: 'osubs-ctx-node',
                style: { left: `${(tokens / ceiling) * 100}%` },
                disabled: busy,
                'aria-label': formatTokens(tokens),
                onPointerDown: (event) => event.stopPropagation(),
                onClick: () => draft(tokens),
            }))), h('div', { className: 'osubs-ctx-ends' }, h('span', null, formatTokens(CONTEXT_WINDOW_MIN)), presets.map((tokens) => h('button', {
                key: tokens,
                type: 'button',
                className: 'osubs-ctx-key',
                style: { left: `${(tokens / ceiling) * 100}%` },
                disabled: busy,
                onClick: () => draft(tokens),
            }, formatTokens(tokens))), h('span', null, endLabel))));
        }
        function aboutLink(href, text, extra) {
            const label = text || '—';
            if (!href || label === '—')
                return h('span', extra ? { className: extra } : null, label);
            return h('a', {
                className: extra ? `osubs-link ${extra}` : 'osubs-link',
                href, target: '_blank', rel: 'noreferrer',
            }, label);
        }
        function IconCheck() {
            return h('svg', {
                width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('path', { d: 'M20 6 9 17l-5-5' }));
        }
        function IconRefresh() {
            return h('svg', {
                width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('path', { d: 'M21 12a9 9 0 1 1-3-6.7' }), h('path', { d: 'M21 3v6h-6' }));
        }
        function IconEye() {
            return h('svg', {
                width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('path', { d: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z' }), h('circle', { cx: 12, cy: 12, r: 2.8 }));
        }
        function statusLabel(t, update) {
            if (!update)
                return '';
            if (update.status === 'update')
                return fill(t.updateReady, update.latest?.tag || update.latest?.name || '');
            if (update.status === 'current')
                return t.updateCurrent;
            if (update.status === 'ahead')
                return t.updateAhead;
            if (update.status === 'unknown')
                return t.updateUnknown;
            if (update.status === 'error')
                return `${t.updateError}${update.error ? ` · ${update.error}` : ''}`;
            return '';
        }
        /** Apply self-installs; the label reports the outcome or the manual path. */
        function applyLabel(t, update) {
            const apply = update?.apply;
            if (!apply || apply.status === 'none')
                return '';
            if (apply.status === 'installed') {
                return fill(apply.restart === 'app' ? t.updateInstalledApp : t.updateInstalledHost, apply.version || update.latest?.tag || update.latest?.name || '');
            }
            if (apply.status === 'manual')
                return apply.command ? fill(t.updateManual, apply.command) : '';
            if (apply.status === 'failed') {
                const hint = apply.command ? ` · ${fill(t.updateManual, apply.command)}` : '';
                return `${t.updateFailed}${apply.error ? ` · ${apply.error}` : ''}${hint}`;
            }
            return '';
        }
        function parseAboutVersion(tag) {
            const match = String(tag ?? '').trim().match(/(?:v|dsh-v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
            if (!match)
                return;
            const prerelease = match[4] || '';
            const raw = prerelease ? `${match[1]}.${match[2]}.${match[3]}-${prerelease}` : `${match[1]}.${match[2]}.${match[3]}`;
            return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease, raw };
        }
        function compareAboutVersions(left, right) {
            const a = parseAboutVersion(left);
            const b = parseAboutVersion(right);
            if (!a || !b)
                return 0;
            if (a.major !== b.major)
                return a.major - b.major;
            if (a.minor !== b.minor)
                return a.minor - b.minor;
            if (a.patch !== b.patch)
                return a.patch - b.patch;
            if (!a.prerelease && b.prerelease)
                return 1;
            if (a.prerelease && !b.prerelease)
                return -1;
            if (!a.prerelease && !b.prerelease)
                return 0;
            return a.prerelease.localeCompare(b.prerelease);
        }
        const ABOUT_REPO = 'https://github.com/xxww0098/dsh-plugin-oauth-subs';
        const aboutRepoOf = (local, update) => local?.repo || update?.repo || ABOUT_REPO;
        /** The version About shows: a linked tree's derived `-dev` build, else the fresher of host and check. */
        function aboutVersionOf(local, update) {
            const linked = Boolean(update?.linkedPath || local?.linkedPath) || update?.linked === true || local?.linked === true;
            const devVersion = update?.devVersion || local?.devVersion;
            return (linked && devVersion) || fresherAboutVersion(update?.version, local?.version) || '—';
        }
        function fresherAboutVersion(left, right) {
            const a = parseAboutVersion(left);
            const b = parseAboutVersion(right);
            if (a && b)
                return compareAboutVersions(a.raw, b.raw) >= 0 ? a.raw : b.raw;
            if (a)
                return a.raw;
            if (b)
                return b.raw;
            return left || right || '';
        }
        function IconLink() {
            return h('svg', {
                width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }), h('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }));
        }
        function IconArrowUp() {
            return h('svg', {
                width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('path', { d: 'M12 19V5' }), h('path', { d: 'm5 12 7-7 7 7' }));
        }
        function IconInfo() {
            return h('svg', {
                width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('circle', { cx: 12, cy: 12, r: 9 }), h('path', { d: 'M12 16v-4' }), h('path', { d: 'M12 8h.01' }));
        }
        /** Whole row toggles the switch; note carries the 15-minute cadence + last run. */
        function AutoUpdateRow({ t, note, checked, onChange }) {
            return h('label', { className: 'osubs-kv-row osubs-auto-row', title: t.autoUpdate }, h('input', {
                type: 'checkbox',
                checked,
                'aria-label': t.autoUpdate,
                onChange,
            }), h('span', { className: 'osubs-auto-main' }, h('span', { className: 'osubs-auto-name' }, t.autoUpdateShort), note && h('span', { className: 'osubs-auto-note' }, note)), h('span', { className: 'osubs-auto-track', 'aria-hidden': 'true' }));
        }
        /** HH:mm today, YYYY-MM-DD HH:mm otherwise — for the auto-update last-run note. */
        function formatClock(iso) {
            const date = new Date(iso);
            if (Number.isNaN(date.getTime()))
                return String(iso || '');
            const pad = (n) => String(n).padStart(2, '0');
            const hm = pad(date.getHours()) + ':' + pad(date.getMinutes());
            if (date.toDateString() === new Date().toDateString())
                return hm;
            return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + hm;
        }
        function autoRunText(t, entry) {
            if (!entry)
                return '';
            if (entry.status === 'installed')
                return fill(t.autoRunInstalled, entry.latest || entry.version || '');
            if (entry.status === 'current')
                return t.autoRunCurrent;
            if (entry.status === 'update')
                return fill(t.autoRunUpdate, entry.latest || entry.version || '');
            if (entry.status === 'failed')
                return t.autoRunFailed;
            if (entry.status === 'manual')
                return t.autoRunFailed;
            return t.autoRunUnknown;
        }
        /** Status banner: icon tile + one-line conclusion + subcopy; the apply
            CTA or latest tag docks on the right. */
        function VersionStat({ tone, iconTone, icon, title, sub, side, busy }) {
            const cls = ['osubs-vstat'];
            if (tone)
                cls.push(`osubs-vstat--${tone}`);
            if (busy)
                cls.push('osubs-vstat--busy');
            const icCls = ['osubs-vstat-ic'];
            if (iconTone)
                icCls.push(`osubs-vstat-ic--${iconTone}`);
            return h('div', { className: cls.join(' ') }, icon && h('span', { className: icCls.join(' '), 'aria-hidden': 'true' }, icon), h('span', { className: 'osubs-vstat-main' }, h('span', { className: 'osubs-vstat-title' }, title), sub && h('span', { className: 'osubs-vstat-sub' }, sub)), side && h('span', { className: 'osubs-vstat-side' }, side));
        }
        /** `code` and **bold** in a release bullet, matching the notes card chips. */
        function noteNodes(text) {
            const nodes = [];
            const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
            let last = 0;
            let match;
            let key = 0;
            const source = String(text ?? '');
            while ((match = re.exec(source))) {
                if (match.index > last)
                    nodes.push(source.slice(last, match.index));
                if (match[1] != null)
                    nodes.push(h('code', { key: key++, className: 'osubs-notes-code' }, match[1]));
                else
                    nodes.push(h('strong', { key: key++ }, match[2]));
                last = match.index + match[0].length;
            }
            if (last < source.length)
                nodes.push(source.slice(last));
            return nodes.length ? nodes : [source];
        }
        function AboutPanel({ t, local, update, busy, onCheck, onApply, autoUpdate, autoState, onAutoUpdate, rpc, }) {
            const [notesOpen, setNotesOpen] = useState(false);
            const [notes, setNotes] = useState(null);
            const notesGen = useRef(0);
            const repo = aboutRepoOf(local, update);
            const slug = local?.repoSlug || update?.repoSlug || 'xxww0098/dsh-plugin-oauth-subs';
            const latest = update?.latest;
            const latestTag = latest?.tag || latest?.name || '';
            const apply = applyLabel(t, update);
            const stale = update?.staleProcess || local?.staleProcess;
            const disk = update?.disk || local?.disk;
            // The restart wording follows the install kind: the desktop profile is
            // Electron-managed, so its users restart an app, not a 「宿主」 process.
            const restartKind = update?.restartKind || local?.restartKind;
            // A 「本地插件目录」 install is a link: into a working tree outside the
            // profiles root. Its manifest version is the repo's official number, so
            // About shows the derived `<version>-dev` build instead of the release.
            const linkedPath = update?.linkedPath || local?.linkedPath;
            const linked = Boolean(linkedPath) || update?.linked === true || local?.linked === true;
            const devVersion = update?.devVersion || local?.devVersion;
            const version = aboutVersionOf(local, update);
            // Linked: the hot-reload note lives on the banner, so the row only
            // reports the last run. A release install keeps the 15-minute cadence
            // text + outcome (a link's outcome compares the repo's official number
            // with the release tag and would always read as 「已是最新」).
            const autoNote = () => {
                const bits = linked ? [] : [restartKind === 'app' ? t.autoUpdateHourlyApp : t.autoUpdateHourly];
                if (autoState?.at) {
                    const outcome = linked ? '' : autoRunText(t, autoState);
                    bits.push(fill(t.autoLastCheck, formatClock(autoState.at)) + (outcome ? ' · ' + outcome : ''));
                }
                return bits.join(' · ');
            };
            const published = latest?.publishedAt ? fill(t.published, latest.publishedAt) : '';
            const currentBit = version !== '—' ? fill(t.verSubCurrent, version) : '';
            const pluginCta = !linked && update?.status === 'update' && latestTag
                ? h(Button, {
                    size: 'sm',
                    mark: true,
                    disabled: busy,
                    label: t.updateTo,
                    onClick: onApply,
                })
                : null;
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
                                    sub: update?.status === 'unknown' ? t.updateUnknown : t.verUnchecked });
            const pluginCard = h('section', { className: 'osubs-card' }, h('header', { className: 'osubs-card-head' }, h('div', { className: 'osubs-head-main' }, h('h3', { className: 'osubs-card-title' }, t.pluginAboutTitle || t.aboutTitle)), h('div', { className: 'osubs-about-actions' }, h(Button, {
                size: 'sm',
                onClick: () => {
                    setNotesOpen(true);
                    if (notes && !notes.error)
                        return;
                    const gen = ++notesGen.current;
                    setNotes(null);
                    Promise.resolve()
                        .then(() => callRpc(rpc, 'changelog'))
                        .then((result) => {
                        if (notesGen.current !== gen)
                            return;
                        const releases = Array.isArray(result?.releases) ? result.releases.slice(0, 3) : [];
                        setNotes({ releases });
                    })
                        .catch((caught) => {
                        if (notesGen.current !== gen)
                            return;
                        const message = caught instanceof Error ? caught.message : String(caught);
                        setNotes({ error: isUnknownOauthMethod(message) ? t.hostStale : message, releases: [] });
                    });
                },
                label: t.changelog,
            }), h(Button, {
                size: 'sm',
                onClick: onCheck,
                disabled: busy,
                label: busy ? t.checking : t.checkUpdate,
            }))), h('div', { className: 'osubs-about' }, vstat, h('div', { className: 'osubs-kv' }, h('div', { className: 'osubs-kv-row' }, h('span', null, t.repo), h('a', { className: 'osubs-link osubs-link--icon', href: repo, target: '_blank', rel: 'noreferrer' }, h(TabIcon, { name: 'github' }), slug)), h(AutoUpdateRow, {
                t,
                note: autoNote(),
                checked: autoUpdate === true,
                onChange: (event) => onAutoUpdate(event.currentTarget.checked),
            })), h('div', { className: 'osubs-hints' }, linked && update?.status === 'error' && h('p', { className: 'osubs-hint osubs-bad' }, statusLabel(t, update)), 
            // On a linked tree the generic tail (remove and re-add from
            // GitHub) would replace the hot link with an installed copy —
            // the link's divergence is restart-only, code rides hmr.
            stale && disk && h('p', { className: 'osubs-hint osubs-warn' }, fill(linked ? t.updateStaleProcessLinked
                : restartKind === 'app' ? t.updateStaleProcessApp : t.updateStaleProcess, disk)), apply && h('p', { className: 'osubs-hint' }, apply))));
            const releases = Array.isArray(notes?.releases) ? notes.releases : [];
            const notesTitle = releases[0]?.tag ? fill(t.changelogTitle, releases[0].tag) : t.changelog;
            const notesBody = !notes
                ? h('p', { className: 'osubs-notes-status' }, t.changelogLoading)
                : notes.error
                    ? h('p', { className: 'osubs-notes-status osubs-bad' }, `${t.changelogError}${notes.error ? ` · ${notes.error}` : ''}`)
                    : releases.length === 0
                        ? h('p', { className: 'osubs-notes-status' }, t.changelogEmpty)
                        : h('div', { className: 'osubs-notes' }, releases.map((release) => h('section', {
                            key: release.tag || release.name,
                            className: 'osubs-notes-rel',
                        }, h('h3', { className: 'osubs-notes-ver' }, release.tag || release.name), ...(Array.isArray(release.sections) ? release.sections : []).map((section) => h('div', {
                            key: section.title || 'notes',
                            className: 'osubs-notes-sec',
                        }, section.title && h('h4', { className: 'osubs-notes-cat' }, section.title), h('ul', { className: 'osubs-notes-list' }, (section.items || []).map((item, index) => h('li', { key: index }, ...noteNodes(item)))))))));
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
            }, notesBody);
            const Frag = Fragment || 'div';
            return h(Frag, null, pluginCard, notesDialog);
        }
        /** Donate tab: the payment QR codes ship as package assets; the host
            reads them once and serves data URIs over RPC — the client bundle is
            a classic script with no static-file channel of its own. */
        function DonatePanel({ t, rpc, active }) {
            const [codes, setCodes] = useState(null);
            const [error, setError] = useState('');
            useEffect(() => {
                if (!active || codes !== null || error)
                    return;
                let stale = false;
                Promise.resolve()
                    .then(() => callRpc(rpc, 'donate'))
                    .then((result) => {
                    if (!stale)
                        setCodes(result && typeof result === 'object' ? result : {});
                })
                    .catch((caught) => {
                    if (stale)
                        return;
                    const message = caught instanceof Error ? caught.message : String(caught);
                    setError(isUnknownOauthMethod(message) ? t.hostStale : message);
                });
                return () => { stale = true; };
            }, [active]);
            const qr = (key, label, brand, end = false) => h('div', { className: 'osubs-donate-qr' + (end ? ' osubs-donate-qr--end' : '') }, h('img', { src: codes[key], alt: label }), h('span', { className: 'osubs-donate-name', style: { '--osubs-donate-brand': brand } }, label));
            return h('section', { className: 'osubs-card' }, h('header', { className: 'osubs-card-head' }, h('div', { className: 'osubs-head-main' }, h('h3', { className: 'osubs-card-title' }, t.donateTitle))), h('p', { className: 'osubs-hint' }, t.donateHint), error && h('p', { className: 'osubs-hint osubs-bad' }, error), codes === null && !error && h('p', { className: 'osubs-hint' }, t.loading), codes !== null && h('div', { className: 'osubs-donate' }, codes.wechat && qr('wechat', t.donateWechat, '#07c160'), codes.bunny && h('div', { className: 'osubs-donate-meme' }, h('img', { src: codes.bunny, alt: t.donateMeme })), codes.alipay && qr('alipay', t.donateAlipay, '#1677ff', true), !codes.wechat && !codes.alipay && h('p', { className: 'osubs-hint' }, t.donateEmpty)));
        }
        /** A prefs/snapshot view reduced to the fields the status snapshot may
            carry. The raw custom URL must never enter it — the stored snapshot
            lands in localStorage; only `resolved`/`url` redacted forms do. */
        function proxyDisplayFields(view) {
            if (!view || typeof view !== 'object')
                return undefined;
            const next = {
                mode: view.mode,
                url: view.resolved ?? view.url ?? '',
                source: view.source,
                configured: view.configured === true,
            };
            if (view.error)
                next.error = view.error;
            return next;
        }
        function ProxyCard({ t, proxy, rpc, onProxy }) {
            const mode = ['auto', 'off', 'custom'].includes(proxy?.mode) ? proxy.mode : 'auto';
            const locked = proxy?.source === 'config';
            const [draft, setDraft] = useState(undefined); // undefined = prefill in flight
            const [busy, setBusy] = useState(false);
            const [bad, setBad] = useState('');
            const gen = useRef(0);
            // Prefill the custom URL from proxyGet — raw (credentials included),
            // card-local memory only; the stored snapshot keeps the redacted form.
            useEffect(() => {
                const my = ++gen.current;
                Promise.resolve()
                    .then(() => callRpc(rpc, 'proxyGet'))
                    .then((result) => {
                    if (gen.current !== my)
                        return;
                    setDraft(typeof result?.url === 'string' ? result.url : '');
                    onProxy?.(proxyDisplayFields(result));
                })
                    .catch(() => {
                    if (gen.current === my)
                        setDraft('');
                });
            }, []);
            const apply = (payload, optimistic) => {
                const prev = proxy;
                if (optimistic)
                    onProxy?.(optimistic);
                setBusy(true);
                setBad('');
                Promise.resolve()
                    .then(() => callRpc(rpc, 'proxySet', payload))
                    .then((result) => {
                    if (typeof result?.url === 'string')
                        setDraft(result.url);
                    onProxy?.(proxyDisplayFields(result) ?? optimistic);
                })
                    .catch((caught) => {
                    const message = caught instanceof Error ? caught.message : String(caught);
                    setBad(isUnknownOauthMethod(message) ? t.hostStale : message);
                    onProxy?.(prev);
                })
                    .finally(() => setBusy(false));
            };
            const pick = (next) => {
                if (busy || locked || next === mode)
                    return;
                // 自定义 without a saved URL is not a persistable state — the seg
                // only previews it; 保存 (with a URL) persists the mode. auto/off
                // persist immediately and keep the stored draft for the way back.
                if (next === 'custom') {
                    onProxy?.({ ...proxy, mode: 'custom' });
                    return;
                }
                apply({ mode: next, url: draft ?? '' }, { ...proxy, mode: next });
            };
            const save = () => {
                if (busy || locked)
                    return;
                apply({ mode: 'custom', url: draft ?? '' }, { ...proxy, mode: 'custom' });
            };
            const statusText = mode === 'off'
                ? t.proxyOffNote
                : mode === 'custom'
                    ? (proxy?.configured && proxy?.url ? fill(t.proxyCustomHint, proxy.url) : t.proxyCustomHintEmpty)
                    : proxy?.source === 'os' && proxy?.url
                        ? fill(t.proxyFollowOs, proxy.url)
                        : proxy?.source === 'env' && proxy?.url
                            ? fill(t.proxyFollowEnv, proxy.url)
                            : t.proxyNoProxy;
            const seg = h('div', { className: 'osubs-seg', role: 'group', 'aria-label': t.proxyTitle }, [['auto', t.proxyAuto], ['off', t.proxyOff], ['custom', t.proxyCustom]].map(([id, label]) => h(Button, {
                key: id,
                size: 'sm',
                disabled: locked || busy,
                variant: mode === id ? 'primary' : undefined,
                onClick: () => pick(id),
                label,
            })));
            return h('section', { className: 'osubs-card' }, h('header', { className: 'osubs-card-head' }, h('div', { className: 'osubs-head-main' }, h('h3', { className: 'osubs-card-title' }, t.proxyTitle)), seg), h('div', { className: 'osubs-about' }, h('p', { className: 'osubs-hint' }, statusText), mode === 'custom' && h('div', { className: 'osubs-inline' }, h('input', {
                className: 'osubs-input' + (bad ? ' osubs-input--bad' : ''),
                type: 'text',
                value: draft ?? '',
                placeholder: t.proxyUrlPlaceholder,
                'aria-label': t.proxyUrlPlaceholder,
                spellCheck: false,
                autoComplete: 'off',
                disabled: busy || locked,
                onChange: (event) => setDraft(event.currentTarget.value),
                onKeyDown: (event) => {
                    if (event.key === 'Enter')
                        save();
                },
            }), h(Button, {
                size: 'sm',
                variant: 'primary',
                mark: true,
                disabled: busy || locked,
                onClick: save,
                label: t.proxySave,
            })), bad && h('p', { className: 'osubs-hint osubs-bad' }, bad), locked && h('p', { className: 'osubs-hint osubs-warn' }, t.proxyConfigLocked), h('div', { className: 'osubs-hints' }, h('p', { className: 'osubs-hint' }, t.proxyScopeNote))));
        }
        const FAMILY_ORDER = [
            'codex', 'chatgpt', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama',
            'kimi', 'devin', 'cline', 'opencode-go', 'opencode-zen', 'command-code',
        ];
        // OpenCode rides one account (one card, one vault) but two products: the
        // rail entry is per product ('opencode-zen'), while usage rows carry the
        // route id ('opencode-zen-chat'), so both spellings resolve to one name.
        const OPENCODE_ZEN_IDS = ['opencode-zen', 'opencode-zen-chat', 'opencode-zen-responses', 'opencode-zen-messages'];
        const FAMILY_NAME = {
            codex: 'Codex', chatgpt: 'ChatGPT', grok: 'Grok', glm: 'GLM', kiro: 'Kiro', antigravity: 'Antigravity',
            cursor: 'Cursor', ollama: 'Ollama', kimi: 'Kimi', devin: 'Devin',
            cline: 'Cline', 'opencode-go': 'OpenCode Go', 'command-code': 'Command Code',
            ...Object.fromEntries(OPENCODE_ZEN_IDS.map((id) => [id, 'OpenCode Zen'])),
        };
        const FAMILY_ICON = {
            codex: 'codex', chatgpt: 'openai', grok: 'grok', glm: 'zai', kiro: 'kiro', antigravity: 'antigravity',
            cursor: 'cursor', ollama: 'ollama', kimi: 'kimi', devin: 'devin',
            cline: 'cline', 'opencode-go': 'opencodeGo', 'command-code': 'commandCode',
            ...Object.fromEntries(OPENCODE_ZEN_IDS.map((id) => [id, 'opencodeGo'])),
        };
        // Brand tints for rail icons whose LobeHub mark is mono-only; codex,
        // kiro, antigravity, kimi and devin render their
        // official colored SVG via `raw`, while grok/cursor/ollama/opencode-go
        // stay monochrome like their official marks. Hues follow the brand.
        const FAMILY_COLOR = {
            glm: '#6366f1', cline: '#ee6a5e',
        };
        // Rail entries the Usage view adds after the plugin's families: host
        // providers it reports usage for but does not manage (no quota card, no
        // model switches). `deepseek` = DSH's own deepseek-official / -account.
        const USAGE_ONLY_FAMILIES = ['deepseek'];
        const usageFamilyName = (t, id) => FAMILY_NAME[id] ?? (id === 'deepseek' ? t.usageDeepseek : id);
        const usageFamilyIcon = (id) => FAMILY_ICON[id] ?? (USAGE_ONLY_FAMILIES.includes(id) ? id : undefined);
        const railIdOf = (fam) => {
            const id = String(fam ?? '');
            if (id.startsWith('opencode-zen'))
                return 'opencode-zen';
            return id.startsWith('opencode-go') ? 'opencode-go' : id;
        };
        // Usage rows from the `usage` RPC ({ at, rows }), per hour/family/model:
        // [hour epoch, family, model, calls, input, output, cacheRead, cacheWrite,
        //  failed, cachePrompt, timed, ttftMs, decodeMs, decodeOut] — see
        // src/utils/usage.ts for what each counts.
        const HOUR_MS = 3_600_000;
        // The page keeps the last answer and shows it at once on every open; it
        // asks again only past this age, or on 刷新. The host memoizes as long.
        const USAGE_TTL_MS = 5 * 60_000;
        const USAGE_STORE = 'dsh-plugin-oauth-subs.usage';
        function readStoredUsage() {
            try {
                const parsed = JSON.parse(localStorage.getItem(USAGE_STORE) ?? 'null');
                return parsed && typeof parsed.at === 'number' && Array.isArray(parsed.rows) ? parsed : null;
            }
            catch {
                return null;
            }
        }
        function writeStoredUsage(usage) {
            try {
                localStorage.setItem(USAGE_STORE, JSON.stringify(usage));
            }
            catch { /* quota / private mode */ }
        }
        // The range picker remembers the last choice; a first open (or a bad
        // stored value) falls back to 今天.
        const USAGE_RANGE_STORE = 'dsh-plugin-oauth-subs.usage-range';
        function readStoredRange() {
            try {
                const raw = localStorage.getItem(USAGE_RANGE_STORE);
                if (raw === 'today')
                    return 'today';
                const days = Number(raw);
                return days === 7 || days === 30 ? days : 'today';
            }
            catch {
                return 'today';
            }
        }
        function writeStoredRange(range) {
            try {
                localStorage.setItem(USAGE_RANGE_STORE, String(range));
            }
            catch { /* private mode */ }
        }
        const dayKey = (ms) => {
            const d = new Date(ms);
            return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        };
        function compactNumber(n) {
            for (const [size, unit] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
                if (n >= size)
                    return `${(n / size).toFixed(n >= size * 100 ? 0 : 1).replace(/\.0$/, '')}${unit}`;
            }
            return String(Math.round(n));
        }
        const formatMs = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
        /** 1 / 2 / 5 × 10^n at or above `n`, so the gridlines land on round values. */
        function niceCeil(n) {
            if (n <= 0)
                return 1;
            const base = 10 ** Math.floor(Math.log10(n));
            return ([1, 2, 5, 10].find((step) => step * base >= n) ?? 10) * base;
        }
        /** Distinct models per family seen in the rows (the rail count on the Usage view). */
        function usageModelCounts(rows) {
            const seen = new Map();
            for (const row of rows ?? [])
                (seen.get(row[1]) ?? seen.set(row[1], new Set()).get(row[1])).add(row[2]);
            return (id) => seen.get(id)?.size ?? 0;
        }
        const emptyUsage = () => ({ calls: 0, input: 0, output: 0, cacheRead: 0, failed: 0, cachePrompt: 0, timed: 0, ttft: 0, decodeMs: 0, decodeOut: 0, cost: 0 });
        function addUsage(sum, row, cost = null) {
            sum.calls += row[3];
            // 输入 is the whole prompt — uncached + cache read + cache write — so
            // Token reconciles with the host's per-session totalTokens (what the
            // user compares against); 缓存读 stays its own card as the cached
            // share of that prompt.
            sum.input += row[4] + row[6] + row[7];
            sum.output += row[5];
            sum.cacheRead += row[6];
            sum.failed += row[8] ?? 0;
            sum.cachePrompt += row[9] ?? 0;
            sum.timed += row[10] ?? 0;
            sum.ttft += row[11] ?? 0;
            sum.decodeMs += row[12] ?? 0;
            sum.decodeOut += row[13] ?? 0;
            // Unpriced rows add nothing: an estimate that ignores them stays lower,
            // and the card's cover sub-line says which models are missing.
            sum.cost += cost ?? 0;
            return cost != null;
        }
        /** `$0.42` → `<$0.01` / cents / dollars; large like tokens (`$1.2k`). */
        function compactUsd(n) {
            if (!(n > 0))
                return '$0';
            if (n < 0.01)
                return '<$0.01';
            if (n < 10)
                return `$${n.toFixed(2)}`;
            if (n < 1000)
                return `$${String(n.toFixed(1)).replace(/\.0$/, '')}`;
            return `$${compactNumber(n)}`;
        }
        // Token counts everything the call moved: the whole prompt in, the reply
        // out. The hit rate still only counts calls whose usage carries a cache
        // field (Kiro's never do: n/a, not 0%).
        const usageTokens = (sum) => sum.input + sum.output;
        const usageHit = (sum) => (sum.cachePrompt ? sum.cacheRead / sum.cachePrompt : null);
        // 首字延迟 / 输出 tok/s are per call, not per range — one burst reply
        // averages into a range and says nothing. They stay on the 按模型 rows
        // (modelSub), where the calls behind the mean are in the same line.
        const usageTtft = (sum) => (sum.timed ? sum.ttft / sum.timed : null);
        const usageSpeed = (sum) => (sum.decodeMs ? sum.decodeOut / (sum.decodeMs / 1000) : null);
        // ── Long screenshot (用量 → 分享) ───────────────────────────────────────
        // The card is cloned with every computed style inlined and drawn through an
        // SVG foreignObject onto a canvas (Chromium keeps that canvas untainted);
        // the footer is painted below it. The clone is detached from the scrolling
        // pane, so the whole card lands in the image however far it is scrolled.
        // PNG: the clipboard only takes image/png, and flat UI stays sharp in it.
        // ponytail: ::before/::after content is not copied — the usage card has none.
        function inlineClone(source) {
            const copy = source.cloneNode(false);
            if (source.nodeType !== 1)
                return copy;
            const style = getComputedStyle(source);
            // An SVG image resolves the font on its own, so the width it measures
            // for a string is not always the width the page measured. A
            // shrink-to-fit text box frozen at the page's own pixel width then wraps
            // inside its own box and paints over the line below it — the quota
            // reset line colliding with 剩余 100% on a 额度 shot. A text-bearing box
            // therefore keeps no width of its own; the image lays it out with its
            // own metrics. Absolutely positioned boxes keep their geometry.
            const carriesText = Array.from(source.childNodes).some((node) => node.nodeType === 3 && String(node.nodeValue ?? '').trim() !== '');
            // ...and only while the box is exactly as wide as its text: a box that is
            // already truncating it (scrollWidth > clientWidth) keeps the width the
            // page gave it, so the image truncates the same way.
            const releaseWidth = carriesText
                && style.position !== 'absolute' && style.position !== 'fixed'
                && source.scrollWidth <= source.clientWidth + 1;
            let text = '';
            for (let i = 0; i < style.length; i++) {
                const name = style[i];
                if (releaseWidth && (name === 'width' || name === 'inline-size'))
                    continue;
                text += `${name}:${style.getPropertyValue(name)};`;
            }
            // The element's own inline style goes last: a bar still animating toward
            // its `height: %` is captured at its target, not mid-transition.
            copy.setAttribute('style', `${text}animation:none;transition:none;${source.getAttribute('style') ?? ''}`);
            // An account's identity is masked in the image, never on the page.
            if (source.hasAttribute('data-shot-mask')) {
                copy.textContent = maskIdentity(source.textContent);
                // The masked text is shorter: let the box shrink to it.
                copy.style.width = 'auto';
                copy.style.inlineSize = 'auto';
                return copy;
            }
            for (const child of Array.from(source.childNodes)) {
                if (child.nodeType === 1 && child.hasAttribute('data-noshot'))
                    continue;
                copy.appendChild(inlineClone(child));
            }
            return copy;
        }
        /** `alice@example.com` → `a***@e***.com`; a bare username → `a***`. */
        function maskIdentity(text) {
            const value = String(text ?? '').trim();
            const hide = (part) => (part.length <= 1 ? '*' : `${part[0]}***`);
            const at = value.indexOf('@');
            if (at <= 0)
                return hide(value);
            const domain = value.slice(at + 1);
            const dot = domain.lastIndexOf('.');
            return `${hide(value.slice(0, at))}@${dot > 0 ? hide(domain.slice(0, dot)) + domain.slice(dot) : hide(domain)}`;
        }
        /** The first opaque background up the tree, else a surface that fits the ink. */
        function shotSurfaceOf(node) {
            for (let el = node; el; el = el.parentElement) {
                const bg = getComputedStyle(el).backgroundColor;
                if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg))
                    return bg;
            }
            const [r, g, b] = (getComputedStyle(node).color.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).map(Number);
            return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128 ? '#1c1c1f' : '#ffffff';
        }
        async function renderLongShot(node, footer) {
            // `osubs-shooting` drops every [data-noshot] from the live layout for
            // this synchronous stretch only (no paint happens in between), so the
            // measured size and the inlined heights close up around what is left out.
            node.classList.add('osubs-shooting');
            let width, height, clone;
            try {
                width = Math.ceil(node.offsetWidth);
                height = Math.ceil(node.offsetHeight);
                clone = inlineClone(node);
            }
            finally {
                node.classList.remove('osubs-shooting');
            }
            // The node's own margin (the quota list pads up over a legend title with
            // a negative one) would shift the image inside its frame.
            clone.style.margin = '0';
            clone.classList.remove('osubs-shooting');
            const markup = new XMLSerializer().serializeToString(clone);
            const image = new Image();
            image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`)}`;
            await image.decode();
            const style = getComputedStyle(node);
            const pad = 24;
            const total = height + pad * 2 + 64;
            // Chromium caps a canvas side near 16k px: a very long card drops toward 1x.
            const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1, 16000 / total));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round((width + pad * 2) * scale);
            canvas.height = Math.round(total * scale);
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.fillStyle = shotSurfaceOf(node);
            ctx.fillRect(0, 0, width + pad * 2, total);
            ctx.drawImage(image, pad, pad, width, height);
            // Footer: a rule, then plugin + version / repo on the left, date / scope on the right.
            const top = pad + height + 20;
            ctx.strokeStyle = style.color;
            ctx.globalAlpha = 0.28;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pad, top + 0.5);
            ctx.lineTo(pad + width, top + 0.5);
            ctx.stroke();
            ctx.fillStyle = style.color;
            ctx.textBaseline = 'top';
            ctx.globalAlpha = 1;
            ctx.font = `600 13px ${style.fontFamily}`;
            ctx.fillText(footer.title, pad, top + 12);
            ctx.textAlign = 'right';
            ctx.fillText(footer.date, pad + width, top + 12);
            ctx.globalAlpha = 0.62;
            ctx.font = `12px ${style.fontFamily}`;
            ctx.fillText(footer.scope, pad + width, top + 32);
            ctx.textAlign = 'left';
            ctx.fillText(footer.repo, pad, top + 32);
            return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob'))), 'image/png'));
        }
        /**
         * Write a PNG (or its pending promise, so the click's user activation still
         * covers it). A write that never settles — seen when the window cannot
         * reach the system clipboard — counts as failed after a few seconds.
         */
        function copyPng(png) {
            if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write)
                return Promise.resolve(false);
            return Promise.race([
                navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(() => true, () => false),
                new Promise((resolve) => setTimeout(() => resolve(false), 4000)),
            ]);
        }
        const stamp = (ms) => {
            const d = new Date(ms);
            const two = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
        };
        const shortStamp = (ms) => {
            const d = new Date(ms);
            const two = (n) => String(n).padStart(2, '0');
            return `${d.getMonth() + 1}/${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`;
        };
        function IconShare() {
            return h('svg', {
                width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
                stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
                'aria-hidden': 'true',
            }, h('path', { d: 'M12 15V3' }), h('path', { d: 'm7 8 5-5 5 5' }), h('path', { d: 'M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6' }));
        }
        const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const THUMB = { width: 180, height: 120, gap: 20 };
        const THUMB_STAY_MS = 5000;
        /**
         * The macOS screenshot thumbnail: flies from the card's visible rect into the
         * bottom-right corner (width/height/left/top, so the top-anchored image
         * keeps its proportions in flight), stays while hovered, then slides out.
         * A click opens the preview. Reduced motion: it only fades in and out.
         */
        function ShotThumb({ url, from, copied, t, onOpen, onDone }) {
            const ref = useRef(null);
            const timer = useRef(0);
            const to = {
                left: window.innerWidth - THUMB.gap - THUMB.width,
                top: window.innerHeight - THUMB.gap - THUMB.height,
                width: THUMB.width,
                height: THUMB.height,
            };
            const leave = () => {
                const el = ref.current;
                if (!el)
                    return;
                const out = reducedMotion()
                    ? [{ opacity: 1 }, { opacity: 0 }]
                    : [{ transform: 'none', opacity: 1 }, { transform: `translateX(${THUMB.width + THUMB.gap * 2}px)`, opacity: 0.4 }];
                el.animate(out, { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished.then(onDone, onDone);
            };
            const arm = () => {
                clearTimeout(timer.current);
                timer.current = window.setTimeout(leave, THUMB_STAY_MS);
            };
            useEffect(() => {
                const el = ref.current;
                if (reducedMotion() || !from) {
                    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
                }
                else {
                    const box = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
                    el.animate([
                        { ...box(from), borderRadius: '14px', boxShadow: '0 0 0 0 transparent' },
                        { ...box(to), borderRadius: '10px' },
                    ], { duration: 560, easing: 'cubic-bezier(0.2, 0.9, 0.2, 1)' });
                }
                arm();
                return () => clearTimeout(timer.current);
            }, []);
            return h('button', {
                ref,
                type: 'button',
                className: 'osubs-thumb',
                style: { left: to.left, top: to.top, width: to.width, height: to.height },
                'aria-label': t.usageShotOpen,
                onClick: () => { clearTimeout(timer.current); onOpen(); },
                onMouseEnter: () => clearTimeout(timer.current),
                onMouseLeave: arm,
                onFocus: () => clearTimeout(timer.current),
                onBlur: arm,
            }, h('img', { src: url, alt: '' }), h('span', { className: 'osubs-thumb-badge' }, copied === null ? t.usageCopyingShort : t.usageCopiedShort));
        }
        /** The footer every shared image carries: plugin + version, repo, date, scope. */
        const shotFooter = (t, { version, repo, at, scope, atLabel }) => ({
            title: version && version !== '—' ? `${t.pluginAboutTitle} v${version}` : t.pluginAboutTitle,
            repo: String(repo).replace(/^https?:\/\//, ''),
            date: atLabel ?? fill(t.usageAnalyzed, stamp(at)),
            scope,
        });
        /**
         * 分享 for any view: walks busy → thumb → dialog, macOS style — a flash over
         * the node's on-screen rect, the thumbnail flies to the corner, a click on
         * it opens the preview. A copy that fails skips the thumbnail and opens the
         * preview to save from. `layer` renders the flash, thumbnail and dialog.
         * { phase, from, flash, png, url, copied: null (copying) | boolean, error, fileName }
         */
        function useShot(t) {
            const [shot, setShot] = useState(null);
            const close = () => {
                if (shot?.url)
                    URL.revokeObjectURL(shot.url);
                setShot(null);
            };
            // The image renders while the clipboard write already holds the click's
            // user activation; the copy outcome lands whenever the clipboard answers.
            const start = (node, footer, fileName) => {
                if (!node || shot?.phase === 'busy')
                    return;
                if (shot?.url)
                    URL.revokeObjectURL(shot.url);
                // The part of the node on screen: where the flash lands and the thumbnail takes off.
                const rect = node.getBoundingClientRect();
                const pane = node.closest('.osubs-pane')?.getBoundingClientRect() ?? rect;
                const left = Math.max(rect.left, pane.left);
                const top = Math.max(rect.top, pane.top);
                const from = { left, top, width: Math.min(rect.right, pane.right) - left, height: Math.min(rect.bottom, pane.bottom) - top };
                const png = renderLongShot(node, footer);
                setShot({ phase: 'busy', from, flash: !reducedMotion(), copied: null, fileName });
                png.then((blob) => setShot((current) => current && { ...current, phase: current.copied === false ? 'dialog' : 'thumb', png: blob, url: URL.createObjectURL(blob) }), (caught) => setShot({ phase: 'dialog', error: caught instanceof Error ? caught.message : String(caught) }));
                void copyPng(png).then((copied) => setShot((current) => current && !current.error && {
                    ...current,
                    copied,
                    phase: copied === false && current.phase === 'thumb' ? 'dialog' : current.phase,
                }));
            };
            const save = () => {
                const link = document.createElement('a');
                link.href = shot.url;
                link.download = shot.fileName;
                link.click();
            };
            const dialog = () => h(CenterDialog, {
                titleId: 'osubs-shot',
                title: t.usageShareTitle,
                subtitle: shot.error ? fill(t.usageShareFailed, shot.error) : shot.copied === null ? t.usageCopying : shot.copied ? t.usageCopied : t.usageCopyFailed,
                closeLabel: t.dialogClose,
                onClose: close,
                cardClass: 'osubs-dsw-card osubs-dsw-card--shot',
                footer: shot.png && h(Fragment || 'span', null, h(Button, {
                    size: 'sm', disabled: shot.copied === null, label: t.usageCopy,
                    onClick: () => {
                        setShot((current) => current && { ...current, copied: null });
                        void copyPng(shot.png).then((copied) => setShot((current) => current && { ...current, copied }));
                    },
                }), h(Button, { size: 'sm', variant: 'primary', onClick: save, label: t.usageSave })),
            }, shot.url && h('div', { className: 'osubs-shot' }, h('img', { src: shot.url, alt: t.usageShareTitle })));
            const layer = shot && h(Fragment || 'span', null, shot.flash && h('div', {
                className: 'osubs-flash',
                'aria-hidden': 'true',
                style: { left: shot.from.left, top: shot.from.top, width: shot.from.width, height: shot.from.height },
                onAnimationEnd: () => setShot((current) => current && { ...current, flash: false }),
            }), shot.phase === 'thumb' && h(ShotThumb, {
                key: shot.url,
                url: shot.url,
                from: shot.from,
                copied: shot.copied,
                t,
                onOpen: () => setShot((current) => current && { ...current, phase: 'dialog' }),
                onDone: close,
            }), shot.phase === 'dialog' && dialog());
            return { busy: shot?.phase === 'busy', start, layer };
        }
        // `hint` is the button's hover title. 额度 passes the masking note (its
        // image hides account identities); 用量 / 榜单 leave it off — their
        // images carry no account identity.
        function ShareButton({ t, busy, disabled, onClick, hint }) {
            return h(Button, {
                size: 'sm', disabled: disabled || busy, onClick, title: hint,
                label: h('span', { className: 'osubs-refresh' + (busy ? ' osubs-refresh--spin' : '') }, h(IconShare), busy ? t.usageSharing : t.usageShare),
            });
        }
        function UsageSkeleton() {
            return h('div', { className: 'osubs-usk', 'aria-hidden': 'true' }, h('div', { className: 'osubs-ustats' }, [0, 1, 2, 3].map((i) => h('div', { key: i, className: 'osubs-ustat' }, h('i', { className: 'osubs-sk osubs-sk--n' }), h('i', { className: 'osubs-sk osubs-sk--l' })))), h('i', { className: 'osubs-sk osubs-sk--chart' }));
        }
        function UsagePanel({ t, data, error, scope, busy, onRefresh, version, repo }) {
            const [range, setRange] = useState(readStoredRange);
            const [hover, setHover] = useState(-1);
            const [by, setBy] = useState('model');
            const [copiedId, setCopiedId] = useState(null);
            const shot = useShot(t);
            const cardRef = useRef(null);
            const rows = data?.rows ?? null;
            const ranges = [['today', t.usageToday], [7, fill(t.usageDays, 7)], [30, fill(t.usageDays, 30)]];
            const rangeLabel = ranges.find(([id]) => id === range)?.[1];
            const pickRange = (id) => { setRange(id); writeStoredRange(id); setHover(-1); };
            const share = () => {
                if (!data)
                    return;
                setHover(-1);
                shot.start(cardRef.current, shotFooter(t, {
                    version, repo, at: data.at,
                    scope: `${scope === 'all' ? t.allFamilies : usageFamilyName(t, scope)} · ${rangeLabel}`,
                }), `oauth-subs-usage-${stamp(data.at).slice(0, 10)}.png`);
            };
            const head = h('header', { className: 'osubs-uhead' }, 
            // Controls stay out of the shared image (the footer carries the date).
            h('span', { className: 'osubs-noshot', 'data-noshot': '' }, data && h('span', { className: 'osubs-note osubs-uhead-note' }, fill(t.usageUpdated, new Date(data.at).toLocaleTimeString(localeOf(), { hour: '2-digit', minute: '2-digit' }))), h(Button, {
                size: 'sm', disabled: busy, onClick: onRefresh,
                label: h('span', { className: 'osubs-refresh' + (busy ? ' osubs-refresh--spin' : '') }, h(IconRefresh), t.quotaRefresh),
            }), h(ShareButton, { t, busy: shot.busy, disabled: !rows, onClick: share })), h('div', { className: 'osubs-seg', role: 'group' }, ranges.map(([id, label]) => h(Button, {
                key: id, size: 'sm', variant: range === id ? 'primary' : undefined,
                onClick: () => pickRange(id), label,
            }))));
            if (rows === null) {
                return h('section', { className: 'osubs-card', 'aria-busy': !error }, head, error ? h('p', { className: 'osubs-hint osubs-bad' }, error) : h(UsageSkeleton));
            }
            // Buckets oldest first: today's 24 hours, or local calendar days ending today.
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const hourly = range === 'today';
            const bucketKey = (ms) => (hourly ? `${dayKey(ms)}:${new Date(ms).getHours()}` : dayKey(ms));
            const buckets = hourly
                ? Array.from({ length: 24 }, (_, hour) => ({ key: `${dayKey(today.getTime())}:${hour}`, label: `${hour}:00`, ...emptyUsage() }))
                : Array.from({ length: range }, (_, i) => {
                    const d = new Date(today);
                    d.setDate(d.getDate() - (range - 1 - i));
                    return { key: dayKey(d.getTime()), label: `${d.getMonth() + 1}/${d.getDate()}`, ...emptyUsage() };
                });
            const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
            const models = new Map();
            const total = emptyUsage();
            const costs = Array.isArray(data?.costs) ? data.costs : [];
            rows.forEach((row, i) => {
                if (scope !== 'all' && row[1] !== scope)
                    return;
                const bucket = byKey.get(bucketKey(row[0] * HOUR_MS));
                if (!bucket)
                    return;
                const cost = costs[i] ?? null;
                addUsage(bucket, row, cost);
                addUsage(total, row, cost);
                const key = `${row[1]}/${row[2]}`;
                const model = models.get(key) ?? models.set(key, { family: row[1], model: row[2], priced: false, ...emptyUsage() }).get(key);
                addUsage(model, row, cost);
                // A $0 rate row is still a priced model (Cline's free group).
                if (cost != null)
                    model.priced = true;
            });
            const top = niceCeil(Math.max(...buckets.map(usageTokens)));
            const ranked = [...models.values()].filter((model) => model.calls || model.failed)
                .sort((a, b) => usageTokens(b) - usageTokens(a) || b.calls - a.calls);
            const peak = Math.max(1, usageTokens(ranked[0] ?? total));
            // Hours: every 6th. Days: all 7; at 30, every 5th back from today.
            const labelled = (i) => (hourly ? i % 6 === 0 : range <= 7 || (range - 1 - i) % 5 === 0);
            const hit = usageHit(total);
            const inOut = (sum) => fill(t.usageInOut, { a: compactNumber(sum.input), b: compactNumber(sum.output) });
            const pricedModels = ranked.filter((row) => row.priced).length;
            const costSub = ranked.length && pricedModels < ranked.length
                ? fill(t.usageCostCover, { a: pricedModels, b: ranked.length })
                : t.usageCostSub;
            // 按会话: one row per session, newest first (the host aggregates each
            // session file). A scoped rail narrows to that family's share of it.
            const sessionList = (data?.sessions ?? [])
                .map((session) => {
                if (scope === 'all') {
                    return { id: session.id, lastAt: session.lastAt, calls: session.calls, failed: session.failed,
                        tokens: session.input + session.output, cost: session.cost, models: session.models ?? [] };
                }
                const models = (session.models ?? []).filter((model) => model.family === scope);
                if (!models.length)
                    return null;
                return { id: session.id, lastAt: session.lastAt,
                    calls: models.reduce((n, m) => n + m.calls, 0), failed: 0,
                    tokens: models.reduce((n, m) => n + m.tokens, 0), cost: models.reduce((n, m) => n + m.cost, 0), models };
            })
                .filter(Boolean)
                .slice(0, 50);
            const sessionPeak = Math.max(1, ...sessionList.map((session) => session.tokens));
            const copySessionId = (id) => {
                try {
                    void navigator.clipboard?.writeText(id).then(() => {
                        setCopiedId(id);
                        setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
                    }, () => undefined);
                }
                catch { /* no clipboard: the full id stays in the chip's title */ }
            };
            const sessionModelsSub = (session) => [
                [session.models[0]?.model, session.models[1]?.model,
                    session.models.length > 2 ? fill(t.usageModelsMore, { n: session.models.length - 2 }) : ''].filter(Boolean).join(' · '),
                [fill(t.usageCallsN, session.calls.toLocaleString('en-US')),
                    session.failed ? fill(t.usageFailed, session.failed) : ''].filter(Boolean).join(' · '),
            ].filter(Boolean).join(' · ');
            const stat = (label, value, sub, title) => h('div', { className: 'osubs-ustat', title }, h('span', { className: 'osubs-ustat-l' }, label), h('span', { className: 'osubs-ustat-v' }, value), sub && h('span', { className: 'osubs-ustat-s' }, sub));
            const tipLine = (label, value) => h('div', { className: 'osubs-ptip-line' }, h('span', { className: 'osubs-ptip-l' }, label), h('span', { className: 'osubs-ptip-v' }, value.toLocaleString('en-US')));
            const modelSub = (row) => [
                fill(t.usageCallsN, row.calls.toLocaleString('en-US')),
                row.failed ? fill(t.usageFailed, row.failed) : '',
                usageTtft(row) != null ? fill(t.usageTtftShort, formatMs(usageTtft(row))) : '',
                usageSpeed(row) != null ? `${Math.round(usageSpeed(row))} tok/s` : '',
                row.priced ? fill(t.usageEstShort, { v: compactUsd(row.cost) }) : '',
            ].filter(Boolean).join(' · ');
            return h(Fragment || 'div', null, h('section', { className: 'osubs-card', ref: cardRef }, head, error && h('p', { className: 'osubs-hint osubs-bad' }, error), h('div', { className: 'osubs-ustats' }, stat(t.usageTokens, compactNumber(usageTokens(total)), inOut(total)), stat(t.usageCacheRead, hit != null || total.cacheRead ? compactNumber(total.cacheRead) : '—', hit != null ? fill(t.usageHit, `${Math.round(hit * 100)}%`) : t.usageHitNa, t.usageHitNote), stat(t.usageCalls, total.calls.toLocaleString('en-US'), total.failed ? fill(t.usageFailed, total.failed) : ''), stat(t.usageCost, total.cost > 0 || pricedModels ? compactUsd(total.cost) : '—', costSub, t.usageCostNote)), total.calls === 0 && total.failed === 0
                ? h('p', { className: 'osubs-hint' }, t.usageEmpty)
                : h(Fragment || 'div', null, h('div', { className: 'osubs-uchart', role: 'img', 'aria-label': `${hourly ? t.usageChartHourly : t.usageChart}: ${compactNumber(usageTokens(total))}` }, h('div', { className: 'osubs-uaxis', 'aria-hidden': 'true' }, h('span', null, compactNumber(top)), h('span', null, compactNumber(top / 2)), h('span', null, '0')), h('div', { className: 'osubs-uplot' }, buckets.map((bucket, i) => h('div', {
                    key: bucket.key,
                    className: `osubs-ucol${hover === i ? ' osubs-ucol--on' : ''}`,
                    tabIndex: 0,
                    'aria-label': `${bucket.label} ${t.usageTokens} ${usageTokens(bucket).toLocaleString('en-US')}`,
                    onMouseEnter: () => setHover(i),
                    onMouseLeave: () => setHover(-1),
                    onFocus: () => setHover(i),
                    onBlur: () => setHover(-1),
                }, 
                // Output stacked on input, one bar per bucket.
                h('span', { className: 'osubs-ubar', style: { height: `${(usageTokens(bucket) / top) * 100}%` } }, bucket.output > 0 && h('i', { className: 'osubs-ubar-out', style: { flexGrow: bucket.output } }), bucket.input > 0 && h('i', { className: 'osubs-ubar-in', style: { flexGrow: bucket.input } })), 
                // Right-anchored a bit early: at 30 bars the rightmost
                // right-opening tip still clears the card edge.
                hover === i && h('div', { className: `osubs-rtip osubs-utip${i >= Math.floor(buckets.length * 0.45) ? ' osubs-utip--end' : ''}`, role: 'tooltip' }, h('strong', null, bucket.label), tipLine(t.usageInput, bucket.input), tipLine(t.usageOutput, bucket.output), h('div', { className: 'osubs-ptip-sep' }), tipLine(t.usageCacheRead, bucket.cachePrompt || bucket.cacheRead ? bucket.cacheRead : '—'), tipLine(t.usageCalls, bucket.calls), bucket.cost > 0 && tipLine(t.usageCostTip, compactUsd(bucket.cost)), bucket.failed > 0 && tipLine(t.usageFailedLabel, bucket.failed))))), h('div', { className: 'osubs-uxlabels', 'aria-hidden': 'true' }, buckets.map((bucket, i) => h('span', { key: bucket.key }, labelled(i) ? bucket.label : '')))), h('div', { className: 'osubs-utable' }, h('div', { className: 'osubs-urow osubs-urow--head osubs-urow--pick' }, h('span', null, by === 'model' ? t.usageByModel : fill(t.usageSessionsN, sessionList.length)), h('span', { className: 'osubs-useg', role: 'group', 'data-noshot': '' }, [['model', t.usageByModel], ['session', t.usageBySession]].map(([id, label]) => h(Button, {
                    key: id, size: 'sm', variant: by === id ? 'primary' : undefined,
                    onClick: () => setBy(id), label,
                })))), by === 'model'
                    ? ranked.map((row) => h('div', { className: 'osubs-urow', key: `${row.family}/${row.model}` }, h('span', { className: 'osubs-umodel' }, usageFamilyIcon(row.family) && h('span', { className: 'osubs-rail-ic', title: usageFamilyName(t, row.family), style: FAMILY_COLOR[row.family] ? { color: FAMILY_COLOR[row.family] } : undefined }, h(TabIcon, { name: usageFamilyIcon(row.family), className: 'osubs-rail-icon' })), h('span', { className: 'osubs-umodel-who' }, h('span', { className: 'osubs-umodel-n' }, row.model), h('span', { className: 'osubs-umodel-s' }, modelSub(row)))), h('span', { className: 'osubs-ushare' }, h('i', { style: { width: `${Math.max(1.5, (usageTokens(row) / peak) * 100)}%` } })), h('span', { className: 'osubs-unum' }, h('b', null, compactNumber(usageTokens(row))), h('small', null, `${Math.round((usageTokens(row) / Math.max(1, usageTokens(total))) * 100)}%`))))
                    : sessionList.map((session) => h('div', { className: 'osubs-urow', key: session.id }, h('span', { className: 'osubs-umodel' }, h('span', { className: 'osubs-umodel-who' }, h('span', { className: 'osubs-umodel-n osubs-usess-n' }, shortStamp(session.lastAt), h('button', {
                        type: 'button', className: 'osubs-ucopy', 'data-noshot': '',
                        title: session.id, 'aria-label': t.usageCopyId,
                        onClick: () => copySessionId(session.id),
                    }, copiedId === session.id ? t.usageCopiedShort : session.id.slice(0, 8))), h('span', { className: 'osubs-umodel-s', title: session.models.map((model) => `${model.family}/${model.model}`).join('\n') }, sessionModelsSub(session)))), h('span', { className: 'osubs-ushare' }, h('i', { style: { width: `${Math.max(1.5, (session.tokens / sessionPeak) * 100)}%` } })), h('span', { className: 'osubs-unum' }, h('b', null, compactNumber(session.tokens)), h('small', null, session.cost > 0
                        ? fill(t.usageEstShort, { v: compactUsd(session.cost) })
                        : `${Math.round((session.tokens / Math.max(1, usageTokens(total))) * 100)}%`))))))), shot.layer);
        }
        // Mirrors ARENA_TTL_MS on the host: a stored answer older than this makes
        // entering the tab ask again; 刷新 always does.
        const ARENA_TTL_MS = 60 * 60_000;
        const ARENA_STORE = 'dsh-plugin-oauth-subs.arena';
        const ARENA_CATEGORY_STORE = 'dsh-plugin-oauth-subs.arena-category';
        const ARENA_CATEGORIES = [
            ['overall', 'arenaCatOverall', ''],
            ['code', 'arenaCatCode', '/code'],
            ['chat', 'arenaCatChat', '/chat'],
            ['work', 'arenaCatWork', '/work'],
        ];
        // The board this tab reads; the footer link goes to the category route
        // being viewed. Routes are not the upstream dataSource
        // slugs (chat → consumer, work → gdp) — never build URLs from those.
        const ARENA_SOURCE_URL = 'https://arena.ai/leaderboard/agent';
        function readStoredArena() {
            try {
                const parsed = JSON.parse(localStorage.getItem(ARENA_STORE) ?? 'null');
                return parsed && typeof parsed.at === 'number' && typeof parsed.boards === 'object' && parsed.boards !== null ? parsed : null;
            }
            catch {
                return null;
            }
        }
        function writeStoredArena(data) {
            try {
                localStorage.setItem(ARENA_STORE, JSON.stringify(data));
            }
            catch { /* quota / private mode */ }
        }
        function readStoredArenaCategory() {
            try {
                const raw = localStorage.getItem(ARENA_CATEGORY_STORE);
                return ARENA_CATEGORIES.some(([id]) => id === raw) ? raw : 'overall';
            }
            catch {
                return 'overall';
            }
        }
        function writeStoredArenaCategory(id) {
            try {
                localStorage.setItem(ARENA_CATEGORY_STORE, id);
            }
            catch { /* private mode */ }
        }
        const ARENA_VIEW_STORE = 'dsh-plugin-oauth-subs.arena-view';
        function readStoredArenaView() {
            try {
                return localStorage.getItem(ARENA_VIEW_STORE) === 'pareto' ? 'pareto' : 'rank';
            }
            catch {
                return 'rank';
            }
        }
        function writeStoredArenaView(id) {
            try {
                localStorage.setItem(ARENA_VIEW_STORE, id);
            }
            catch { /* private mode */ }
        }
        /**
         * The Pareto frontier of `rows`: models no other model beats on both cost
         * (cheaper) and net improvement (higher). Sweep cheapest→dearest keeping
         * every new best. Rows without cost data cannot place on the chart.
         */
        function arenaFrontier(rows, xOf = (row) => row.costUsd) {
            const priced = rows.filter((row) => xOf(row) != null && row.value != null)
                .sort((a, b) => xOf(a) - xOf(b));
            const front = [];
            let best = -Infinity;
            for (const row of priced) {
                if (row.value > best) {
                    front.push(row);
                    best = row.value;
                }
            }
            return front;
        }
        /** `$1.74` / `$0.05` — arena's own cost formatting. */
        const arenaUsd = (n) => (n >= 1 ? `$${String(n.toFixed(2)).replace(/\.?0+$/, '')}` : `$${n.toFixed(2)}`);
        /**
         * `28.8K` / `10K` / `1.5M` — the site's own `formatTokensPerTask`, which
         * takes the *Mtok* figure and rounds it to two decimals BEFORE choosing a
         * branch. That is why 999.6K reads as `1M`, why 227K stays an integer,
         * and why 66.525K reads as `66.5K`; under 1K the raw count shows.
         */
        const arenaTok = (n) => {
            const mtok = Number((n / 1e6).toFixed(2));
            if (mtok >= 1)
                return `${mtok}M`;
            const k = Number((n / 1e3).toFixed(1));
            return k >= 1 ? `${k}K` : String(Math.round(n));
        };
        /** `+14.33%` / `-1.20%` — the pareto view signs its figures. */
        const arenaSignPct = (v) => (v >= 0 ? '+' : '') + arenaPct(v);
        /**
         * The active projection's X figure for one row: the percentile column the
         * site's task-length filter asks for, falling back to the median (a
         * cached answer from before those fields shipped has neither). Null means
         * the row cannot place — unpriced, or no token sample.
         */
        function arenaXOf(row, metric, pct) {
            if (metric === 'tokens') {
                const m = (pct === '25' ? row.tokensM25 : pct === '95' ? row.tokensM95 : null) ?? row.tokensM;
                return m != null ? m * 1e6 : null;
            }
            // The trailing `?? null` keeps the contract exact: a row shape without
            // the field at all is as unplaceable as one carrying null.
            return (pct === '25' ? row.costUsd25 : pct === '95' ? row.costUsd95 : null) ?? row.costUsd ?? null;
        }
        /**
         * The site's per-(projection, percentile) axis label. ONE string serves
         * both the frontier chart's foot line and the per-task card's sub-line —
         * on the site they are the same `xValueLabel` + `windowLabel` pair
         * ("Median output tokens" + " (last 14 days)"), so p95 reads
         * "Long-task output tokens, P95 (last 14 days)" in both places.
         */
        function arenaAxisLabel(t, metric, pct) {
            const key = (metric === 'tokens' ? 'arenaAxisTokens' : 'arenaAxisCost')
                + (pct === '25' ? 'P25' : pct === '95' ? 'P95' : '');
            return t[key] + t.arenaWindow14;
        }
        /** `the median` / `the 25th percentile` — the ⓘ sentence's subject. */
        function arenaStatNoun(t, pct) {
            return t[pct === '25' ? 'arenaStatP25' : pct === '95' ? 'arenaStatP95' : 'arenaStatMedian'];
        }
        /**
         * Org → brand-palette scatter swatch, matching the site's
         * `hsl(var(--brand-{color}-{n}))` picks as rendered today.
         */
        const ARENA_SCATTER_COLOR = {
            Anthropic: 'teal', OpenAI: 'blue8', Google: 'yellow', DeepSeek: 'blue7',
            Meta: 'blue8', SpaceXAI: 'neutral7', Tencent: 'blue6', 'Z.ai': 'neutral6',
            Moonshot: 'yellow7', StepFun: 'blue5', Alibaba: 'blue5', Mistral: 'blue5',
            MiniMax: 'yellow8', Upstage: 'red', Xiaomi: 'neutral6',
        };
        /**
         * Per-task card — the second block of the site's pareto page: a header
         * (title + ⓘ popover, sub-line), a right-side legend chip + Sort menu,
         * and the priced models as horizontal bars. It is projection-aware, not
         * cost-only: the site renders the SAME component with `kind: cost |
         * output-mtok`, so the Cost | Output Tokens tab swaps the title
         * ("Cost per Task" → "Output Tokens per Task"), the sub-line, every
         * figure, the bar scale, the Sort options, the ⓘ sentence, and the
         * frontier the Pareto-optimal filter narrows to. Bars scale to the
         * column max of the ACTIVE projection (verified against the site's own
         * inline rect widths, e.g. 66.5K of a 227K max = 29.3124%). The width is
         * the inline SVG rect trick the site uses (hsl(var(--brand-green-8)) — a
         * darker green than the frontier line); frontier members get the green
         * rank tile. Rows render in full — the site hides the tail behind a
         * "+ Show N more" expander, the maintainer wants it expanded.
         */
        function ArenaCostList({ t, rows, metric, pct, xOf }) {
            // The same xOf the chart sweeps, so the card's figures, its bar scale
            // and its Pareto filter can never disagree with the frontier above it.
            const priced = rows.filter((row) => xOf(row) != null && row.value != null);
            const [sort, setSort] = useState('ranking');
            const [open, setOpen] = useState(false);
            const [onlyFront, setOnlyFront] = useState(false);
            const onFrontier = new Set(arenaFrontier(rows, xOf).map((row) => row.model));
            const pool = onlyFront ? priced.filter((row) => onFrontier.has(row.model)) : priced;
            // The list always renders in full — the site hides rows behind a
            // "+ Show N more" toggle, but the maintainer wants it expanded so the
            // Pareto-optimal filter reads as the whole frontier, not a window.
            const sorted = [...pool].sort((a, b) => {
                if (sort === 'cost-desc')
                    return xOf(b) - xOf(a);
                if (sort === 'cost-asc')
                    return xOf(a) - xOf(b);
                return (a.rank - b.rank) || (b.value - a.value);
            });
            const max = Math.max(0.0001, ...priced.map((row) => xOf(row)));
            const TRACK = 404; // px — the site's rect tops out at 404 inside a ~508 svg
            const barW = (x) => Math.max(4, (x / max) * TRACK);
            const tokens = metric === 'tokens';
            /** `$1.11/任务` or `61.1K/任务` — one figure per row, both projections. */
            const fig = (row) => (tokens ? arenaTok(xOf(row)) : arenaUsd(xOf(row))) + t.arenaPerTask;
            const sortItems = [
                ['ranking', t.arenaSortRanking],
                ['cost-desc', tokens ? t.arenaSortTokensDesc : t.arenaSortCostDesc],
                ['cost-asc', tokens ? t.arenaSortTokensAsc : t.arenaSortCostAsc],
            ];
            return h('div', { className: 'osubs-acostcard' }, h('div', { className: 'osubs-acost-head' }, h('div', { className: 'osubs-acost-titlebox' }, h('h3', { className: 'osubs-acost-title' }, tokens ? t.arenaCostTitleTokens : t.arenaCostTitle, 
            // The site's ⓘ is a Radix tooltip: a short trigger label plus a
            // projection- AND percentile-aware sentence ("Each bar shows the
            // 95th percentile across a model's priced tasks").
            h('button', {
                className: 'osubs-acost-info',
                'aria-label': tokens ? t.arenaCostInfoTokensLabel : t.arenaCostInfoLabel,
                title: fill(tokens ? t.arenaCostInfoTokens : t.arenaCostInfo, { stat: arenaStatNoun(t, pct) }),
            }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, h('circle', { cx: 12, cy: 12, r: 10 }), h('path', { d: 'M12 16v-4' }), h('path', { d: 'M12 8h.01' })))), h('p', { className: 'osubs-acost-sub' }, arenaAxisLabel(t, metric, pct))), h('div', { className: 'osubs-acost-tools' }, 
            // the site's "Pareto optimal" chip is a filter toggle
            // (aria-pressed + data-slot=tooltip-trigger), not a label —
            // pressing it narrows the list to frontier members only.
            h('button', {
                type: 'button',
                className: `osubs-acost-legend${onlyFront ? ' osubs-acost-legend--on' : ''}`,
                'aria-pressed': onlyFront,
                onClick: () => setOnlyFront((v) => !v),
            }, h('i', { 'aria-hidden': 'true' }), t.arenaCostLegend), h('div', { className: 'osubs-acost-sort' }, h('button', {
                className: 'osubs-acost-sortbtn', 'aria-haspopup': 'menu', 'aria-expanded': open,
                onClick: () => setOpen((o) => !o),
            }, `${t.arenaSortPrefix ?? 'Sort'}: ${sortItems.find(([id]) => id === sort)?.[1]}`, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M6 9l6 6 6-6' }))), open && h('div', { className: 'osubs-acost-menu', role: 'menu' }, sortItems.map(([id, label]) => h('button', {
                key: id, role: 'menuitem',
                className: `osubs-acost-item${sort === id ? ' osubs-acost-item--on' : ''}`,
                onClick: () => { setSort(id); setOpen(false); },
            }, label)))))), h('div', { className: 'osubs-acost-list' }, sorted.map((row, i) => h('div', { className: 'osubs-acost-row', key: `${i}-${row.model}` }, h('span', { className: `osubs-acost-num${onFrontier.has(row.model) ? ' osubs-acost-num--front' : ''}` }, String(i + 1)), h(ArenaMark, { org: row.org }), h('span', { className: 'osubs-acost-name', title: row.model }, row.url
                ? h('a', { className: 'osubs-acost-link', href: row.url, target: '_blank', rel: 'noreferrer' }, row.model)
                : row.model), h('span', { className: 'osubs-acost-figs osubs-acost-figs--side' }, h('span', { className: 'osubs-acost-usd' }, fig(row)), h('span', { className: `osubs-acost-pct${row.value < 0 ? ' osubs-acost-pct--bad' : ''}` }, arenaSignPct(row.value))), h('span', { className: 'osubs-acost-track' }, h('svg', { className: 'osubs-acost-svg', 'aria-hidden': 'true' }, h('rect', { x: 0, y: 6, height: 32, rx: 2, width: barW(xOf(row)) })), h('span', { className: 'osubs-acost-bar', style: { width: `${(xOf(row) / max) * 100}%` } }), h('span', { className: 'osubs-acost-figs osubs-acost-figs--float', style: { left: `${barW(xOf(row)) + 8}px` } }, h('span', { className: 'osubs-acost-usd' }, fig(row)), h('span', { className: `osubs-acost-pct${row.value < 0 ? ' osubs-acost-pct--bad' : ''}` }, arenaSignPct(row.value))))))));
        }
        /**
         * 帕累托 view — the board's Pareto Frontier, charted from the snapshot +
         * costStats payload, to the layout measured on the live page
         * (docs/error.md 2026-10-09).
         *
         * The site draws the chart as a fixed-pixel 788×380 svg (no viewBox)
         * sitting inside a relatively-positioned wrapper; everything but the
         * grid + green polyline is HTML absolutely positioned over it:
         *   - the plot area is (80, 30) → (768, 310), i.e. left margin 80 (Y
         *     ticks at x=-8 relative to the plot's own coordinate system),
         *     top margin 30 (X ticks at y=19 below the plot's bottom),
         *   - background scatters: 8×8 squares at `left:{px-4} top:{py-4}` in
         *     a `overflow-hidden` layer cropped to the plot (44 non-frontier
         *     priced rows), each in `hsl(var(--brand-{color}-{n}))` by org,
         *     opacity .7 — they're HTML divs, not svg circles,
         *   - frontier markers: 28×28 white squares with a 2px rgb(64,184,65)
         *     border and the org icon inside, absolute at `{px-14, py-14}`,
         *     inside a second absolute layer offset (-18, -18) so labels can
         *     overflow the plot top,
         *   - chip labels share the marker layer: sans 10px, centred ~40px
         *     above the marker, lane-shifted when they'd collide, dropped
         *     when no lane fits — the site drops 2 of today's 8,
         *   - the green polyline itself runs through the marker centres and
         *     leads 10px past both plot edges, 2.5px rgb(64,184,65) stroke.
         *   - X ticks ($0.05..$5) are drawn BELOW the plot at svg y≈349
         *     (i.e. `T + PH + 39`), not on top — the earlier "top axis"
         *     reading confused the marker-layer offset for tick position.
         *
         * We keep the svg at fixed 788×380 with no viewBox so a narrow pane
         * letterboxes it like the site's own card (which clips on small
         * viewports rather than rescaling).
         */
        function ArenaPareto({ t, rows }) {
            const [hovered, setHovered] = useState(null); // row ref for the tooltip card
            // The site's X-metric toggle: Cost (USD/task) vs Output Tokens
            // (median output tokens/task, in raw token count from tokensM*1e6).
            // Switching re-derives the frontier — a cheaper-token model is a
            // different winner than a cheaper-dollar one.
            const [metric, setMetric] = useState('cost');
            // The site's task-length dropdown: 25th / 50th / 95th percentile. It
            // only re-keys the X figure — cheaper-at-p25 reshuffles the frontier
            // the same way the metric tab does.
            const [pct, setPct] = useState('50');
            const [pctOpen, setPctOpen] = useState(false);
            // The stored zoom window is in the old metric's log10 space — carrying
            // it across a switch would map dollar ticks onto token ticks. Also
            // re-derives the frontier via the new xOf below.
            const pickMetric = (id) => { setMetric(id); setWin(null); setHovered(null); };
            const pickPct = (id) => { setPct(id); setPctOpen(false); setWin(null); setHovered(null); };
            // Zoom state: the visible X window in log10 space. The full dataset
            // domain is [fullLo, fullHi]; [lo, hi] is the current window the site
            // narrows on ⌘scroll / +/- / drag-pan (an @visx/zoom-style transform).
            const [win, setWin] = useState(null); // null = full extent
            const dragRef = useRef(null);
            const svgRef = useRef(null);
            const wrapRef = useRef(null); // .osubs-apwrap — read its clamped width for tooltip edge-flip
            // The percentile re-keys the X figure — but a stale cache from before
            // the fields shipped has none of them. arenaXOf falls back to P50 rather
            // than emptying `priced` and crashing on the frontier sweep.
            const xOf = (row) => arenaXOf(row, metric, pct);
            const front = arenaFrontier(rows, xOf);
            if (front.length === 0)
                return h('p', { className: 'osubs-hint' }, t.arenaParetoEmpty);
            const priced = rows.filter((row) => xOf(row) != null && row.value != null);
            const fullLo = Math.log10(Math.min(...priced.map((row) => xOf(row))) * 0.7);
            const fullHi = Math.log10(Math.max(...priced.map((row) => xOf(row))) * 1.3);
            const lo = win ? win[0] : fullLo;
            const hi = win ? win[1] : fullHi;
            // Clamp a candidate window so it never zooms out past the full extent
            // and never collapses narrower than ~5% of it.
            const clampWin = (a, b) => {
                const MIN = (fullHi - fullLo) * 0.05;
                let w = b - a;
                if (w < MIN) {
                    const c = (a + b) / 2;
                    a = c - MIN / 2;
                    b = c + MIN / 2;
                    w = MIN;
                }
                const W = fullHi - fullLo;
                if (w >= W)
                    return null; // back to full extent
                if (a < fullLo) {
                    b += fullLo - a;
                    a = fullLo;
                }
                if (b > fullHi) {
                    a -= b - fullHi;
                    b = fullHi;
                }
                if (a < fullLo) {
                    a = fullLo;
                }
                if (b > fullHi) {
                    b = fullHi;
                }
                return [a, b];
            };
            const zoomAt = (factor, lx) => {
                // factor>1 zooms in (shrinks the window) centred on log-coordinate lx.
                setWin((cur) => {
                    const a = cur ? cur[0] : fullLo, b = cur ? cur[1] : fullHi;
                    return clampWin(lx - (lx - a) / factor, lx + (b - lx) / factor);
                });
            };
            const panBy = (dlx) => setWin((cur) => {
                const a = cur ? cur[0] : fullLo, b = cur ? cur[1] : fullHi;
                return clampWin(a + dlx, b + dlx);
            });
            // Per-metric tick ladder + axis/tick formatting. Cost uses the $ ladder
            // the site ships; tokens log-scale over K/M magnitudes.
            const METRIC = metric === 'tokens'
                ? { ladder: [1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6], fmt: arenaTok, axis: t.arenaMetricTokens }
                : { ladder: [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20], fmt: arenaUsd, axis: t.arenaMetricCost };
            const ticks = METRIC.ladder.filter((v) => {
                const l = Math.log10(v);
                return l >= lo - 1e-9 && l <= hi + 1e-9;
            });
            const vLo = Math.min(0, ...priced.map((row) => row.value));
            const vHi = Math.max(0, ...priced.map((row) => row.value));
            const yMin = vLo - Math.abs(vLo) * 0.34;
            const yMax = vHi + Math.abs(vHi) * 0.947;
            const yStep = [0.05, 0.1, 0.2, 0.25, 0.5, 1].find((s) => (yMax - yMin) / s <= 9) ?? 1;
            const yTicks = [];
            for (let v = Math.ceil(yMin / yStep - 1e-9) * yStep; v <= yMax + 1e-9; v += yStep) {
                yTicks.push(Math.round(v * 1e9) / 1e9);
            }
            // Plot rect matches the site exactly: (80,30) → (768,310) inside a
            // 788×380 svg. X ticks live at y=349 (below the plot).
            const W = 788, H = 380, L = 80, T = 30, PW = 688, PH = 280;
            const R = L + PW, B = T + PH;
            // X is a reversed log scale over the *current window* [lo,hi].
            const px = (c) => L + (hi - Math.log10(Math.max(c, Math.pow(10, lo)))) / (hi - lo) * PW;
            const py = (v) => T + (yMax - v) / (yMax - yMin) * PH;
            // Convert an svg pixel-x back to a log10 cost — the wheel-zoom anchor.
            const lxAt = (pxv) => hi - ((pxv - L) / PW) * (hi - lo);
            const svgX = (clientX) => {
                const r = svgRef.current && svgRef.current.getBoundingClientRect();
                return r ? (clientX - r.left) * (W / r.width) : L + PW / 2;
            };
            const onWheel = (e) => {
                e.preventDefault();
                const f = Math.exp(-(e.deltaY || 0) * 0.0022);
                zoomAt(f, lxAt(svgX(e.clientX)));
            };
            const onDown = (e) => {
                dragRef.current = { x: e.clientX };
                if (e.currentTarget.setPointerCapture)
                    try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                    }
                    catch { }
            };
            const onMove = (e) => {
                const d = dragRef.current;
                if (!d)
                    return;
                const dxPx = e.clientX - d.x;
                if (dxPx === 0)
                    return;
                d.x = e.clientX;
                const r = svgRef.current && svgRef.current.getBoundingClientRect();
                const scale = r ? W / r.width : 1;
                panBy((dxPx * scale / PW) * (hi - lo));
            };
            const onUp = () => { dragRef.current = null; };
            // A data point is visible when its cost falls inside the current window.
            const inWin = (c) => { const l = Math.log10(c); return l >= lo - 1e-9 && l <= hi + 1e-9; };
            const placed = front.filter((row) => inWin(xOf(row)))
                .map((row) => ({ row, x: px(xOf(row)), y: py(row.value) })).sort((a, b) => b.x - a.x);
            // Frontier line spans all points (so the curve stays continuous across
            // the clip edge) but is clipped to the plot rect; endpoints lead out.
            const allPlaced = front.map((row) => ({ row, x: px(xOf(row)), y: py(row.value) })).sort((a, b) => b.x - a.x);
            const leftEnd = allPlaced[allPlaced.length - 1], rightEnd = allPlaced[0];
            // Chip labels: sans 10px, centred ~40px above their marker. The
            // frontier line and already-placed chips block lanes; a blocked chip
            // steps up in 23px lanes, falls to 30px below its marker, and is
            // dropped when neither fits — the site's own chart drops two of
            // today's eight this way.
            const CHIP_H = 21, LANE = 23;
            const chipW = (name) => name.length * 5.4 + 12;
            const segs = [[L - 10, leftEnd.y, leftEnd.x, leftEnd.y]];
            for (let i = 0; i < placed.length - 1; i++)
                segs.push([placed[i].x, placed[i].y, placed[i + 1].x, placed[i + 1].y]);
            segs.push([rightEnd.x, rightEnd.y, R + 10, rightEnd.y]);
            const lineHits = (x1, y1, x2, y2) => segs.some(([sx1, sy1, sx2, sy2]) => {
                for (let i = 0; i <= 12; i++) {
                    const f = i / 12;
                    const x = sx1 + (sx2 - sx1) * f, y = sy1 + (sy2 - sy1) * f;
                    if (x >= x1 - 2 && x <= x2 + 2 && y >= y1 - 2 && y <= y2 + 2)
                        return true;
                }
                return false;
            });
            const chips = [];
            for (const p of [...placed].reverse()) {
                const w = chipW(p.row.model);
                const cx = Math.min(Math.max(p.x, L + w / 2 + 2), R - w / 2 - 2);
                const rect = (top) => ({ x1: cx - w / 2, x2: cx + w / 2, y1: top, y2: top + CHIP_H });
                const free = (r) => !lineHits(r.x1, r.y1, r.x2, r.y2)
                    && !chips.some((c) => r.x1 < c.x2 - 1 && c.x1 < r.x2 - 1 && Math.abs(r.y1 - c.y1) < LANE);
                let top = null;
                if (free(rect(p.y - 40)))
                    top = p.y - 40;
                else {
                    for (let ty = p.y - 40 - LANE; ty >= T - 18 && top === null; ty -= LANE)
                        if (free(rect(ty)))
                            top = ty;
                    for (let ty = p.y + 30; ty + CHIP_H <= B + 18 && top === null; ty += LANE)
                        if (free(rect(ty)))
                            top = ty;
                }
                if (top === null)
                    continue;
                chips.push({ ...rect(top), cx, p });
            }
            const pctTick = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
            // Marker layer is offset (-18, -18) from the scatter layer (62, 12)
            // — chips can rise 18px above the plot top and dip 18px past the
            // bottom before colliding with the axis band.
            const ML = L - 18, MT = T - 18;
            const chart = h('div', { className: 'osubs-apwrap', ref: wrapRef }, h('svg', {
                // viewBox keeps the 788×380 logical coordinate system so px/py and
                // the HTML overlay offsets stay unchanged — the browser scales the
                // whole thing down when the column is narrower (the site clips at
                // narrow widths; scaling is the same data, just legible).
                className: 'osubs-apchart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t.arenaParetoSub,
                ref: svgRef, onWheel: onWheel, onDoubleClick: () => setWin(null),
                onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerLeave: onUp,
            }, yTicks.map((v) => h('line', { key: `gy${v}`, className: 'osubs-apgrid', x1: L, x2: R, y1: py(v), y2: py(v) })), ticks.map((c) => h('line', { key: `gx${c}`, className: 'osubs-apgrid', x1: px(c), x2: px(c), y1: T, y2: B })), h('line', { className: 'osubs-apaxis', x1: L, x2: R, y1: T, y2: T }), h('line', { className: 'osubs-apaxis', x1: L, x2: L, y1: T, y2: B }), yTicks.map((v) => h('g', { key: `y${v}` }, h('line', { className: 'osubs-apaxis', x1: L - 8, x2: L, y1: py(v), y2: py(v) }), h('text', { className: 'osubs-aptick', x: L - 12, y: py(v) + 4, textAnchor: 'end' }, pctTick(v)))), ticks.map((c) => h('g', { key: `x${c}` }, h('line', { className: 'osubs-apaxis', x1: px(c), x2: px(c), y1: B, y2: B + 8 }), h('text', { className: 'osubs-aptick', x: px(c), y: B + 19, textAnchor: 'middle' }, METRIC.fmt(c)))), 
            // Clip the frontier to the plot rect so zoomed/panned edges slide
            // off cleanly instead of over-drawing the axes.
            h('defs', null, h('clipPath', { id: 'apclip' }, h('rect', { x: L, y: T, width: PW, height: PH }))), h('g', { clipPath: 'url(#apclip)' }, h('polyline', { className: 'osubs-apline', points: allPlaced.map((p) => `${p.x},${p.y}`).join(' ') }), h('line', { className: 'osubs-apline', x1: L - 10, x2: leftEnd.x, y1: leftEnd.y, y2: leftEnd.y }), h('line', { className: 'osubs-apline', x1: rightEnd.x, x2: R + 10, y1: rightEnd.y, y2: rightEnd.y })), 
            // The site draws a visible r=5 green dot at every frontier point —
            // not an invisible hot-spot. The white marker tile sits on top of it.
            placed.map(({ row, x, y }) => h('circle', {
                key: row.model, className: 'osubs-aphot', cx: x, cy: y, r: 5, fill: '#40b841',
                onMouseEnter: () => setHovered({ row, x, y }),
                onMouseLeave: () => setHovered((cur) => cur?.row === row ? null : cur),
            }))), 
            // Background scatter layer: 8×8 org-colored squares, one per
            // non-frontier priced model, clipped to the plot area. Hover lifts
            // one to scale(1.8) + opacity 1 and pops the tooltip card.
            // left/top are percentages of the wrap so the squares stay glued to
            // their data point when the viewBox shrinks below 788px.
            h('div', { className: 'osubs-apscat', 'aria-hidden': 'true' }, priced.filter((row) => !front.includes(row) && inWin(xOf(row))).map((row) => h('span', {
                key: row.model, className: `osubs-apsc osubs-apsc--${ARENA_SCATTER_COLOR[row.org] ?? 'neutral'}`,
                style: { left: `${((px(xOf(row)) - L) / PW) * 100}%`, top: `${((py(row.value) - T) / PH) * 100}%` },
                onMouseEnter: () => setHovered({ row, x: px(xOf(row)), y: py(row.value) }),
                onMouseLeave: () => setHovered((cur) => cur?.row === row ? null : cur),
            }))), 
            // Marker layer: 28×28 white tiles with a 2px green border and the
            // org icon inside, centred on each frontier point. Hover lifts them
            // to scale(1.15). The layer is offset -18/-18 so chip labels can
            // rise above the plot top.
            h('div', { className: 'osubs-apmark', 'aria-hidden': 'true' }, placed.map(({ row, x, y }) => h('span', {
                key: row.model, className: 'osubs-apmk',
                // Centre on the data point inside the -18/-18-offset layer:
                // left/top is the point's percentage of the layer's 724×316 box
                // and translate(-50%,-50%) drops the tile centre onto it.
                style: { left: `${((x - ML) / 724) * 100}%`, top: `${((y - MT) / 316) * 100}%` },
                onMouseEnter: () => setHovered({ row, x, y }),
                onMouseLeave: () => setHovered((cur) => cur?.row === row ? null : cur),
            }, h(ArenaMark, { org: row.org }))), 
            // Site draws a dashed green leader from each chip back to its
            // marker when the label is knocked out of the default centred spot.
            // Leader line: 1px dashed run from the marker down to the bottom of
            // a displaced chip (site draws these so a bumped label still reads
            // as its point). Heights/offsets are layer (724×316) percentages.
            chips.map((c) => h('span', {
                key: `lead-${c.p.row.model}`, className: 'osubs-aplead', 'aria-hidden': 'true',
                style: {
                    left: `${((c.cx - ML) / 724) * 100}%`, top: `${((c.p.y - MT) / 316) * 100}%`,
                    height: `${(Math.max(0, c.y1 + CHIP_H - c.p.y - 2) / 316) * 100}%`,
                },
            })), chips.map((c) => h('span', {
                key: `lab-${c.p.row.model}`, className: 'osubs-aplab',
                style: { left: `${((c.cx - ML) / 724) * 100}%`, top: `${((c.y1 - MT) / 316) * 100}%` },
            }, c.p.row.model))), 
            // Tooltip card — 18px icon + name(sm medium) + org·license(xs) +
            // Score/Cost row, anchored centred horizontally on the point and
            // ~10px above it. The wrap clips at the card edge, so near the
            // left/right rim we shift the anchor to keep the ~220px card inside
            // the wrap; near the top we flip below.
            hovered && h('div', {
                className: `osubs-aptip${hovered.y < 90 ? ' osubs-aptip--below' : ''}`, role: 'tooltip',
                style: (() => {
                    // Keep the ~220px card inside the *visible* wrap — the wrap clips
                    // at the column edge, so use its rendered width, not the svg's 788.
                    // hovered.x/y are viewBox coords; scale to the rendered wrap.
                    const wrapW = wrapRef.current ? wrapRef.current.clientWidth : W;
                    const wrapH = wrapRef.current ? wrapRef.current.clientHeight : H;
                    const HALF = 110 + 8; // half card + edge pad
                    const cx = Math.min(Math.max(hovered.x * (wrapW / W), HALF), Math.max(HALF, wrapW - HALF));
                    return { left: `${cx}px`, top: `${hovered.y * (wrapH / H)}px` };
                })(),
            }, h(ArenaMark, { org: hovered.row.org }), h('div', { className: 'osubs-aptip-body' }, h('p', { className: 'osubs-aptip-name' }, hovered.row.model), h('p', { className: 'osubs-aptip-org' }, [hovered.row.org, hovered.row.license].filter(Boolean).join(' · ')), h('p', { className: 'osubs-aptip-figs' }, h('span', null, `${t.arenaScore}: `, h('b', { className: 'osubs-aptip-pos' }, arenaSignPct(hovered.row.value))), h('span', null, `${metric === 'tokens' ? t.arenaMetricTokens : t.arenaCostPerTask}: `, metric === 'tokens' ? arenaTok(xOf(hovered.row)) : arenaUsd(xOf(hovered.row)))))));
            // The site's list below the chart is the frontier itself, ranked by
            // improvement: a green timeline of square nodes with the model, its
            // org·license line, and value/cost on the right. It carries its own
            // "Pareto Optimal Models" heading — and on the site BOTH the sub-line
            // (Net Improvement x Cost/task → x Output tokens) and the right-hand
            // figure follow the metric tab (28.8K/task vs $1.77/task).
            const ranked = [...front].sort((a, b) => b.value - a.value);
            const fig = (row) => metric === 'tokens'
                ? `${arenaTok(xOf(row))}${t.arenaPerTask}`
                : `${arenaUsd(xOf(row))}${t.arenaPerTask}`;
            const list = h('aside', { className: 'osubs-apside' }, h('header', { className: 'osubs-aphead osubs-aphead--side' }, h('div', { className: 'osubs-aphead-l' }, h('span', { className: 'osubs-aptitle' }, t.arenaOptimalTitle), h('span', { className: 'osubs-apsub' }, fill(t.arenaOptimalSub, { n: metric === 'tokens' ? t.arenaMetricTokens : t.arenaMetricCostAxis })))), h('div', { className: 'osubs-aplist' }, ranked.map((row, i) => h('div', { className: 'osubs-aprow', key: row.model }, h('span', { className: 'osubs-apnode', 'aria-hidden': 'true' }, i < ranked.length - 1 && h('i', null)), h(ArenaMark, { org: row.org }), h('span', { className: 'osubs-apwho' }, row.url
                ? h('a', { className: 'osubs-apname', href: row.url, target: '_blank', rel: 'noreferrer', title: row.model }, row.model)
                : h('span', { className: 'osubs-apname', title: row.model }, row.model), h('span', { className: 'osubs-apsub' }, [row.org, row.license].filter(Boolean).join(' · '))), h('span', { className: 'osubs-apfigs' }, h('span', { className: `osubs-apval${row.value < 0 ? ' osubs-apval--bad' : ''}` }, arenaSignPct(row.value)), h('span', { className: 'osubs-apcost' }, fig(row)))))));
            return h('div', { className: 'osubs-aparetto' }, 
            // The site puts chart and optimal list side-by-side inside ONE card:
            // a flex row — chart column (flex-1) on the left, a fixed-width
            // (w-72) optimal-list column on the right, collapsing to stacked on
            // narrow panes (@4xl breakpoint).
            h('div', { className: 'osubs-aptwo' }, h('div', { className: 'osubs-apmain' }, h('header', { className: 'osubs-aphead' }, h('div', { className: 'osubs-aphead-l' }, h('span', { className: 'osubs-aptitle' }, t.arenaParetoTitle), h('span', { className: 'osubs-apsub' }, metric === 'tokens' ? t.arenaParetoSubTokens : t.arenaParetoSub)), 
            // The site's chart chrome: a ⌘-scroll hint chip plus a +/−
            // zoom pair. Zoom rescales only the X (cost) log-domain;
            // ⌘scroll / pinch zooms at the pointer, drag pans, dbl-click resets.
            h('div', { className: 'osubs-apctrl' }, 
            // The site's X-metric segmented control: role=tab +
            // aria-selected, sitting left of the zoom chrome. Switching
            // re-derives the frontier and resets the zoom window.
            h('span', { className: 'osubs-apmetric', role: 'tablist' }, [['cost', t.arenaMetricCost], ['tokens', t.arenaMetricTokens]].map(([id, label]) => h('button', {
                key: id, type: 'button', role: 'tab',
                className: `osubs-apmetab${metric === id ? ' osubs-apmetab--on' : ''}`,
                'aria-selected': metric === id,
                onClick: () => pickMetric(id),
            }, label))), 
            // The site's task-length dropdown — same Radix menu pattern
            // as the cost card's sort button. Each option carries a
            // sub-line (Shorter/Median/Longer tasks).
            h('span', { className: 'osubs-acost-sort osubs-appct' }, h('button', {
                type: 'button', className: 'osubs-acost-sortbtn',
                'aria-haspopup': 'menu', 'aria-expanded': pctOpen, 'aria-label': t.arenaPctLabel,
                onClick: () => setPctOpen((o) => !o),
            }, t[`arenaPct${pct}`], h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M6 9l6 6 6-6' }))), pctOpen && h('div', { className: 'osubs-acost-menu', role: 'menu' }, [['25', t.arenaPct25, t.arenaPct25Sub], ['50', t.arenaPct50, t.arenaPct50Sub], ['95', t.arenaPct95, t.arenaPct95Sub]].map(([id, label, sub]) => h('button', {
                key: id, role: 'menuitem',
                className: `osubs-acost-item osubs-appct-item${pct === id ? ' osubs-acost-item--on' : ''}`,
                onClick: () => pickPct(id),
            }, h('span', { className: 'osubs-appct-tick', 'aria-hidden': 'true' }, pct === id ? '✓' : ''), h('span', { className: 'osubs-appct-lines' }, h('span', { className: 'osubs-appct-name' }, label), h('span', { className: 'osubs-appct-sub' }, sub)))))), h('span', { className: 'osubs-apscroll' }, h('kbd', { className: 'osubs-apkbd' }, '⌘'), t.arenaScrollHint), h('span', { className: 'osubs-apzoom' }, h('button', {
                type: 'button', className: 'osubs-apzoomb', 'aria-label': t.arenaZoomIn,
                onClick: () => zoomAt(1.4, (lo + hi) / 2),
            }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M12 5v14M5 12h14' }))), h('button', {
                type: 'button', className: 'osubs-apzoomb', 'aria-label': t.arenaZoomOut,
                onClick: () => zoomAt(1 / 1.4, (lo + hi) / 2),
            }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M5 12h14' })))))), chart, 
            // The site draws the axis caption under the plot from the same
            // (projection, percentile) label the per-task card's sub-line
            // uses — one string, two places.
            h('p', { className: 'osubs-apfoot' }, arenaAxisLabel(t, metric, pct))), list), 
            // The per-task card follows the SAME projection: swapping Cost for
            // Output Tokens re-renders its title, sub-line, figures, bar scale,
            // Sort labels, ⓘ sentence and frontier filter.
            h(ArenaCostList, { t, rows, metric, pct, xOf }));
        }
        /**
         * Org marks — real svg inner markup pulled from the arena.ai leaderboard
         * (docs/error.md 2026-10-09 第七次追加). Each entry is `viewBox` + the
         * verbatim child elements of the site's icon svg. Gradient/clipPath
         * ids are rewritten to a per-org stable key (`ag-{org}`) so two
         * different orgs can't collide on React's `_r_*_` ids.
         */
        const ARENA_EXTRA_MARKS = {
            Anthropic: { viewBox: '0 0 24 24', raw: '<path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"></path>' },
            DeepSeek: { viewBox: '0 0 24 24', raw: '<path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" fill="#4D6BFE"></path>' },
            'Z.ai': { viewBox: '0 0 1000 1000', raw: '<rect width="1000" height="1000" rx="151.97" fill="#000000" class="fill-black dark:fill-white"></rect><path d="M517.21,207.58l-48.19,68.5c-7.57,10.67-19.97,17.21-33.39,17.21H172.99v-86.06C172.99,207.58,517.21,207.58,517.21,207.58z" fill="#ffffff" class="fill-white dark:fill-black"></path><path d="M844.22,207.58L431.16,792.76H155.78L568.84,207.58H844.22z" fill="#ffffff" class="fill-white dark:fill-black"></path><path d="M482.79,792.76l48.54-68.84c7.57-10.67,19.97-17.21,33.39-17.21h262.3v86.06H482.79z" fill="#ffffff" class="fill-white dark:fill-black"></path>' },
            OpenAI: { viewBox: '0 0 16 16', raw: '<path d="M14.9449 6.54871C15.3128 5.45919 15.1861 4.26567 14.5978 3.27464C13.7131 1.75461 11.9345 0.972595 10.1974 1.3406C9.42464 0.481584 8.3144 -0.00692594 7.15045 7.42132e-05C5.37487 -0.00392587 3.79946 1.1241 3.2532 2.79113C2.11256 3.02164 1.12799 3.72615 0.551837 4.72468C-0.339497 6.24071 -0.1363 8.15175 1.05451 9.45178C0.686626 10.5413 0.813308 11.7348 1.40162 12.7258C2.28637 14.2459 4.06498 15.0279 5.80204 14.6599C6.5743 15.5189 7.68504 16.0074 8.849 15.9999C10.6256 16.0044 12.2015 14.8754 12.7478 13.2069C13.8884 12.9764 14.873 12.2718 15.4491 11.2733C16.3394 9.75728 16.1357 7.84774 14.9454 6.54771L14.9449 6.54871ZM8.85001 14.9544C8.13907 14.9554 7.45043 14.7099 6.90468 14.2604C6.92951 14.2474 6.97259 14.2239 7.00046 14.2069L10.2293 12.3668C10.3945 12.2743 10.4959 12.1008 10.4949 11.9133V7.42173L11.8595 8.19925C11.8742 8.20625 11.8838 8.22025 11.8858 8.23625V11.9558C11.8838 13.6099 10.5263 14.9509 8.85001 14.9544ZM2.32133 12.2028C1.9651 11.5958 1.8369 10.8843 1.95902 10.1938C1.98284 10.2078 2.02489 10.2333 2.05479 10.2503L5.28366 12.0903C5.44733 12.1848 5.65003 12.1848 5.81421 12.0903L9.75604 9.84429V11.3993C9.75705 11.4153 9.74945 11.4308 9.73678 11.4408L6.47295 13.3004C5.01915 14.1264 3.1625 13.6354 2.32184 12.2028H2.32133ZM1.47155 5.24819C1.82626 4.64017 2.38619 4.17516 3.05305 3.93366C3.05305 3.96116 3.05152 4.00966 3.05152 4.04366V7.72424C3.05051 7.91124 3.15186 8.08475 3.31654 8.17725L7.25838 10.4228L5.89376 11.2003C5.88008 11.2093 5.86285 11.2108 5.84765 11.2043L2.58331 9.34327C1.13255 8.51426 0.63494 6.68272 1.47104 5.24869L1.47155 5.24819ZM12.6834 7.82274L8.74157 5.57669L10.1062 4.79968C10.1199 4.79068 10.1371 4.78918 10.1523 4.79568L13.4166 6.65522C14.8699 7.48373 15.3681 9.31827 14.5284 10.7523C14.1732 11.3593 13.6138 11.8243 12.9474 12.0663V8.27575C12.9489 8.08875 12.8481 7.91574 12.6839 7.82274H12.6834ZM14.0414 5.8057C14.0176 5.7912 13.9756 5.7662 13.9457 5.7492L10.7168 3.90916C10.5531 3.81466 10.3504 3.81466 10.1863 3.90916L6.24442 6.15521V4.60017C6.2434 4.58417 6.251 4.56867 6.26367 4.55867L9.52751 2.70063C10.9813 1.87311 12.84 2.36563 13.6781 3.80066C14.0323 4.40667 14.1605 5.11618 14.0404 5.8057H14.0414ZM5.50257 8.57726L4.13744 7.79974C4.12275 7.79274 4.11312 7.77874 4.11109 7.76274V4.04316C4.11211 2.38713 5.47368 1.0451 7.15197 1.0461C7.86189 1.0461 8.54902 1.2921 9.09476 1.74011C9.06993 1.75311 9.02737 1.77661 8.99899 1.79361L5.77012 3.63365C5.60493 3.72615 5.50358 3.89916 5.50459 4.08666L5.50257 8.57626V8.57726ZM6.24391 7.00022L7.99972 5.9997L9.75553 6.99972V9.00027L7.99972 10.0003L6.24391 9.00027V7.00022Z"></path>' },
            Google: { viewBox: '0 0 24 24', raw: '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path><path d="M1 1h22v22H1z" fill="none"></path>' },
            SpaceXAI: { viewBox: '69 99 832 319', raw: '<path d="M900.551 99.7843C804.619 107.606 427.549 154.353 166.092 417.192H69.0684L79.9091 406.388C134.623 353.529 376.727 129.506 900.551 99.4932V99.7843Z"></path><path d="M572.178 417.192H496.133L346.301 308.126C360.108 299.443 374.004 291.173 387.943 283.297L572.178 417.192Z"></path><path d="M450.645 417.193H374.634L351.576 400.422H222.839C231.902 392.374 241.077 384.561 250.349 376.977H319.308L283.623 351.019C296.378 341.528 309.274 332.437 322.274 323.728L450.645 417.193Z"></path><path d="M173.984 216.084L232.598 258.681C218.01 267.271 204.357 275.774 191.613 284.091L98.0385 216.047L173.984 216.084Z"></path>' },
            Moonshot: { viewBox: '0 0 24 25', raw: '<path fill="#1783FF" d="M21.7202 0.939941C22.9502 0.939941 23.9502 1.93994 23.9502 3.16994C23.9502 4.39994 22.9502 5.39994 21.7202 5.39994H19.7502C19.6002 5.39994 19.4902 5.27994 19.4902 5.13994V3.16994C19.4902 1.93994 20.4902 0.939941 21.7202 0.939941Z"></path><path class="fill-black dark:fill-white" d="M9.39 13.9501L17.82 5.59012C17.98 5.43012 17.89 5.12012 17.68 5.12012H13.14C13.14 5.12012 13.04 5.14012 13 5.18012L3.92 14.1901C3.78 14.3301 3.57 14.2101 3.57 13.9801V5.39012C3.57 5.24012 3.47 5.12012 3.35 5.12012H0.219999C0.0999993 5.12012 0 5.24012 0 5.39012V23.9201C0 24.0701 0.0999993 24.1901 0.219999 24.1901H3.35C3.47 24.1901 3.57 24.0701 3.57 23.9201V20.1401C3.57 20.0601 3.6 19.9801 3.65 19.9301L6.47 17.1401C6.54 17.0701 6.63 17.0601 6.71 17.1101L14.24 22.6501C15.47 23.4801 16.85 23.9901 18.25 24.1401C18.37 24.1501 18.48 24.0301 18.48 23.8701V20.3101C18.48 20.1701 18.4 20.0601 18.29 20.0501C17.47 19.9201 16.66 19.6001 15.94 19.1101L9.42 14.3901C9.28 14.3001 9.27 14.0701 9.39 13.9501Z"></path>' },
            Meta: { viewBox: '0 0 24 24', raw: '<path d="M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z" fill="url(#ag-meta-meta-fill-0)"></path><path d="M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z" fill="url(#ag-meta-meta-fill-1)"></path><path d="M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z" fill="url(#ag-meta-meta-fill-2)"></path><path d="M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z" fill="url(#ag-meta-meta-fill-3)"></path><path d="M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z" fill="url(#ag-meta-meta-fill-4)"></path><path d="M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z" fill="url(#ag-meta-meta-fill-5)"></path><path d="M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z" fill="#0082FB"></path><path d="M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z" fill="url(#ag-meta-meta-fill-6)"></path><path d="M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z" fill="#0082FB"></path><path d="M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z" fill="url(#ag-meta-meta-fill-7)"></path><path d="M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z" fill="url(#ag-meta-meta-fill-8)"></path><path d="M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z" fill="url(#ag-meta-meta-fill-9)"></path><path d="M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z" fill="url(#ag-meta-meta-fill-10)"></path><path d="M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z" fill="url(#ag-meta-meta-fill-11)"></path><path d="M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z" fill="url(#ag-meta-meta-fill-12)"></path><defs><linearGradient id="ag-meta-meta-fill-0" x1="75.897%" x2="26.312%" y1="89.199%" y2="12.194%"><stop offset=".06%" stop-color="#0867DF"></stop><stop offset="45.39%" stop-color="#0668E1"></stop><stop offset="85.91%" stop-color="#0064E0"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-1" x1="21.67%" x2="97.068%" y1="75.874%" y2="23.985%"><stop offset="13.23%" stop-color="#0064DF"></stop><stop offset="99.88%" stop-color="#0064E0"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-2" x1="38.263%" x2="60.895%" y1="89.127%" y2="16.131%"><stop offset="1.47%" stop-color="#0072EC"></stop><stop offset="68.81%" stop-color="#0064DF"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-3" x1="47.032%" x2="52.15%" y1="90.19%" y2="15.745%"><stop offset="7.31%" stop-color="#007CF6"></stop><stop offset="99.43%" stop-color="#0072EC"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-4" x1="52.155%" x2="47.591%" y1="58.301%" y2="37.004%"><stop offset="7.31%" stop-color="#007FF9"></stop><stop offset="100%" stop-color="#007CF6"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-5" x1="37.689%" x2="61.961%" y1="12.502%" y2="63.624%"><stop offset="7.31%" stop-color="#007FF9"></stop><stop offset="100%" stop-color="#0082FB"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-6" x1="34.808%" x2="62.313%" y1="68.859%" y2="23.174%"><stop offset="27.99%" stop-color="#007FF8"></stop><stop offset="91.41%" stop-color="#0082FB"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-7" x1="43.762%" x2="57.602%" y1="6.235%" y2="98.514%"><stop offset="0%" stop-color="#0082FB"></stop><stop offset="99.95%" stop-color="#0081FA"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-8" x1="60.055%" x2="39.88%" y1="4.661%" y2="69.077%"><stop offset="6.19%" stop-color="#0081FA"></stop><stop offset="100%" stop-color="#0080F9"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-9" x1="30.282%" x2="61.081%" y1="59.32%" y2="33.244%"><stop offset="0%" stop-color="#027AF3"></stop><stop offset="100%" stop-color="#0080F9"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-10" x1="20.433%" x2="82.112%" y1="50.001%" y2="50.001%"><stop offset="0%" stop-color="#0377EF"></stop><stop offset="99.94%" stop-color="#0279F1"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-11" x1="40.303%" x2="72.394%" y1="35.298%" y2="57.811%"><stop offset=".19%" stop-color="#0471E9"></stop><stop offset="100%" stop-color="#0377EF"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-12" x1="32.254%" x2="68.003%" y1="19.719%" y2="84.908%"><stop offset="27.65%" stop-color="#0867DF"></stop><stop offset="100%" stop-color="#0471E9"></stop></linearGradient></defs>' },
            Xiaomi: { viewBox: '0 0 24 24', raw: '<rect x="2" y="2" width="20" height="20" rx="4.5" stroke="currentColor" stroke-width="1.5" fill="none"></rect><path d="M6.5 16V8.5H8.2L10.2 12.5L12.2 8.5H13.9V16H12.2V11.8L10.2 15.5L8.2 11.8V16H6.5Z" fill="currentColor"></path><path d="M15.3 10.2H17V16H15.3V10.2Z" fill="currentColor"></path><circle cx="16.15" cy="8.8" r="0.95" fill="currentColor"></circle>' },
            MiniMax: { viewBox: '0 0 24 24', raw: '<defs><linearGradient id="ag-minimax" x1="0%" x2="100.182%" y1="50.057%" y2="50.057%"><stop offset="0%" stop-color="#E2167E"></stop><stop offset="100%" stop-color="#FE603C"></stop></linearGradient></defs><path d="M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z" fill="url(#ag-minimax)" fill-rule="nonzero"></path>' },
            Mistral: { viewBox: '0 0 191 135', raw: '<g clip-path="url(#ag-mistral)"><path d="M54.3221 0H27.1531V27.0892H54.3221V0Z" fill="#FFD800"></path><path d="M162.984 0H135.815V27.0892H162.984V0Z" fill="#FFD800"></path><path d="M81.4823 27.0913H27.1531V54.1805H81.4823V27.0913Z" fill="#FFAF00"></path><path d="M162.99 27.0913H108.661V54.1805H162.99V27.0913Z" fill="#FFAF00"></path><path d="M162.972 54.168H27.1531V81.2572H162.972V54.168Z" fill="#FF8205"></path><path d="M54.3221 81.2593H27.1531V108.349H54.3221V81.2593Z" fill="#FA500F"></path><path d="M108.661 81.2593H81.4917V108.349H108.661V81.2593Z" fill="#FA500F"></path><path d="M162.984 81.2593H135.815V108.349H162.984V81.2593Z" fill="#FA500F"></path><path d="M81.4879 108.339H-0.00146484V135.429H81.4879V108.339Z" fill="#E10500"></path><path d="M190.159 108.339H108.661V135.429H190.159V108.339Z" fill="#E10500"></path></g><defs><clipPath id="ag-mistral"><rect width="190.141" height="135" fill="white"></rect></clipPath></defs>' },
            Alibaba: { viewBox: '-120 -117 702 702', raw: '<path d="M230.19 0C236.183 0.986667 241.253 3.32 245.4 7C248.067 9.36667 251.303 13.9167 255.11 20.65C261.63 32.17 265.443 38.8467 266.55 40.68C268.917 44.6067 270.243 49.1967 270.53 54.45C270.535 54.595 270.597 54.7324 270.701 54.8331C270.806 54.9338 270.945 54.9901 271.09 54.99C327.11 55.03 362.75 55.0133 378.01 54.94C386.703 54.9 392.297 55.38 394.79 56.38C403.65 59.95 407.64 64.5 412.81 73.7C415.477 78.4533 418.88 84.3433 423.02 91.37C426.54 97.3433 428.477 101.613 428.83 104.18C430.1 113.45 428.81 119.09 423.63 127.83C420.397 133.277 417.233 138.77 414.14 144.31C408.09 155.14 404.24 160.41 394.14 164.05C391.913 164.857 388.087 165.257 382.66 165.25C247.273 165.203 176.433 165.213 170.14 165.28C162.24 165.367 157.04 164.893 154.54 163.86C146.02 160.35 142.11 156.15 137.12 147.48C129.833 134.84 125.44 127.197 123.94 124.55C120.373 118.283 119.223 111.61 120.49 104.53C121.117 101.043 123.733 95.5367 128.34 88.01C128.407 87.8967 141.797 64.72 168.51 18.48C171.717 12.9267 174.48 9.12333 176.8 7.07C181 3.35 186.07 0.993333 192.01 0H230.19Z" fill="#082DFF"></path><path d="M61.8104 292.97C61.8911 292.921 61.9499 292.844 61.9743 292.754C61.9986 292.664 61.9864 292.569 61.9404 292.49C60.9871 290.783 43.0304 259.687 8.07041 199.2C3.96374 192.093 1.71041 187.24 1.31041 184.64C0.697076 180.66 0.763743 176.647 1.51041 172.6C1.97041 170.107 3.57041 166.47 6.31041 161.69C12.5637 150.783 17.2137 142.803 20.2604 137.75C23.9404 131.643 28.9504 127.503 35.2904 125.33C38.9037 124.097 44.1204 123.553 50.9404 123.7C57.4271 123.84 63.9004 123.847 70.3604 123.72C76.9537 123.593 81.8171 124.11 84.9504 125.27C89.0371 126.783 92.6637 129.057 95.8304 132.09C97.5437 133.737 99.9271 137.237 102.98 142.59C107.34 150.25 142.154 210.557 207.42 323.51C211.667 330.87 213.984 335.837 214.37 338.41C215.004 342.63 214.877 346.91 213.99 351.25C213.53 353.51 211.714 357.353 208.54 362.78C206.387 366.467 202.064 373.9 195.57 385.08C191.877 391.44 186.717 395.687 180.09 397.82C177.044 398.8 172.587 399.287 166.72 399.28C112.94 399.213 84.6404 399.207 81.8204 399.26C74.9471 399.4 70.1404 398.943 67.4004 397.89C63.0404 396.203 59.3037 393.867 56.1904 390.88C54.5104 389.267 52.0504 385.603 48.8104 379.89C44.5771 372.437 40.5937 365.523 36.8604 359.15C32.9471 352.463 31.7537 345.47 33.2804 338.17C33.9804 334.83 35.8004 330.667 38.7404 325.68C45.1671 314.767 49.1804 307.853 50.7804 304.94C53.6704 299.68 56.9304 295.96 61.8104 292.97Z" fill="#082DFF"></path><path d="M293.97 468H255.86C249.84 467.08 244.73 464.777 240.53 461.09C237.783 458.683 234.65 454.337 231.13 448.05C225.804 438.543 222.557 432.873 221.39 431.04C218.43 426.36 216.633 422.273 216 418.78C214.653 411.34 215.767 404.53 219.34 398.35C289.247 277.323 324.903 215.54 326.31 213C330.13 206.093 333.324 201.577 335.89 199.45C341.344 194.943 347.644 192.637 354.79 192.53C365.35 192.383 375.427 192.383 385.02 192.53C392.5 192.643 398.934 194.993 404.32 199.58C406.94 201.807 410.347 206.707 414.54 214.28C416.954 218.633 429.964 241.173 453.57 281.9C457.99 289.513 460.384 294.607 460.75 297.18C461.33 301.207 461.227 305.287 460.44 309.42C459.994 311.773 458.323 315.463 455.43 320.49C452.41 325.73 447.884 333.507 441.85 343.82C438.177 350.113 433.1 354.33 426.62 356.47C423.14 357.61 418.334 358.143 412.2 358.07C401.767 357.943 393.924 357.927 388.67 358.02C382.66 358.13 377.62 357.27 372.63 354.4C372.593 354.379 372.553 354.365 372.511 354.359C372.469 354.354 372.426 354.357 372.385 354.368C372.344 354.379 372.306 354.398 372.272 354.424C372.239 354.451 372.211 354.483 372.19 354.52C351.37 390.513 333.14 422.113 317.5 449.32C314.26 454.947 311.43 458.83 309.01 460.97C304.877 464.617 299.864 466.96 293.97 468Z" fill="#082DFF"></path>' },
            Upstage: { viewBox: '0 0 24 24', raw: '<defs><linearGradient id="ag-upstage" gradientUnits="userSpaceOnUse" x1="11.927" y1="0" x2="11.927" y2="24"><stop offset="0" stop-color="#AEBCFE"></stop><stop offset="1" stop-color="#805DFA"></stop></linearGradient></defs><path d="M19.763 0l-.373 1.297h2.594L22.354 0h-2.591zM16.192 2.27l-.376 1.298h5.52l.37-1.298h-5.514zM12.897 4.54l-.376 1.298h8.166l.37-1.298h-8.16zM2.85 6.81l-.377 1.298h17.565l.37-1.297H2.848zM3.884 9.081l-.376 1.297H19.39l.37-1.297H3.882zM4.088 24l.376-1.297H1.866L1.5 24h2.588zM7.662 21.73l.376-1.297H2.515L2.15 21.73h5.513zM10.957 19.459l.376-1.297h-8.17l-.366 1.297h8.16zM21.005 17.189l.376-1.297H3.812l-.366 1.297h17.559zM19.967 14.919l.376-1.297H4.461l-.366 1.297h15.872zM18.786 12.649l.376-1.297H4.26l-.366 1.297h14.893z" fill="url(#ag-upstage)"></path>' },
            StepFun: { viewBox: '0 0 24 24', raw: '<path d="M13.422,.0852C6.8417-.6989,.8723,3.9976,.0852,10.578c-.7842,6.5803,3.9124,12.5498,10.4899,13.3368,6.5803,.7842,12.5498-3.9124,13.3368-10.4899C24.6989,6.8417,20.0024,.8723,13.422,.0852Zm-4.6483,19.5279h-4.3869v-4.3869h4.3869v4.3869Zm5.4183,0h-4.3869v-4.3869h4.3869v4.3869Zm0-5.4211h-4.3869v-4.3869h4.3869v4.3869Zm0-5.4183h-4.3869v-4.3869h4.3869v4.3869Zm5.4183,0h-4.3869v-4.3869h4.3869v4.3869Z"></path>' },
            Tencent: { viewBox: '0 0 24 24', raw: '<g fill="none" fill-rule="evenodd"><circle cx="12" cy="12" fill="#0055E9" r="12"></circle><path d="M12 0c.518 0 1.028.033 1.528.096A6.188 6.188 0 0112.12 12.28l-.12.001c-2.99 0-5.242 2.179-5.554 5.11-.223 2.086.353 4.412 2.242 6.146C3.672 22.1 0 17.479 0 12 0 5.373 5.373 0 12 0z" fill="#A8DFF5"></path><path d="M5.286 5a2.438 2.438 0 01.682 3.38c-3.962 5.966-3.215 10.743 2.648 15.136C3.636 22.056 0 17.452 0 12c0-1.787.39-3.482 1.09-5.006.253-.435.525-.872.817-1.311A2.438 2.438 0 015.286 5z" fill="#0055E9"></path><path d="M12.98.04c.272.021.543.053.81.093.583.106 1.117.254 1.538.44 6.638 2.927 8.07 10.052 1.748 15.642a4.125 4.125 0 01-5.822-.358c-1.51-1.706-1.3-4.184.357-5.822.858-.848 3.108-1.223 4.045-2.441 1.257-1.634 2.122-6.009-2.523-7.506L12.98.039z" fill="#00BCFF"></path><path d="M13.528.096A6.187 6.187 0 0112 12.281a5.75 5.75 0 00-1.71.255c.147-.905.595-1.784 1.321-2.501.858-.848 3.108-1.223 4.045-2.441 1.27-1.651 2.14-6.104-2.676-7.554.184.014.367.033.548.056z" fill="#ECECEE"></path></g>' },
            Thinky: { viewBox: '0 0 400 400', raw: '<path d="M64.6888 139.29C73.9954 139.297 79.4621 139.287 81.0887 139.26C81.1644 139.259 81.2397 139.272 81.31 139.3C81.3803 139.327 81.4443 139.368 81.4983 139.42C81.5523 139.472 81.5952 139.535 81.6245 139.603C81.6537 139.672 81.6688 139.745 81.6687 139.82V145.02C81.6687 145.158 81.614 145.29 81.5164 145.388C81.4189 145.485 81.2867 145.54 81.1488 145.54H68.9688C68.8176 145.54 68.6726 145.601 68.5657 145.71C68.4588 145.819 68.3988 145.966 68.3988 146.12V183.27C68.3988 183.352 68.3822 183.433 68.3498 183.508C68.3174 183.583 68.27 183.651 68.2102 183.708C68.1505 183.765 68.0798 183.81 68.0022 183.839C67.9247 183.869 67.8419 183.883 67.7588 183.88C67.1788 183.86 66.1721 183.85 64.7387 183.85C63.3054 183.857 62.2954 183.87 61.7087 183.89C61.6265 183.891 61.5447 183.876 61.4683 183.846C61.3919 183.816 61.3224 183.772 61.2637 183.715C61.2051 183.658 61.1585 183.59 61.1268 183.516C61.095 183.441 61.0787 183.361 61.0788 183.28L60.9987 146.13C60.9987 145.976 60.9387 145.829 60.8318 145.72C60.7249 145.611 60.5799 145.55 60.4287 145.55L48.2487 145.57C48.1805 145.57 48.1128 145.556 48.0498 145.53C47.9867 145.504 47.9293 145.466 47.8811 145.418C47.8328 145.369 47.7945 145.312 47.7683 145.249C47.7422 145.186 47.7287 145.118 47.7287 145.05L47.7188 139.85C47.7187 139.775 47.7338 139.702 47.763 139.633C47.7923 139.565 47.8352 139.502 47.8892 139.45C47.9432 139.398 48.0072 139.357 48.0775 139.33C48.1478 139.302 48.223 139.289 48.2987 139.29C49.9254 139.317 55.3888 139.317 64.6888 139.29Z"></path><path d="M125.549 161.63C125.549 175.496 125.539 182.753 125.519 183.4C125.514 183.537 125.457 183.666 125.36 183.761C125.263 183.857 125.134 183.91 124.999 183.91H118.669C118.545 183.91 118.425 183.86 118.337 183.772C118.249 183.684 118.199 183.564 118.199 183.44V165.2C118.201 165.154 118.193 165.109 118.176 165.067C118.16 165.024 118.135 164.985 118.103 164.953C118.072 164.92 118.034 164.894 117.992 164.877C117.95 164.859 117.905 164.85 117.859 164.85C114.713 164.836 111.453 164.83 108.079 164.83C104.706 164.83 101.446 164.84 98.2994 164.86C98.2092 164.86 98.1227 164.896 98.059 164.959C97.9952 165.023 97.9594 165.11 97.9594 165.2L97.9694 183.45C97.9694 183.574 97.9199 183.694 97.8317 183.782C97.7436 183.87 97.624 183.92 97.4994 183.92H91.1694C91.0365 183.92 90.9085 183.868 90.8118 183.775C90.7151 183.682 90.657 183.555 90.6494 183.42C90.6294 182.766 90.616 175.506 90.6094 161.64C90.6094 147.773 90.6194 140.513 90.6394 139.86C90.647 139.724 90.7051 139.597 90.8018 139.504C90.8985 139.411 91.0265 139.36 91.1594 139.36H97.4894C97.614 139.36 97.7336 139.409 97.8217 139.497C97.9099 139.586 97.9594 139.705 97.9594 139.83V158.07C97.958 158.115 97.9658 158.16 97.9823 158.203C97.9988 158.245 98.0236 158.284 98.0554 158.317C98.0871 158.349 98.125 158.375 98.1669 158.393C98.2088 158.411 98.2539 158.42 98.2994 158.42C101.439 158.433 104.699 158.44 108.079 158.44C111.453 158.44 114.713 158.43 117.859 158.41C117.948 158.407 118.032 158.37 118.093 158.307C118.155 158.243 118.189 158.158 118.189 158.07V139.82C118.189 139.695 118.239 139.576 118.327 139.487C118.415 139.399 118.535 139.35 118.659 139.35H124.979C125.114 139.347 125.244 139.398 125.343 139.491C125.442 139.584 125.502 139.713 125.509 139.85C125.529 140.503 125.543 147.763 125.549 161.63Z"></path><path d="M144.742 139.28H138.342C138.071 139.28 137.852 139.5 137.852 139.77V183.35C137.852 183.621 138.071 183.84 138.342 183.84H144.742C145.012 183.84 145.232 183.621 145.232 183.35V139.77C145.232 139.5 145.012 139.28 144.742 139.28Z"></path><path d="M172.426 163.28C170.366 160.033 167.9 156.206 165.026 151.8C165.005 151.767 164.974 151.743 164.937 151.73C164.901 151.717 164.861 151.716 164.824 151.727C164.787 151.738 164.755 151.761 164.732 151.792C164.709 151.823 164.696 151.861 164.696 151.9L164.706 183.36C164.706 183.497 164.653 183.63 164.557 183.727C164.461 183.825 164.332 183.88 164.196 183.88H158.186C158.048 183.88 157.916 183.825 157.819 183.727C157.721 183.63 157.666 183.497 157.666 183.36L157.656 139.94C157.656 139.764 157.726 139.597 157.85 139.473C157.973 139.349 158.141 139.28 158.316 139.28L163.326 139.27C163.609 139.27 163.887 139.341 164.136 139.475C164.386 139.609 164.599 139.803 164.756 140.04C168.956 146.353 173.253 152.966 177.646 159.88C179.706 163.126 182.173 166.953 185.046 171.36C185.068 171.392 185.099 171.416 185.135 171.429C185.172 171.443 185.211 171.444 185.248 171.432C185.285 171.421 185.318 171.398 185.341 171.367C185.364 171.336 185.376 171.298 185.376 171.26L185.366 139.8C185.366 139.731 185.379 139.664 185.405 139.601C185.431 139.537 185.468 139.48 185.516 139.432C185.563 139.384 185.619 139.345 185.681 139.319C185.743 139.293 185.809 139.28 185.876 139.28L191.886 139.27C192.024 139.27 192.156 139.324 192.254 139.422C192.351 139.519 192.406 139.652 192.406 139.79L192.426 183.22C192.426 183.395 192.357 183.562 192.233 183.686C192.109 183.81 191.941 183.88 191.766 183.88H186.756C186.475 183.88 186.197 183.811 185.948 183.678C185.698 183.546 185.485 183.354 185.326 183.12C181.12 176.806 176.82 170.193 172.426 163.28Z"></path><path d="M219.692 164.97H212.382C212.265 164.97 212.153 165.016 212.07 165.099C211.988 165.181 211.942 165.293 211.942 165.41V183.45C211.942 183.567 211.895 183.679 211.813 183.761C211.73 183.844 211.618 183.89 211.502 183.89H205.042C204.925 183.89 204.813 183.844 204.73 183.761C204.648 183.679 204.602 183.567 204.602 183.45V139.73C204.602 139.613 204.648 139.501 204.73 139.419C204.813 139.336 204.925 139.29 205.042 139.29H211.532C211.648 139.29 211.76 139.336 211.843 139.419C211.925 139.501 211.972 139.613 211.972 139.73V158.05C211.972 158.167 212.018 158.279 212.1 158.361C212.183 158.444 212.295 158.49 212.412 158.49H219.552C219.629 158.49 219.704 158.469 219.771 158.431C219.838 158.392 219.893 158.337 219.932 158.27L230.762 139.51C230.8 139.443 230.855 139.388 230.922 139.349C230.989 139.311 231.064 139.29 231.142 139.29H238.252C238.329 139.29 238.404 139.311 238.471 139.349C238.538 139.388 238.593 139.444 238.632 139.51C238.67 139.577 238.691 139.653 238.691 139.73C238.69 139.807 238.67 139.883 238.632 139.95L226.292 161.31C226.253 161.379 226.233 161.457 226.235 161.536C226.236 161.616 226.26 161.693 226.302 161.76L239.692 183.21C239.732 183.276 239.755 183.352 239.756 183.43C239.758 183.508 239.739 183.585 239.702 183.653C239.664 183.721 239.609 183.778 239.542 183.818C239.476 183.858 239.399 183.879 239.322 183.88H231.972C231.897 183.879 231.824 183.859 231.759 183.823C231.695 183.786 231.64 183.733 231.602 183.67L220.062 165.18C220.023 165.117 219.968 165.064 219.904 165.027C219.839 164.991 219.766 164.971 219.692 164.97Z"></path><path d="M255.428 139.29H249.108C248.815 139.29 248.578 139.527 248.578 139.82V183.34C248.578 183.633 248.815 183.87 249.108 183.87H255.428C255.721 183.87 255.958 183.633 255.958 183.34V139.82C255.958 139.527 255.721 139.29 255.428 139.29Z"></path><path d="M283.182 163.26C281.122 160.013 278.659 156.19 275.792 151.79C275.773 151.752 275.741 151.722 275.703 151.705C275.664 151.688 275.621 151.685 275.58 151.697C275.539 151.709 275.504 151.735 275.481 151.77C275.458 151.805 275.447 151.848 275.452 151.89L275.462 183.33C275.462 183.467 275.408 183.6 275.312 183.697C275.217 183.795 275.087 183.85 274.952 183.85H268.942C268.804 183.85 268.672 183.795 268.574 183.697C268.477 183.6 268.422 183.467 268.422 183.33V139.93C268.422 139.754 268.491 139.587 268.615 139.463C268.739 139.339 268.907 139.27 269.082 139.27H274.082C274.366 139.269 274.646 139.338 274.898 139.473C275.149 139.607 275.363 139.802 275.522 140.04C279.715 146.346 284.005 152.956 288.392 159.87C290.452 163.116 292.915 166.94 295.782 171.34C295.801 171.377 295.832 171.407 295.871 171.424C295.91 171.441 295.953 171.444 295.994 171.432C296.034 171.42 296.069 171.394 296.093 171.359C296.116 171.324 296.126 171.282 296.122 171.24L296.112 139.8C296.112 139.662 296.166 139.529 296.261 139.432C296.357 139.334 296.487 139.28 296.622 139.28H302.632C302.7 139.28 302.768 139.293 302.831 139.319C302.894 139.345 302.951 139.384 303 139.432C303.048 139.48 303.086 139.537 303.112 139.601C303.138 139.664 303.152 139.731 303.152 139.8V183.19C303.152 183.365 303.082 183.532 302.959 183.656C302.835 183.78 302.667 183.85 302.492 183.85H297.492C297.21 183.85 296.932 183.781 296.683 183.648C296.434 183.516 296.22 183.324 296.062 183.09C291.862 176.783 287.569 170.173 283.182 163.26Z"></path><path d="M350.101 160.12V176.06C350.101 176.457 349.943 176.839 349.661 177.12L343.541 183.24C343.345 183.439 343.11 183.598 342.851 183.706C342.592 183.814 342.313 183.87 342.031 183.87H322.311C322.146 183.87 321.981 183.836 321.827 183.771C321.673 183.706 321.531 183.61 321.411 183.49L315.201 177.28C315.068 177.147 314.962 176.99 314.89 176.818C314.818 176.646 314.781 176.464 314.781 176.28V147.23C314.782 146.654 315.008 146.103 315.411 145.7L320.851 140.26C321.156 139.955 321.518 139.714 321.916 139.549C322.314 139.384 322.74 139.3 323.171 139.3H342.201C342.473 139.3 342.743 139.353 342.993 139.458C343.244 139.563 343.471 139.716 343.661 139.91L349.541 145.79C349.9 146.148 350.101 146.633 350.101 147.14V151.59C350.101 151.76 350.034 151.922 349.914 152.042C349.794 152.162 349.631 152.23 349.461 152.23H343.391C343.219 152.23 343.054 152.161 342.932 152.039C342.81 151.918 342.741 151.752 342.741 151.58V149.37C342.741 149.224 342.712 149.08 342.655 148.946C342.598 148.812 342.516 148.691 342.411 148.59L339.751 145.93C339.647 145.822 339.521 145.737 339.382 145.678C339.243 145.62 339.093 145.59 338.941 145.59H325.961C325.768 145.59 325.582 145.665 325.441 145.8L322.551 148.69C322.418 148.823 322.312 148.982 322.24 149.157C322.168 149.332 322.131 149.52 322.131 149.71V172.69C322.131 173.234 322.276 173.772 322.551 174.25C323.038 175.096 323.891 176.04 325.111 177.08C325.376 177.3 325.712 177.42 326.061 177.42H339.001C339.182 177.42 339.361 177.384 339.527 177.316C339.694 177.247 339.845 177.147 339.971 177.02L342.311 174.68C342.505 174.486 342.658 174.256 342.763 174.002C342.868 173.748 342.921 173.475 342.921 173.2V166.42C342.921 166.279 342.865 166.144 342.766 166.045C342.667 165.946 342.532 165.89 342.391 165.89H333.871C333.72 165.89 333.575 165.83 333.468 165.723C333.361 165.616 333.301 165.471 333.301 165.32V160.03C333.301 159.879 333.361 159.734 333.468 159.627C333.575 159.52 333.72 159.46 333.871 159.46H349.451C349.624 159.46 349.789 159.529 349.911 159.653C350.033 159.777 350.101 159.945 350.101 160.12Z"></path><path d="M56.7794 246.6C56.886 246.6 56.9494 246.573 56.9694 246.52C62.3427 234.487 66.7294 224.547 70.1294 216.7C70.2033 216.531 70.3249 216.387 70.4794 216.285C70.634 216.184 70.8146 216.13 70.9994 216.13H76.9294C77.0646 216.13 77.1944 216.184 77.29 216.279C77.3856 216.375 77.4394 216.505 77.4394 216.64V260.41C77.4394 260.492 77.4067 260.571 77.3486 260.629C77.2904 260.687 77.2116 260.72 77.1294 260.72H70.6794C70.6051 260.72 70.5339 260.691 70.4814 260.638C70.4289 260.586 70.3994 260.514 70.3994 260.44V231.93C70.4016 231.882 70.3869 231.834 70.3576 231.796C70.3283 231.758 70.2862 231.732 70.2383 231.722C70.1905 231.711 70.1397 231.717 70.0944 231.739C70.0491 231.76 70.012 231.796 69.9894 231.84L59.4494 254.37C59.3546 254.574 59.2074 254.749 59.023 254.877C58.8385 255.005 58.6233 255.082 58.3994 255.1C58.3727 255.107 57.8327 255.11 56.7794 255.11C55.7194 255.11 55.176 255.107 55.1494 255.1C54.9272 255.08 54.7141 255.003 54.5315 254.875C54.3489 254.746 54.2034 254.572 54.1094 254.37L43.5794 231.83C43.5567 231.786 43.5197 231.75 43.4744 231.729C43.4291 231.707 43.3783 231.701 43.3304 231.712C43.2825 231.722 43.2405 231.749 43.2112 231.786C43.1819 231.824 43.1671 231.872 43.1694 231.92L43.1494 260.43C43.1494 260.504 43.1199 260.576 43.0674 260.628C43.0149 260.681 42.9436 260.71 42.8694 260.71H36.4194C36.3372 260.71 36.2583 260.677 36.2002 260.619C36.142 260.561 36.1094 260.482 36.1094 260.4L36.1394 216.63C36.1394 216.495 36.1931 216.365 36.2887 216.27C36.3844 216.174 36.5141 216.12 36.6494 216.12H42.5794C42.7641 216.12 42.9448 216.174 43.0993 216.275C43.2538 216.377 43.3755 216.521 43.4494 216.69C46.8427 224.543 51.2227 234.487 56.5894 246.52C56.6094 246.573 56.6727 246.6 56.7794 246.6Z"></path><path d="M105.369 250.18C100.836 250.173 98.3227 250.176 97.8294 250.19C97.6014 250.198 97.3814 250.274 97.1978 250.408C97.0142 250.541 96.8754 250.727 96.7994 250.94L93.5394 259.96C93.4572 260.185 93.3076 260.38 93.1108 260.518C92.914 260.656 92.6796 260.73 92.4394 260.73H86.6194C86.5226 260.729 86.4275 260.705 86.3418 260.66C86.2562 260.615 86.1825 260.55 86.1268 260.471C86.0711 260.392 86.035 260.3 86.0216 260.205C86.0081 260.109 86.0176 260.011 86.0494 259.92L101.669 216.73C101.743 216.529 101.884 216.361 102.069 216.254C102.253 216.146 102.469 216.106 102.679 216.14C102.753 216.153 103.653 216.16 105.379 216.16C107.113 216.16 108.016 216.153 108.089 216.14C108.3 216.106 108.516 216.146 108.7 216.254C108.884 216.361 109.026 216.529 109.099 216.73L124.669 259.94C124.701 260.031 124.711 260.129 124.697 260.225C124.684 260.32 124.648 260.412 124.592 260.491C124.536 260.57 124.463 260.635 124.377 260.68C124.291 260.725 124.196 260.749 124.099 260.75L118.279 260.74C118.039 260.74 117.805 260.666 117.608 260.528C117.411 260.39 117.261 260.195 117.179 259.97L113.929 250.95C113.853 250.737 113.715 250.551 113.531 250.418C113.347 250.284 113.127 250.208 112.899 250.2C112.406 250.186 109.896 250.18 105.369 250.18ZM99.0194 243.47C98.9971 243.533 98.9902 243.6 98.9991 243.666C99.008 243.732 99.0326 243.795 99.0707 243.85C99.1088 243.905 99.1594 243.949 99.2183 243.981C99.2772 244.012 99.3427 244.029 99.4094 244.03L111.329 244.01C111.396 244.009 111.462 243.992 111.52 243.961C111.579 243.929 111.63 243.885 111.668 243.83C111.706 243.775 111.731 243.712 111.74 243.646C111.749 243.58 111.742 243.513 111.719 243.45L105.739 226.08C105.712 225.995 105.659 225.921 105.587 225.869C105.515 225.816 105.428 225.788 105.339 225.788C105.25 225.788 105.164 225.816 105.092 225.869C105.02 225.921 104.966 225.995 104.939 226.08L99.0194 243.47Z"></path><path d="M138.909 238.44C138.909 245.994 138.909 249.777 138.909 249.79C138.954 250.173 139.08 250.544 139.279 250.88C139.966 252.02 140.976 253.094 142.309 254.1C142.549 254.282 142.844 254.38 143.149 254.38H155.009C155.2 254.381 155.388 254.34 155.559 254.26C158.159 253.014 159.466 251.097 159.479 248.51C159.479 248.322 159.554 248.142 159.687 248.008C159.82 247.875 160.001 247.8 160.189 247.8H165.799C165.96 247.8 166.116 247.86 166.236 247.969C166.356 248.078 166.432 248.228 166.449 248.39C166.789 251.69 166.989 253.54 164.579 255.93C162.399 258.09 160.519 260.67 157.759 260.72C151.719 260.82 145.709 260.817 139.729 260.71C139.075 260.698 138.452 260.433 137.989 259.97L132.139 254.12C131.778 253.752 131.568 253.264 131.549 252.75C131.542 252.564 131.539 247.794 131.539 238.44C131.539 229.087 131.542 224.314 131.549 224.12C131.57 223.611 131.78 223.126 132.139 222.76L137.989 216.91C138.452 216.448 139.075 216.183 139.729 216.17C145.709 216.064 151.719 216.06 157.759 216.16C160.519 216.21 162.399 218.79 164.579 220.95C166.989 223.34 166.789 225.19 166.449 228.49C166.432 228.653 166.356 228.803 166.236 228.912C166.116 229.021 165.96 229.081 165.799 229.08H160.189C160.001 229.08 159.82 229.006 159.687 228.873C159.554 228.739 159.479 228.559 159.479 228.37C159.466 225.784 158.159 223.867 155.559 222.62C155.388 222.541 155.2 222.5 155.009 222.5H143.149C142.844 222.501 142.549 222.599 142.309 222.78C140.976 223.787 139.966 224.86 139.279 226C139.08 226.337 138.954 226.708 138.909 227.09C138.909 227.104 138.909 230.887 138.909 238.44Z"></path><path d="M194.009 235.22C197.382 235.22 200.642 235.213 203.789 235.2C203.835 235.2 203.88 235.191 203.922 235.173C203.963 235.155 204.001 235.13 204.033 235.097C204.065 235.064 204.09 235.026 204.106 234.983C204.123 234.941 204.13 234.895 204.129 234.85V216.6C204.129 216.475 204.179 216.356 204.267 216.268C204.355 216.179 204.474 216.13 204.599 216.13H210.929C211.064 216.13 211.193 216.183 211.29 216.278C211.387 216.373 211.444 216.503 211.449 216.64C211.469 217.293 211.479 224.553 211.479 238.42C211.479 252.287 211.466 259.547 211.439 260.2C211.431 260.335 211.373 260.462 211.277 260.555C211.18 260.648 211.052 260.7 210.919 260.7H204.589C204.464 260.7 204.345 260.65 204.257 260.562C204.169 260.474 204.119 260.355 204.119 260.23L204.129 241.98C204.129 241.89 204.093 241.803 204.029 241.74C203.966 241.676 203.879 241.64 203.789 241.64C200.642 241.627 197.382 241.62 194.009 241.62C190.629 241.613 187.369 241.62 184.229 241.64C184.139 241.64 184.052 241.676 183.989 241.74C183.925 241.803 183.889 241.89 183.889 241.98V260.23C183.889 260.355 183.84 260.474 183.751 260.562C183.663 260.65 183.544 260.7 183.419 260.7H177.089C176.955 260.7 176.825 260.647 176.728 260.552C176.631 260.457 176.574 260.327 176.569 260.19C176.549 259.543 176.539 252.283 176.539 238.41C176.539 224.543 176.549 217.287 176.569 216.64C176.574 216.501 176.633 216.37 176.732 216.275C176.831 216.179 176.963 216.127 177.099 216.13H183.429C183.554 216.13 183.673 216.179 183.761 216.268C183.85 216.356 183.899 216.475 183.899 216.6L183.889 234.85C183.888 234.895 183.896 234.941 183.912 234.983C183.929 235.026 183.953 235.064 183.985 235.097C184.017 235.13 184.055 235.155 184.097 235.173C184.139 235.191 184.184 235.2 184.229 235.2C187.369 235.213 190.629 235.22 194.009 235.22Z"></path><path d="M230.72 216.17H224.18C223.943 216.17 223.75 216.362 223.75 216.6V260.28C223.75 260.517 223.943 260.71 224.18 260.71H230.72C230.957 260.71 231.15 260.517 231.15 260.28V216.6C231.15 216.362 230.957 216.17 230.72 216.17Z"></path><path d="M258.377 240.12C256.324 236.874 253.861 233.047 250.987 228.64C250.966 228.608 250.935 228.584 250.898 228.57C250.862 228.557 250.822 228.556 250.785 228.568C250.748 228.579 250.715 228.602 250.692 228.633C250.669 228.664 250.657 228.702 250.657 228.74V260.21C250.657 260.279 250.644 260.346 250.618 260.409C250.593 260.472 250.555 260.53 250.508 260.578C250.46 260.626 250.404 260.665 250.342 260.691C250.28 260.717 250.214 260.73 250.147 260.73H244.137C243.999 260.73 243.867 260.676 243.77 260.578C243.672 260.481 243.617 260.348 243.617 260.21V216.77C243.617 216.595 243.687 216.427 243.811 216.304C243.934 216.18 244.102 216.11 244.277 216.11H249.287C249.57 216.111 249.848 216.182 250.097 216.316C250.347 216.45 250.56 216.644 250.717 216.88C254.917 223.194 259.214 229.81 263.607 236.73C265.667 239.977 268.134 243.804 271.007 248.21C271.029 248.243 271.06 248.267 271.096 248.28C271.133 248.293 271.172 248.294 271.209 248.283C271.246 248.272 271.279 248.249 271.302 248.218C271.325 248.187 271.337 248.149 271.337 248.11V216.64C271.337 216.572 271.35 216.504 271.376 216.441C271.402 216.378 271.439 216.321 271.487 216.273C271.534 216.224 271.59 216.186 271.652 216.16C271.714 216.134 271.78 216.12 271.847 216.12H277.857C277.995 216.12 278.127 216.175 278.225 216.273C278.322 216.37 278.377 216.502 278.377 216.64V260.08C278.377 260.255 278.308 260.423 278.184 260.547C278.06 260.671 277.892 260.74 277.717 260.74H272.707C272.425 260.74 272.146 260.669 271.897 260.535C271.648 260.4 271.435 260.207 271.277 259.97C267.071 253.657 262.771 247.04 258.377 240.12Z"></path><path d="M319.601 238.35C319.601 238.65 319.608 239.53 319.621 240.99C319.621 241.13 319.566 241.265 319.466 241.364C319.367 241.464 319.232 241.52 319.091 241.52H298.411C298.266 241.52 298.126 241.579 298.023 241.684C297.919 241.789 297.861 241.931 297.861 242.08V253.91C297.861 254.026 297.908 254.138 297.99 254.221C298.073 254.303 298.185 254.35 298.301 254.35H321.011C321.139 254.35 321.261 254.4 321.351 254.49C321.441 254.58 321.491 254.702 321.491 254.83V260.21C321.491 260.326 321.444 260.438 321.36 260.521C321.275 260.603 321.161 260.65 321.041 260.65L291.031 260.64C290.936 260.639 290.843 260.605 290.768 260.543C290.694 260.481 290.642 260.395 290.621 260.3C290.601 260.22 290.588 252.91 290.581 238.37C290.575 223.83 290.578 216.52 290.591 216.44C290.612 216.344 290.664 216.258 290.738 216.196C290.813 216.134 290.906 216.1 291.001 216.1L321.011 216.06C321.071 216.058 321.131 216.069 321.187 216.09C321.243 216.112 321.293 216.144 321.336 216.185C321.379 216.226 321.413 216.275 321.436 216.329C321.46 216.383 321.471 216.441 321.471 216.5V221.88C321.471 222.007 321.421 222.129 321.331 222.219C321.241 222.309 321.119 222.36 320.991 222.36L298.281 222.38C298.165 222.38 298.053 222.426 297.97 222.509C297.888 222.591 297.841 222.703 297.841 222.82L297.861 234.65C297.861 234.798 297.919 234.941 298.023 235.046C298.126 235.151 298.266 235.21 298.411 235.21L319.091 235.19C319.232 235.19 319.367 235.246 319.466 235.345C319.566 235.444 319.621 235.579 319.621 235.72C319.608 237.18 319.601 238.056 319.601 238.35Z"></path><path d="M331.672 248.5H336.992C337.135 248.501 337.277 248.533 337.407 248.594C337.537 248.655 337.652 248.743 337.743 248.853C337.835 248.963 337.901 249.091 337.937 249.229C337.973 249.366 337.978 249.51 337.952 249.65C337.592 251.657 338.372 253.17 340.292 254.19C340.568 254.334 340.873 254.41 341.182 254.41H353.282C353.57 254.41 353.849 254.334 354.092 254.19C357.592 252.18 356.722 248.24 356.592 244.51C356.552 243.343 355.838 242.313 354.452 241.42C354.197 241.257 353.895 241.17 353.582 241.17H338.612C337.831 241.17 337.079 240.857 336.522 240.3L331.382 235.16C330.978 234.757 330.752 234.21 330.752 233.64V223.39C330.751 223.174 330.794 222.961 330.876 222.762C330.959 222.563 331.079 222.382 331.232 222.23L336.402 217.05C336.998 216.461 337.799 216.13 338.632 216.13H356.252C356.47 216.13 356.687 216.173 356.89 216.257C357.092 216.341 357.276 216.464 357.432 216.62L362.742 221.93C362.948 222.136 363.111 222.381 363.223 222.65C363.334 222.92 363.392 223.208 363.392 223.5V227.25C363.392 227.539 363.277 227.816 363.072 228.021C362.868 228.225 362.591 228.34 362.302 228.34H356.902C356.75 228.34 356.601 228.304 356.466 228.235C356.331 228.166 356.215 228.065 356.126 227.942C356.038 227.819 355.981 227.676 355.959 227.526C355.938 227.376 355.952 227.223 356.002 227.08C356.568 225.413 355.888 224 353.962 222.84C353.673 222.67 353.346 222.577 353.012 222.57C349.605 222.517 346.182 222.5 342.742 222.52C340.022 222.54 338.152 223.37 338.022 226.21C337.862 229.55 337.282 234.46 341.522 234.57C346.055 234.697 351.048 234.71 356.502 234.61C356.751 234.607 357 234.654 357.231 234.748C357.463 234.842 357.674 234.983 357.852 235.16L362.882 240.19C363.192 240.497 363.438 240.863 363.607 241.266C363.775 241.669 363.861 242.102 363.862 242.54V252.96C363.861 253.337 363.786 253.711 363.64 254.059C363.494 254.408 363.281 254.724 363.012 254.99L358.292 259.72C357.975 260.037 357.598 260.288 357.182 260.46C356.767 260.632 356.322 260.72 355.872 260.72H338.562C338.131 260.72 337.705 260.635 337.308 260.471C336.912 260.306 336.553 260.064 336.252 259.76L331.192 254.71C331.004 254.523 330.856 254.3 330.755 254.055C330.654 253.81 330.602 253.546 330.602 253.28V249.56C330.602 249.279 330.714 249.009 330.915 248.81C331.116 248.612 331.388 248.5 331.672 248.5Z"></path>' },
        };
        function ArenaMark({ org }) {
            const mark = ARENA_EXTRA_MARKS[org];
            if (mark) {
                return h('svg', {
                    className: 'osubs-amark', viewBox: mark.viewBox,
                    fill: 'currentColor', 'aria-hidden': 'true',
                    dangerouslySetInnerHTML: { __html: mark.raw },
                });
            }
            // Unmapped org: the initial on a muted tile.
            return h('span', { className: 'osubs-amark osubs-amark--alt', 'aria-hidden': 'true' }, String(org || '?').slice(0, 1).toUpperCase());
        }
        // Column labels go through the locale table (t.arenaCol*) — the
        // maintainer wants the whole page translated, not just the chrome.
        const clamp100 = (x) => Math.max(0, Math.min(100, x));
        const arenaPct = (v) => `${(v * 100).toFixed(2)}%`;
        /** Arena's up/down glyph: direction is the value's sign, inverted for
            tool-hallucination-style columns where a positive rate is good news. */
        function ArrowUp({ down }) {
            return h('svg', {
                className: 'osubs-aarrow', viewBox: '0 0 24 24', 'aria-hidden': 'true',
                fill: 'currentColor',
            }, h('path', { d: down
                    ? 'M5.30711 8.71299C5.4232 8.43273 5.69668 8.25 6.00002 8.25H18C18.3034 8.25 18.5768 8.43273 18.6929 8.71299C18.809 8.99324 18.7449 9.31583 18.5304 9.53033L12.5304 15.5303C12.2375 15.8232 11.7626 15.8232 11.4697 15.5303L5.46969 9.53033C5.25519 9.31583 5.19103 8.99324 5.30711 8.71299Z'
                    : 'M5.30711 15.287C5.4232 15.5673 5.69668 15.75 6.00002 15.75H18C18.3034 15.75 18.5768 15.5673 18.6929 15.287C18.809 15.0068 18.7449 14.6842 18.5304 14.4697L12.5304 8.46967C12.2375 8.17678 11.7626 8.17678 11.4697 8.46967L5.46969 14.4697C5.25519 14.6842 5.19103 15.0068 5.30711 15.287Z' }));
        }
        /** Value + arrow + ±CI, arena's exact stack (arrow ▲14.33% over ±2.18%). */
        function ArenaScore({ value, ci, invert }) {
            if (value === null || value === undefined)
                return h('span', { className: 'osubs-a mute' }, '—');
            const good = invert ? value >= 0 : value >= 0;
            const down = invert ? value < 0 : value < 0;
            return h('span', { className: 'osubs-astack' }, h('span', { className: `osubs-avalue${value === 0 ? '' : good ? ' osubs-aok' : ' osubs-abad'}` }, value !== 0 && h(ArrowUp, { down }), arenaPct(Math.abs(value))), ci !== null && ci !== undefined && h('span', { className: 'osubs-aci' }, `±${arenaPct(ci)}`));
        }
        /** The Net Improvement diverging bar: a 100-wide track, a centre hairline,
            the value fill from centre, and the CI whisker — scaled so the widest
            |value|+ci in the column exactly reaches the edge (arena's own rule). */
        function ArenaScoreBar({ value, ci, scale, t }) {
            const at = (x) => clamp100(50 + (x / (scale || 1)) * 50);
            const x1 = at(value - ci);
            const x2 = at(value + ci);
            const edge = at(value);
            const left = Math.min(50, edge);
            const width = Math.abs(edge - 50);
            return h('svg', {
                className: 'osubs-abar', viewBox: '0 0 100 16', preserveAspectRatio: 'none',
                role: 'img', 'aria-label': `${t.arenaColNet} ${arenaPct(value)}`,
            }, h('rect', { x: 0, y: 0, width: 100, height: 16, rx: 1.5, className: 'osubs-abar-track' }), h('rect', { x: left, y: 0, width, height: 16, rx: 1.5, className: value >= 0 ? 'osubs-abar-ok' : 'osubs-abar-bad' }), h('line', { x1: 50, x2: 50, y1: -3, y2: 19, className: 'osubs-abar-mid' }), h('line', { x1, x2, y1: 8, y2: 8, className: 'osubs-abar-ci' }));
        }
        /** Rank + its interval: `1` over `1 ⋯ 6` (dot-with-lines glyph between). */
        function ArenaRank({ row, t }) {
            return h('span', { className: 'osubs-arank' }, h('span', { className: 'osubs-arank-n' }, String(row.rank)), h('span', { className: 'osubs-arank-spread', title: fill(t.arenaRankRange, { min: row.spreadMin, max: row.spreadMax }) }, h('span', null, String(row.spreadMin)), h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }, h('circle', { cx: 12, cy: 12, r: 3 }), h('path', { d: 'M9 12H3' }), h('path', { d: 'M15 12L21 12' })), h('span', null, String(row.spreadMax))));
        }
        function ArenaSkeleton() {
            return h('div', { className: 'osubs-usk' }, h('span', { className: 'osubs-sk osubs-sk--chart' }), h('span', { className: 'osubs-sk osubs-sk--n' }));
        }
        // View-as toggle glyphs, traced from the site's own buttons (lucide
        // `list` for Ranking, axes-plus-curve for Pareto): 24-grid, 1.5 stroke.
        function ViewIconRank() {
            return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M8 6h12' }), h('path', { d: 'M8 12h12' }), h('path', { d: 'M8 18h12' }), h('circle', { cx: 4, cy: 6, r: .75 }), h('circle', { cx: 4, cy: 12, r: .75 }), h('circle', { cx: 4, cy: 18, r: .75 }));
        }
        function ViewIconPareto() {
            return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M20 20H4V4' }), h('path', { d: 'M4 7l8 8 3-3 4.5 4.5' }));
        }
        function ArenaPanel({ t, data, error, busy, onRefresh, version, repo }) {
            const [category, setCategory] = useState(readStoredArenaCategory);
            const [query, setQuery] = useState('');
            const [license, setLicense] = useState('all');
            const [sort, setSort] = useState({ key: 'rank', dir: 1 });
            const [viewMode, setViewMode] = useState(readStoredArenaView);
            const pickView = (id) => { setViewMode(id); writeStoredArenaView(id); };
            const shot = useShot(t);
            const shareRef = useRef(null);
            const pickCategory = (id) => { setCategory(id); writeStoredArenaCategory(id); setSort({ key: 'rank', dir: 1 }); };
            const board = data?.boards?.[category] ?? null;
            const rows = board?.rows ?? null;
            // 分享 keeps the board content — table (head + the filtered rows) and
            // the source footline — and drops the controls via [data-noshot].
            const head = h('header', { className: 'osubs-uhead', 'data-noshot': '' }, h('span', { className: 'osubs-noshot' }, board && h('span', { className: 'osubs-note osubs-uhead-note' }, fill(t.arenaUpdated, new Date(board.lastUpdated || data.at).toLocaleDateString(localeOf(), { year: 'numeric', month: 'short', day: 'numeric' })), ' · ', fill(t.arenaSessions, (board.totalSessions).toLocaleString(localeOf())), ' · ', fill(t.arenaModels, String(board.modelCount))), h(Button, {
                size: 'sm', disabled: busy, onClick: onRefresh,
                label: h('span', { className: 'osubs-refresh' + (busy ? ' osubs-refresh--spin' : '') }, h(IconRefresh), t.quotaRefresh),
            }), h(ShareButton, { t, busy: shot.busy, disabled: !board, onClick: () => {
                    if (board)
                        shot.start(shareRef.current, shotFooter(t, {
                            version, repo,
                            at: board.lastUpdated || data.at,
                            atLabel: fill(t.arenaUpdated, stamp(board.lastUpdated || data.at)),
                            scope: `${t.tabArena} · ${t[ARENA_CATEGORIES.find(([id]) => id === category)?.[1] ?? 'arenaCatOverall']}${license !== 'all' ? ` · ${{ proprietary: t.arenaLicenseProprietary, open: t.arenaLicenseOpen }[license]}` : ''}${viewMode === 'pareto' ? ` · ${t.arenaViewPareto}` : ''}`,
                        }), `oauth-subs-arena-${stamp(Date.now()).slice(0, 10)}.png`);
                } })), h('div', { className: 'osubs-seg', role: 'group' }, ARENA_CATEGORIES.map(([id, key]) => h(Button, {
                key, size: 'sm', variant: category === id ? 'primary' : undefined,
                onClick: () => pickCategory(id), label: t[key],
            }))));
            if (rows === null) {
                return h('section', { className: 'osubs-card', 'aria-busy': !error }, head, error ? h('p', { className: 'osubs-hint osubs-bad' }, error) : h(ArenaSkeleton));
            }
            // Diverging-bar scale: the widest |value|+ci fills the half-track.
            const scale = Math.max(0.0001, ...rows.map((row) => Math.abs(row.value) + (row.ci ?? 0)));
            const licenses = [['all', t.arenaLicenseAll], ['proprietary', t.arenaLicenseProprietary], ['open', t.arenaLicenseOpen]];
            const needle = query.trim().toLowerCase();
            const shown = rows.filter((row) => {
                if (license === 'proprietary' && row.license !== 'Proprietary')
                    return false;
                if (license === 'open' && row.license === 'Proprietary')
                    return false;
                if (!needle)
                    return true;
                return `${row.model} ${row.org}`.toLowerCase().includes(needle);
            });
            const sorted = [...shown].sort((a, b) => {
                if (sort.key === 'rank')
                    return (a.rank - b.rank) * sort.dir;
                const key = sort.key;
                return ((a[key] ?? 0) - (b[key] ?? 0)) * sort.dir;
            });
            const sortButton = (key, label, align) => h('button', {
                type: 'button',
                className: `osubs-ahead-btn${sort.key === key ? ' osubs-ahead-btn--on' : ''}${align ? ' osubs-ahead-btn--end' : ''}`,
                onClick: () => setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: -1 })),
                title: label,
            }, label, h('span', { className: 'osubs-ahead-arrow' }, sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : ''));
            const table = h('div', { className: 'osubs-atable', role: 'table' }, h('div', { className: 'osubs-atrow osubs-atrow--head', role: 'row' }, h('span', { className: 'osubs-atcell osubs-atcell--rank', role: 'columnheader' }, sortButton('rank', t.arenaColRank)), h('span', { className: 'osubs-atcell osubs-atcell--model', role: 'columnheader' }, t.arenaColModel), h('span', { className: 'osubs-atcell osubs-atcell--score', role: 'columnheader' }, sortButton('value', t.arenaColNet, true)), h('span', { className: 'osubs-atcell osubs-atcell--score osubs-atcell--success', role: 'columnheader' }, sortButton('success', t.arenaColSuccess, true)), h('span', { className: 'osubs-atcell osubs-atcell--score', role: 'columnheader' }, sortButton('costUsd', t.arenaColCost, true))), sorted.length === 0 && h('div', { className: 'osubs-atrow osubs-atrow--empty' }, h('span', { className: 'osubs-mempty' }, t.arenaNoMatch)), sorted.map((row) => h('div', { className: 'osubs-atrow', role: 'row', key: `${row.rank}-${row.model}` }, h('span', { className: 'osubs-atcell osubs-atcell--rank', role: 'cell' }, h(ArenaRank, { row, t })), h('span', { className: 'osubs-atcell osubs-atcell--model', role: 'cell' }, h('span', { className: 'osubs-amodel' }, h(ArenaMark, { org: row.org }), h('span', { className: 'osubs-amodel-who' }, row.url
                ? h('a', { className: 'osubs-amodel-n', href: row.url, target: '_blank', rel: 'noreferrer', title: row.model }, row.model)
                : h('span', { className: 'osubs-amodel-n', title: row.model }, row.model), h('span', { className: 'osubs-amodel-s' }, [row.org, row.license].filter(Boolean).join(' · '))))), h('span', { className: 'osubs-atcell osubs-atcell--score', role: 'cell' }, h('span', { className: 'osubs-ascore' }, h(ArenaScore, { value: row.value, ci: row.ci }), h(ArenaScoreBar, { value: row.value, ci: row.ci ?? 0, scale, t }))), h('span', { className: 'osubs-atcell osubs-atcell--score osubs-atcell--success', role: 'cell' }, h(ArenaScore, { value: row.success, ci: row.successCi, invert: false })), h('span', { className: 'osubs-atcell osubs-atcell--cost', role: 'cell' }, row.costUsd != null
                ? h('span', { className: 'osubs-acost', title: t.arenaColCost }, arenaUsd(row.costUsd))
                : h('span', { className: 'osubs-acost osubs-a mute' }, '—')))));
            return h(Fragment || 'div', null, h('section', { className: 'osubs-arena', ref: shareRef }, head, (error || data?.error) && h('p', { className: 'osubs-hint' }, error || fill(t.arenaStale, data?.error ?? '')), h('div', { className: 'osubs-atools', 'data-noshot': '' }, h('div', { className: 'osubs-seg', role: 'group' }, [['rank', t.arenaViewRank], ['pareto', t.arenaViewPareto]].map(([id, label]) => h(Button, {
                key: id, size: 'sm', variant: viewMode === id ? 'primary' : undefined,
                onClick: () => pickView(id),
                label: h('span', { className: 'osubs-vseg' }, id === 'rank' ? h(ViewIconRank) : h(ViewIconPareto), label),
            }))), h('div', { className: 'osubs-msearch osubs-asearch' }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': 'true' }, h('circle', { cx: 11, cy: 11, r: 7 }), h('path', { d: 'M20 20l-3.5-3.5' })), h('input', {
                type: 'search', value: query, placeholder: t.arenaSearch,
                onChange: (event) => setQuery(event.target.value),
                'aria-label': t.arenaSearch,
            })), h('div', { className: 'osubs-seg', role: 'group' }, licenses.map(([id, label]) => h(Button, {
                key: id, size: 'sm', variant: license === id ? 'primary' : undefined,
                onClick: () => setLicense(id), label,
            }))), h('span', { className: 'osubs-mcount' }, `${shown.length} / ${rows.length}`)), viewMode === 'pareto' ? h(ArenaPareto, { t, rows: sorted }) : table, h('p', { className: 'osubs-hint osubs-afoot' }, t.arenaSource, ' ', h('a', {
                className: 'osubs-link osubs-afoot-link',
                href: ARENA_SOURCE_URL + (ARENA_CATEGORIES.find(([id]) => id === category)?.[2] ?? ''),
                target: '_blank', rel: 'noreferrer',
            }, 'arena.ai', h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M7 17 17 7' }), h('path', { d: 'M9 7h8v8' }))), ' · ', t.arenaSourceNote, 
            // The snapshot's own date is in the header note; this is when we
            // last pulled it, so a stale cache reads differently from a fresh
            // one at a glance.
            data?.at ? h('span', { className: 'osubs-afoot-at' }, ' · ', fill(t.arenaFetched, stamp(data.at))) : null)), shot.layer);
        }
        function SettingsSection({ rpc, close: _close }) {
            const t = COPY[localeOf()];
            const [snap, setSnap] = useState(readStoredSnap);
            const [pending, setPending] = useState({});
            const [error, setError] = useState('');
            const [view, setView] = useState('quota');
            const [family, setFamily] = useState('all');
            const [query, setQuery] = useState('');
            // Seed from the last stored snapshot so reopening the tab shows the
            // previously fetched versions instantly instead of a loading flash.
            const [update, setUpdate] = useState(() => readStoredSnap()?.update ?? null);
            const [updateBusy, setUpdateBusy] = useState(false);
            // Model switches flip on click: the models RPC then rewrites the
            // llm-pi-ai routes through a host settings reconcile that takes seconds.
            // The next snapshot reconciles each key; a failed run() reverts it.
            const [modelOverrides, setModelOverrides] = useState({});
            // The model row whose input-context window is being edited (Models view).
            const [contextEdit, setContextEdit] = useState(null);
            // 额度 → 分享: the cards in scope as one long image (identities masked,
            // the add-account row left out); same flow as 用量's.
            const quotaShot = useShot(t);
            const quotaListRef = useRef(null);
            // 用量: the last answer shows at once (kept across opens); entering the
            // tab asks again only when it is older than USAGE_TTL_MS, 刷新 always.
            const [usage, setUsage] = useState(readStoredUsage);
            const [usageError, setUsageError] = useState('');
            const [usageBusy, setUsageBusy] = useState(false);
            const loadUsage = async (fresh) => {
                setUsageBusy(true);
                try {
                    const result = await callRpc(rpc, 'usage', fresh ? { fresh: true } : undefined);
                    // An older host answers the bare row list.
                    const next = Array.isArray(result) ? { at: Date.now(), rows: result } : result;
                    if (next && typeof next.at === 'number' && Array.isArray(next.rows)) {
                        setUsage(next);
                        writeStoredUsage(next);
                    }
                    setUsageError('');
                }
                catch (caught) {
                    const message = caught instanceof Error ? caught.message : String(caught);
                    setUsageError(isUnknownOauthMethod(message) ? t.hostStale : message);
                }
                finally {
                    setUsageBusy(false);
                }
            };
            useEffect(() => {
                if (view !== 'usage' || usageBusy)
                    return;
                if (usage && Date.now() - usage.at < USAGE_TTL_MS)
                    return;
                void loadUsage(false);
            }, [view]);
            // 榜单: same contract as 用量 — the stored answer shows at once, the
            // tab asks again only past the arena TTL, 刷新 always re-fetches.
            const [arena, setArena] = useState(readStoredArena);
            const [arenaError, setArenaError] = useState('');
            const [arenaBusy, setArenaBusy] = useState(false);
            const loadArena = async (fresh) => {
                setArenaBusy(true);
                try {
                    const next = await callRpc(rpc, 'arena', fresh ? { fresh: true } : undefined);
                    if (next && typeof next.at === 'number' && typeof next.boards === 'object' && next.boards !== null) {
                        setArena(next);
                        writeStoredArena(next);
                    }
                    setArenaError('');
                }
                catch (caught) {
                    const message = caught instanceof Error ? caught.message : String(caught);
                    setArenaError(isUnknownOauthMethod(message) ? t.hostStale : message);
                }
                finally {
                    setArenaBusy(false);
                }
            };
            useEffect(() => {
                if (view !== 'arena' || arenaBusy)
                    return;
                if (arena && Date.now() - arena.at < ARENA_TTL_MS)
                    return;
                void loadArena(false);
            }, [view]);
            // One owner for the status snapshot. A refresh, a models write, an
            // update check, and the auto-update click each stamp a turn when they
            // start. A later success wins; an earlier return must not replace the
            // snap, the stored copy, or paint its error.
            const snapTurn = useRef(0);
            const snapSeen = useRef(0);
            // `fresh` after the user's own action: the answer must not come from a
            // poll's snapshot that was already building before the write.
            // `revalidateQuota` goes with (re)entering the quota view: the host
            // re-reads readings older than its 15s floor behind the cached answer.
            const refresh = useCallback(async (fresh = false, revalidateQuota = false) => {
                if (rpc === undefined)
                    return;
                const mine = ++snapTurn.current;
                try {
                    const payload = fresh || revalidateQuota
                        ? { ...(fresh ? { fresh: true } : {}), ...(revalidateQuota ? { revalidateQuota: true } : {}) }
                        : undefined;
                    const next = await callRpc(rpc, 'status', payload);
                    if (mine < snapSeen.current)
                        return;
                    snapSeen.current = mine;
                    setSnap(next);
                    writeStoredSnap(next);
                    setError('');
                }
                catch (caught) {
                    if (mine < snapSeen.current)
                        return;
                    setError(caught instanceof Error ? caught.message : t.noRpc);
                }
            }, [rpc, t.noRpc]);
            const root = useRef(null);
            // A pending login finishes on the host and only shows up via this poll,
            // so keep the quick cadence then; idle, quota moves at most every 15s.
            const loginPending = useRef(false);
            loginPending.current = Object.values(pending).some(Boolean);
            useEffect(() => {
                // Poll only while the panel is actually on screen; the next tick is
                // armed after the previous refresh settles, so polls never overlap.
                // A hidden tick costs no RPC — it re-checks visibility, so switching
                // back to a retained panel refreshes on the next tick, and a window
                // becoming visible again refreshes at once.
                let live = true;
                let busy = false;
                let timer;
                // The first visible tick and every hidden→shown transition count as
                // entering the page, so quota older than the host floor is re-read.
                let wasShown = false;
                const tick = async () => {
                    if (busy)
                        return;
                    busy = true;
                    clearTimeout(timer);
                    const shown = panelVisible(root.current, document);
                    const entered = shown && !wasShown;
                    wasShown = shown;
                    // A status RPC that never settles must not stop polling for good.
                    if (shown) {
                        await Promise.race([refresh(false, entered), new Promise((resolve) => setTimeout(resolve, 30_000))]);
                    }
                    busy = false;
                    if (live)
                        timer = setTimeout(tick, loginPending.current ? 1500 : 3000);
                };
                const onVisibility = () => { if (!document.hidden)
                    void tick(); };
                document.addEventListener('visibilitychange', onVisibility);
                void tick();
                return () => {
                    live = false;
                    clearTimeout(timer);
                    document.removeEventListener('visibilitychange', onVisibility);
                };
            }, [refresh]);
            useEffect(() => {
                if (!snap?.accounts)
                    return;
                setPending((current) => {
                    let changed = false;
                    const next = { ...current };
                    for (const id of Object.keys(current)) {
                        if (!current[id] || snap.accounts[id]?.busy)
                            continue;
                        next[id] = undefined;
                        changed = true;
                    }
                    return changed ? next : current;
                });
            }, [snap]);
            const run = async (method, payload) => {
                // Stamp when the call starts, not when it returns. A poll that
                // started earlier must not replace this result, and this result
                // must not replace a snapshot that won while the call was in flight.
                const mine = method === 'models' || method === 'update' ? ++snapTurn.current : 0;
                try {
                    const result = await callRpc(rpc, method, payload);
                    if (method === 'login') {
                        setPending((current) => ({ ...current, [payload.provider]: result }));
                        if (result?.authorizeUrl && typeof window !== 'undefined') {
                            window.open(result.authorizeUrl, '_blank', 'noopener');
                        }
                    }
                    if (method === 'logout' || method === 'cancel' || method === 'key') {
                        setPending((current) => ({ ...current, [payload.provider]: undefined }));
                    }
                    if (method === 'update') {
                        if (mine < snapSeen.current)
                            return result;
                        snapSeen.current = mine;
                        setUpdate(result);
                        setSnap((current) => current ? { ...current, update: { ...current.update, ...result } } : current);
                        return result;
                    }
                    if (method === 'models' && result && typeof result === 'object') {
                        // setModels already returns a fresh snapshot — adopt it instead of
                        // spending a second status RPC + snapshot build on convergence.
                        if (mine < snapSeen.current)
                            return true;
                        snapSeen.current = mine;
                        setSnap(result);
                        writeStoredSnap(result);
                        setError('');
                    }
                    else if (method !== 'update') {
                        await refresh(true);
                    }
                    return true;
                }
                catch (caught) {
                    if (mine && mine < snapSeen.current)
                        return false;
                    const message = caught instanceof Error ? caught.message : String(caught);
                    if (isUnknownOauthMethod(message))
                        return false;
                    if (/^unknown provider /i.test(message)) {
                        // Newer page on an older host: the family exists here but not in
                        // the running build (login/import would misbehave or do nothing).
                        setError(t.hostStale);
                        return false;
                    }
                    setError(message === 'cursor-import-empty' ? t.cursorImportEmpty : message === 'ollama-import-empty' ? t.ollamaImportEmpty : message === 'kimi-import-empty' ? t.kimiImportEmpty : message === 'devin-import-empty' ? t.devinImportEmpty : message === 'cline-import-empty' ? t.clineImportEmpty : message === 'command-code-import-empty' ? t.commandCodeImportEmpty : message);
                    return false;
                }
            };
            // quiet: a cached result is already on screen — refresh silently in the
            // background instead of flashing the busy/checking state again.
            const checkUpdate = async (apply = false, quiet = false) => {
                if (!quiet)
                    setUpdateBusy(true);
                try {
                    await run('update', { apply });
                }
                finally {
                    if (!quiet)
                        setUpdateBusy(false);
                }
            };
            useEffect(() => {
                if (view === 'version') {
                    // Re-check on every open, but quietly when a cached result is
                    // already rendered — only the very first visit shows busy.
                    if (!updateBusy)
                        void checkUpdate(false, update !== null);
                }
            }, [view]);
            // A usage-only rail entry has no quota card or model rows: leaving the
            // Usage view falls back to 全部 instead of an empty pane.
            useEffect(() => {
                if (view !== 'usage' && USAGE_ONLY_FAMILIES.includes(family))
                    setFamily('all');
            }, [view]);
            // Returning to the quota view counts as entering the page; the mount
            // case is covered by the poll's first tick.
            const prevView = useRef(view);
            useEffect(() => {
                const before = prevView.current;
                prevView.current = view;
                if (view === 'quota' && before !== 'quota')
                    void refresh(false, true);
            }, [view, refresh]);
            const catalogKeysOf = (fam) => (snap?.catalog ?? [])
                .filter((group) => fam === undefined || group.family === fam)
                .flatMap((group) => (group.models ?? []).map((model) => model.key));
            const toggleModels = (payload, keys, on) => {
                setModelOverrides((current) => {
                    const next = { ...current };
                    for (const key of keys)
                        next[key] = on;
                    return next;
                });
                void Promise.resolve(run('models', payload)).then((ok) => {
                    if (ok !== false)
                        return;
                    setModelOverrides((current) => {
                        const next = { ...current };
                        for (const key of keys)
                            delete next[key];
                        return next;
                    });
                });
            };
            // Drop overrides once a snapshot reports the clicked state (or the row
            // vanished); a stale snapshot keeps them so the switch stays put.
            useEffect(() => {
                setModelOverrides((current) => {
                    const keys = Object.keys(current);
                    if (keys.length === 0)
                        return current;
                    const state = new Map();
                    for (const group of snap?.catalog ?? []) {
                        for (const model of group.models ?? [])
                            state.set(model.key, Boolean(model.enabled));
                    }
                    let changed = false;
                    const next = { ...current };
                    for (const key of keys) {
                        const enabled = state.get(key);
                        if (enabled === undefined || enabled === Boolean(current[key])) {
                            delete next[key];
                            changed = true;
                        }
                    }
                    return changed ? next : current;
                });
            }, [snap]);
            // 默认档位 shows the pick at once (the route rewrite behind it waits on the
            // host settings reconcile); a failed RPC reverts, a matching snapshot drops it.
            const [effortOverrides, setEffortOverrides] = useState({});
            const setEffort = (level, families, all) => {
                setEffortOverrides((current) => ({ ...current, ...Object.fromEntries(families.map((family) => [family, level ?? ''])) }));
                void Promise.resolve(run('models', { effort: level, ...(all ? {} : { families }) })).then((ok) => {
                    if (ok !== false)
                        return;
                    setEffortOverrides((current) => Object.fromEntries(Object.entries(current).filter(([family]) => !families.includes(family))));
                });
            };
            useEffect(() => {
                setEffortOverrides((current) => {
                    const pending = Object.entries(current).filter(([family, level]) => (snap?.efforts?.[family] ?? '') !== level);
                    return pending.length === Object.keys(current).length ? current : Object.fromEntries(pending);
                });
            }, [snap]);
            if (rpc === undefined) {
                return h('p', { className: 'osubs-hint' }, t.noRpc);
            }
            const panel = (id, child, show, fill = false) => h('div', {
                key: id,
                hidden: !show,
                className: `osubs-pane-panel${fill ? ' osubs-pane-panel--fill' : ''}`,
                role: 'tabpanel',
            }, child);
            const card = (id, account = snap?.accounts?.[id]) => h(ProviderCard, {
                t,
                id,
                title: FAMILY_NAME[id] ?? id,
                account,
                pending: pending[id],
                onLogin: (provider, mode, extra) => run('login', { provider, mode, ...extra }),
                onImport: (provider) => run('import', { provider }),
                onLogout: (provider, accountId) => run('logout', { provider, id: accountId }),
                onCancel: (provider) => run('cancel', { provider }),
                onManual: (provider, input) => run('manual', { provider, input }),
                onSwitch: (provider, accountId) => run('switch', { provider, id: accountId }),
                onRefreshQuota: (provider, accountId) => run('quota', { provider, id: accountId }),
                onResetQuota: id === 'codex' || id === 'glm' || id === 'grok'
                    ? (provider, accountId, credit) => run('reset', { provider, id: accountId, ...(provider === 'glm' || provider === 'grok' ? { credit } : {}) })
                    : undefined,
                onUseKey: (provider, key, extra) => run('key', { provider, key, ...(typeof extra === 'string' ? { region: extra } : extra || {}) }),
                onGoSave: async (payload) => {
                    await callRpc(rpc, 'goSave', payload);
                    await refresh(true);
                },
            });
            const catalogGroups = Array.isArray(snap?.catalog) ? snap.catalog : [];
            // One OpenCode account, two products: the credential and the Console read
            // stay shared (one key, one vault), but the 额度 pane keeps them apart —
            // Go's card shows its subscription meters, Zen's card its prepaid wallet,
            // so neither number can be read as the other product's.
            const opencode = snap?.accounts?.['opencode-go'];
            const isZenRow = (row) => typeof row?.kind === 'string' && row.kind.startsWith('zen-');
            const opencodeProductView = (keep) => {
                if (!opencode)
                    return undefined;
                const rows = (Array.isArray(opencode.accounts) ? opencode.accounts : []).map((row) => (row?.quota
                    ? { ...row, quota: { ...row.quota, rows: (Array.isArray(row.quota.rows) ? row.quota.rows : []).filter(keep) } }
                    : row));
                return { ...opencode, accounts: rows };
            };
            const opencodeGoView = opencodeProductView((row) => !isZenRow(row));
            const opencodeZenView = opencodeProductView(isZenRow);
            const zenAccounts = Array.isArray(opencodeZenView?.accounts) ? opencodeZenView.accounts : [];
            // No wallet read (key-only account, or a workspace without Zen billing):
            // no Zen card and no Zen rail entry — nothing to show, and no blank pane.
            const zenVisible = zenAccounts.some((row) => (row?.quota?.rows ?? []).some(isZenRow));
            const accountCountOf = (id) => {
                const roster = id === 'opencode-zen' ? (zenVisible ? zenAccounts : []) : snap?.accounts?.[id]?.accounts;
                return Array.isArray(roster) ? roster.length : 0;
            };
            const modelCountOf = (id) => catalogGroups.reduce((n, group) => n + (railIdOf(group.family) === id && Array.isArray(group.models) ? group.models.length : 0), 0);
            const usageCountOf = usageModelCounts(usage?.rows);
            const railCount = (id) => view === 'models' ? modelCountOf(id) : view === 'usage' ? usageCountOf(id) : accountCountOf(id);
            const railFamilies = view === 'usage'
                ? [...FAMILY_ORDER, ...USAGE_ONLY_FAMILIES]
                // The 额度 rail is account cards: Zen only appears once its wallet read
                // exists (its card has no login form to fill from an empty state).
                : view === 'quota' ? FAMILY_ORDER.filter((id) => id !== 'opencode-zen' || zenVisible) : FAMILY_ORDER;
            // Switched-on models per rail entry, for the mark every rail view
            // carries. Same rule the 模型 table uses: a signed-out family has every
            // switch locked, and a pending override already counts as clicked.
            const modelOn = new Map();
            const allOn = { on: 0, total: 0 };
            for (const group of catalogGroups) {
                const railId = railIdOf(group.family);
                let tally = modelOn.get(railId);
                if (tally === undefined) {
                    tally = { on: 0, total: 0 };
                    modelOn.set(railId, tally);
                }
                for (const model of Array.isArray(group.models) ? group.models : []) {
                    tally.total += 1;
                    allOn.total += 1;
                    if (!group.loggedIn)
                        continue;
                    if (!Boolean(modelOverrides[model.key] ?? model.enabled))
                        continue;
                    tally.on += 1;
                    allOn.on += 1;
                }
            }
            const modelsOnOf = (id) => (id === 'all' ? allOn : (modelOn.get(id) ?? { on: 0, total: 0 }));
            const railItems = [
                { id: 'all', name: t.allFamilies, count: railFamilies.reduce((n, id) => n + railCount(id), 0), models: modelsOnOf('all') },
                ...railFamilies.map((id) => ({ id, name: usageFamilyName(t, id), icon: usageFamilyIcon(id), color: FAMILY_COLOR[id], count: railCount(id), models: modelsOnOf(id) })),
            ];
            // A Zen selection whose wallet vanished falls back to the Go card rather
            // than rendering nothing.
            const quotaScope = family === 'opencode-zen' && !zenVisible ? 'opencode-go' : family;
            const quotaPanel = (id, child) => panel(id, child ?? card(id), view === 'quota' && (quotaScope === 'all' || quotaScope === id));
            return h('div', { className: 'osubs', ref: root }, h('div', { className: 'osubs-ptabs', role: 'tablist' }, h(PageTab, { id: 'quota', label: t.quota, view, onSelect: setView }), h(PageTab, { id: 'models', label: t.modelsTitle, view, onSelect: setView }), h(PageTab, { id: 'usage', label: t.tabUsage, view, onSelect: setView }), h(PageTab, { id: 'arena', label: t.tabArena, view, onSelect: setView }), h(PageTab, { id: 'version', label: t.tabSettings, view, onSelect: setView }), h(PageTab, { id: 'donate', label: t.tabDonate, view, onSelect: setView })), h('div', { className: 'osubs-body' }, (view === 'quota' || view === 'models' || view === 'usage') && h('div', { className: 'osubs-rail' }, h('div', { className: 'osubs-rail-label' }, t.providers), railItems.map((item) => h(RailItem, { item, current: family, onSelect: setFamily, t, key: item.id }))), h('div', { className: 'osubs-pane' }, error && h('p', { className: 'osubs-hint osubs-bad' }, error), snap?.proxy?.error && h('p', { className: 'osubs-hint osubs-bad' }, fill(t.proxyError, snap.proxy.error)), view === 'quota' && h('div', { className: 'osubs-qbar' }, h(ShareButton, {
                t,
                busy: quotaShot.busy,
                // The image masks account identities; the hover title says so.
                hint: t.usageShareMask,
                onClick: () => quotaShot.start(quotaListRef.current, shotFooter(t, {
                    version: aboutVersionOf(snap?.update, update),
                    repo: aboutRepoOf(snap?.update, update),
                    at: Date.now(),
                    scope: `${family === 'all' ? t.allFamilies : usageFamilyName(t, family)} · ${t.quota}`,
                }), `oauth-subs-quota-${stamp(Date.now()).slice(0, 10)}.png`),
            })), 
            // The cards' own box (the pane scrolls and is only as tall as the
            // window), so 分享 captures every card in scope.
            h('div', { className: 'osubs-qlist', ref: quotaListRef, hidden: view !== 'quota' }, quotaPanel('codex'), quotaPanel('chatgpt'), quotaPanel('grok'), quotaPanel('glm'), quotaPanel('kiro'), quotaPanel('antigravity'), quotaPanel('cursor'), quotaPanel('ollama'), quotaPanel('kimi'), quotaPanel('devin'), quotaPanel('cline'), quotaPanel('opencode-go', card('opencode-go', opencodeGoView)), zenVisible && quotaPanel('opencode-zen', h(ZenQuotaCard, {
                t,
                account: opencodeZenView,
                onRefresh: (accountId) => run('quota', { provider: 'opencode-go', id: accountId }),
            })), quotaPanel('command-code')), panel('models', h(ModelsPanel, {
                t,
                catalog: snap?.catalog,
                scope: family,
                railIdOf,
                query,
                onQuery: setQuery,
                onToggle: (key, on) => toggleModels({ key, on }, [key], on),
                onFamily: (fam, on) => toggleModels({ family: fam, on }, catalogKeysOf(fam), on),
                onAll: (on) => toggleModels({ all: on }, catalogKeysOf(), on),
                overrides: modelOverrides,
                onContext: setContextEdit,
                onResetContexts: () => { void run('models', { resetContexts: true }); },
                efforts: { ...snap?.efforts, ...effortOverrides },
                onEffort: setEffort,
                onOpenFamily: (fam) => { setFamily(railIdOf(fam)); setView('quota'); },
            }), view === 'models', true), panel('usage', h(UsagePanel, {
                t,
                data: usage,
                error: usageError,
                scope: family,
                busy: usageBusy,
                onRefresh: () => { void loadUsage(true); },
                version: aboutVersionOf(snap?.update, update),
                repo: aboutRepoOf(snap?.update, update),
            }), view === 'usage'), panel('arena', h(ArenaPanel, {
                t,
                data: arena,
                error: arenaError,
                busy: arenaBusy,
                onRefresh: () => { void loadArena(true); },
                version: aboutVersionOf(snap?.update, update),
                repo: aboutRepoOf(snap?.update, update),
            }), view === 'arena', true), 
            // 设置 tab: the update card on top, the standalone 代理 card below —
            // two sibling cards in one panel, each its own bordered box.
            panel('version', h(Fragment || 'div', null, h(AboutPanel, {
                t,
                local: snap?.update,
                update,
                busy: updateBusy,
                onCheck: () => checkUpdate(false),
                onApply: () => checkUpdate(true),
                autoUpdate: snap?.autoUpdate === true,
                autoState: snap?.autoUpdateState,
                onAutoUpdate: (checked) => {
                    const mine = ++snapTurn.current;
                    if (mine >= snapSeen.current)
                        snapSeen.current = mine;
                    setSnap((current) => current ? { ...current, autoUpdate: checked } : current);
                    void run('autoUpdate', { autoUpdate: checked });
                },
                rpc,
            }), h(ProxyCard, {
                t,
                proxy: snap?.proxy,
                rpc,
                onProxy: (next) => setSnap((current) => current ? { ...current, proxy: next } : current),
            })), view === 'version'), panel('donate', h(DonatePanel, {
                t,
                rpc,
                active: view === 'donate',
            }), view === 'donate'))), contextEdit && h(ContextEditDialog, {
                t,
                model: contextEdit,
                onClose: () => setContextEdit(null),
                // `models` RPC adopts the returned snapshot on success; a failed
                // run keeps the dialog open with the error already surfaced.
                onSubmit: (context) => run('models', { contextKey: contextEdit.key, context }),
            }), quotaShot.layer);
        }
        /** Sidebar rail glyph: a quota gauge — arc + needle. Matches the
            host's outline icon idiom; the PanelRow button owns the chrome. */
        function PanelGlyph({ size }) {
            return h('svg', {
                viewBox: '0 0 20 20', width: size, height: size,
                fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
                strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
            }, h('path', { d: 'M3.4 14a6.8 6.8 0 1 1 13.2 0' }), h('path', { d: 'M10 13.6 13.4 8.4' }), h('circle', { cx: 10, cy: 13.7, r: 1.5, fill: 'currentColor', stroke: 'none' }));
        }
        function apply(ctx) {
            const connection = ctx.get('connection');
            const label = () => COPY[localeOf()].panel;
            ctx.slots.inject('main', () => ctx.slots.register({
                name: 'main',
                key: 'oauth-subs',
                label,
                inject: () => ({ rpc: connection?.rpc }),
            }, SettingsSection));
            ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
                name: 'sidebar.panellist',
                id: 'oauth-subs',
                order: 5,
                label,
            }, PanelGlyph));
        }
        exports.name = name;
        exports.inject = inject;
        exports.apply = apply;
        return module.exports;
    },
});
