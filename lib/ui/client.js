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
                copilotLoginApiKey: '粘贴 GitHub Token',
                copilotKeyPlaceholder: 'ghu_… / ghp_… / GITHUB_TOKEN',
                copilotKeyGo: '保存密钥',
                copilotKeyHint: '粘贴 GitHub Copilot 用的 ghu_ / ghp_ token。也可导入本机 ~/.config/github-copilot/hosts.json。',
                copilotImport: '导入本机 Copilot',
                copilotImportEmpty: '未找到 hosts.json、OpenCode auth.json 或 GITHUB_TOKEN',
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
                checking: '正在检查…',
                updateReady: '有新版本 {n}',
                updateCurrent: '已是最新',
                updateAhead: '本地版本领先发布',
                updateUnknown: 'GitHub 没有可用的版本号',
                updateError: '检查失败',
                proxyError: '出站代理不可用，模型 / 额度 / 登录请求都会失败：{n}',
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
                usageTtft: '首字延迟',
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
                copilotLoginApiKey: 'Paste GitHub token',
                copilotKeyPlaceholder: 'ghu_… / ghp_… / GITHUB_TOKEN',
                copilotKeyGo: 'Save token',
                copilotKeyHint: 'Paste a GitHub Copilot ghu_ / ghp_ token. Or import ~/.config/github-copilot/hosts.json.',
                copilotImport: 'Import local Copilot',
                copilotImportEmpty: 'No hosts.json, OpenCode auth.json, or GITHUB_TOKEN found',
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
                checking: 'Checking…',
                updateReady: 'Update available {n}',
                updateCurrent: 'Up to date',
                updateAhead: 'Local version is ahead of the latest release',
                updateUnknown: 'GitHub did not return a version',
                updateError: 'Update check failed',
                proxyError: 'Outbound proxy unavailable — model, quota and login requests will fail: {n}',
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
                usageTtft: 'First token',
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
            if (family === 'copilot') {
                if (slug === 'proplus' || slug === 'pro_plus' || compact === 'proplus')
                    return 'Pro+';
                if (slug === 'pro' || compact === 'pro')
                    return 'Pro';
                if (slug === 'free' || compact === 'free')
                    return 'Free';
                if (slug === 'business' || compact === 'business')
                    return 'Business';
                if (slug === 'enterprise' || compact === 'enterprise')
                    return 'Enterprise';
                if (slug === 'individual' || compact === 'individual')
                    return 'Individual';
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
        function isCopilotOpaqueIdentity(value) {
            return /^copilot-[0-9a-f]{8}$/i.test(String(value ?? '').trim());
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
            if (family === 'copilot')
                return account && !isCopilotOpaqueIdentity(account) ? account : '';
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
  flex: 0 0 176px; display: flex; flex-direction: column; gap: 2px;
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
.osubs-rail-count { flex: none; font-size: 11px; color: var(--osubs-faint); font-variant-numeric: tabular-nums; }
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
.osubs-tag--on {
  color: inherit;
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, currentColor 55%, transparent);
}
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
.osubs-rstack { position: relative; flex: none; width: 40px; height: 44px; margin-top: 6px; }
.osubs-rstack::before, .osubs-rstack::after {
  content: ''; position: absolute; opacity: 0;
  border: 1px solid color-mix(in oklab, currentColor 55%, transparent); border-bottom: 0;
  transition: opacity 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-rstack::before { left: 4px; right: 4px; top: -4px; height: 4px; border-radius: 5px 5px 0 0; }
.osubs-rstack::after { left: 8px; right: 8px; top: -7px; height: 3px; border-radius: 4px 4px 0 0; }
.osubs-rstack[data-depth="2"]::before,
.osubs-rstack[data-depth="3"]::before,
.osubs-rstack[data-depth="3"]::after { opacity: 1; }
/* Ink card: currentColor fill; the digits knock out to the host surface. */
.osubs-rcard {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border: 1px solid transparent; border-radius: 7px;
  background: currentColor;
  overflow: hidden;
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-rcard-n {
  display: block; font-size: 19px; font-weight: 650; line-height: 1; letter-spacing: -0.02em;
  color: var(--dsw-alias-bg-layer-2, Canvas);
}
.osubs-rcard-u { font-size: 10px; line-height: 1; color: color-mix(in oklab, var(--dsw-alias-bg-layer-2, Canvas) 75%, transparent); }
.osubs-rstack--empty .osubs-rcard { border: 1px dashed var(--osubs-edge); background: transparent; }
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
/* auto-fit: the five stat cards (incl. the cost estimate) sit in one row on a
   wide pane and wrap evenly when narrow; the 560px rule pins 2 columns. */
.osubs-ustats { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: var(--osubs-s3); }
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
  box-shadow: 0 4px 10px -5px color-mix(in oklab, currentColor 45%, transparent);
}

/* Urgent: the earliest banked card expires inside 24h. The stack's ink
   (face + peeking lips) goes bad-red; under 1h the face breathes with a
   period that tightens as expiry nears, and under 10min the face swaps
   the count for a live seconds countdown. */
.osubs-rstack { transition: color 480ms cubic-bezier(0.16, 1, 0.3, 1); }
.osubs-rstack--urgent { color: var(--osubs-bad); }
.osubs-rcard::after {
  content: ''; position: absolute; inset: 0; border-radius: 6px;
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
    box-shadow: 0 0 0 0 color-mix(in oklab, var(--osubs-bad) 0%, transparent);
  }
  50% {
    filter: brightness(1.45);
    box-shadow: 0 2px 12px -1px color-mix(in oklab, var(--osubs-bad) 65%, transparent);
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
  z-index: 1; pointer-events: none;
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
        function Button({ label, onClick, variant, size, type = 'button', disabled, mark }) {
            const classes = ['osubs-btn'];
            if (variant)
                classes.push(`osubs-btn--${variant}`);
            if (size)
                classes.push(`osubs-btn--${size}`);
            if (mark)
                classes.push('osubs-btn--update');
            return h('button', { type, onClick, disabled, className: classes.join(' ') }, label);
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
        function RailItem({ item, current, onSelect }) {
            return h('button', {
                type: 'button',
                'aria-current': current === item.id ? 'true' : undefined,
                className: `osubs-rail-item${current === item.id ? ' osubs-rail-item--on' : ''}`,
                onClick: () => onSelect(item.id),
            }, h('span', { className: 'osubs-rail-ic', style: item.color ? { color: item.color } : undefined }, item.id === 'all'
                ? h(IconGrid)
                : item.icon && h(TabIcon, { name: item.icon, className: 'osubs-rail-icon' })), h('span', { className: 'osubs-rail-name' }, item.name), item.count !== undefined && h('span', { className: 'osubs-rail-count' }, item.count));
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
            const reset = formatReset(row.resetAt, t);
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
        function WarnDialog({ t, description, acknowledged, onAcknowledgedChange, onCancel, onConfirm }) {
            useEffect(() => {
                const onKey = (event) => {
                    if (event.key === 'Escape')
                        onCancel();
                };
                window.addEventListener('keydown', onKey);
                return () => window.removeEventListener('keydown', onKey);
            }, [onCancel]);
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
                });
            }
            return h('div', { className: 'osubs-dsw', role: 'presentation' }, h('div', { className: 'osubs-dsw-mask', 'aria-hidden': 'true', onClick: onCancel }), h('div', {
                className: 'osubs-dsw-card',
                role: 'alertdialog',
                'aria-modal': 'true',
                'aria-labelledby': 'osubs-warn-title',
                'aria-describedby': 'osubs-warn-body',
            }, h('div', { className: 'osubs-dsw-head' }, h('h2', { id: 'osubs-warn-title', className: 'osubs-dsw-title' }, t.quotaResetWarnTitle), h('button', {
                type: 'button',
                className: 'osubs-dsw-x',
                'aria-label': t.quotaResetClose,
                onClick: onCancel,
            }, h(IconClose))), h('div', { className: 'osubs-dsw-body' }, h('div', { className: 'osubs-dsw-warning' }, h(IconWarning), h('p', { id: 'osubs-warn-body' }, description)), h('label', { className: 'osubs-dsw-ack' }, h('input', {
                type: 'checkbox',
                checked: acknowledged,
                autoFocus: true,
                onChange: (event) => onAcknowledgedChange(event.currentTarget.checked),
            }), h('span', null, t.quotaResetAck))), h('div', { className: 'osubs-dsw-foot' }, h('button', { type: 'button', className: 'osubs-dsw-btn osubs-dsw-btn--outline', onClick: onCancel }, t.cancel), h('button', {
                type: 'button',
                className: 'osubs-dsw-btn osubs-dsw-btn--primary',
                disabled: !acknowledged,
                onClick: onConfirm,
            }, t.quotaResetConfirmOk))));
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
            const depth = Math.max(0, Math.min(count, 3));
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
                'data-depth': depth,
                style: blinkMs ? { '--osubs-blink-int': `${blinkMs}ms` } : undefined,
                tabIndex: hasTip ? 0 : undefined,
                'aria-label': hasTip ? fill(t.resetTipLabel, count) : undefined,
                'aria-describedby': hasTip && tipOpen ? tipId : undefined,
                onMouseEnter: open,
                onMouseLeave: shut,
                onFocus: open,
                onBlur: shut,
            }, h('span', { className: 'osubs-rcard', 'aria-hidden': 'true' }, h('span', {
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
                || (row.used !== undefined && row.total !== undefined)));
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
            return h('div', { className: 'osubs-quota' }, quota.status === 'loading' && rows.length === 0 && h('p', { className: 'osubs-hint' }, t.quotaLoading), quota.status === 'error' && !hasUsage && h('p', {
                className: 'osubs-hint osubs-bad',
                title: quota.error || undefined,
            }, `${t.quotaFailed}${quota.error ? ` · ${formatQuotaError(quota.error)}` : ''}`), quota.status === 'ready' && !hasUsage && family !== 'chatgpt' && h('p', { className: 'osubs-hint' }, t.quotaUnknown), family === 'chatgpt' && quota.status !== 'error' && h('p', { className: 'osubs-hint' }, `${t.chatgptPlanHint} `, h('a', { className: 'osubs-link', href: 'https://chatgpt.com/settings/usage', target: '_blank', rel: 'noreferrer' }, t.chatgptManageUsage)), renderQuotaRows(rows, t, family, units), h(ResetBank, { t, quota, family, onReset }));
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
            }, h('div', { className: 'osubs-acct-head' }, h('div', { className: 'osubs-acct-main' }, h('div', { className: 'osubs-acct-row' }, h('span', { className: 'osubs-mono', 'data-shot-mask': '' }, identityOf(row, id)), planLabel && h('span', { className: 'osubs-tag' }, planLabel), row.active && h('span', { className: 'osubs-tag osubs-tag--on' }, t.inUse), id === 'glm' && row.region && h('span', { className: 'osubs-tag' }, regionLabel(row.region)), id === 'kiro' && row.methodLabel && h('span', { className: 'osubs-tag' }, row.methodLabel), (id === 'cursor' || id === 'ollama' || id === 'kimi' || id === 'copilot' || id === 'devin' || id === 'cline' || id === 'command-code') && row.methodLabel && h('span', { className: 'osubs-tag' }, row.methodLabel), id === 'opencode-go' && row.workspaceName && h('span', { className: 'osubs-tag osubs-tag--plain' }, row.workspaceName), id === 'grok' && quota?.hasGrokCodeAccess === true && h('span', { className: 'osubs-tag osubs-tag--plain', title: t.grokCodeHint }, t.grokCode), id === 'grok' && quota?.subscriptionStatus && quota.subscriptionStatus !== 'active' && h('span', { className: 'osubs-tag osubs-tag--warn' }, quota.subscriptionStatus))), h('div', { className: 'osubs-actions', 'data-noshot': '', onClick: (event) => event.stopPropagation() }, !row.active && h(Button, { size: 'sm', onClick: () => onSwitch(id, row.id), label: t.switchTo }), h(Button, {
                size: 'sm',
                disabled: refreshing,
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
                label: h('span', { className: 'osubs-refresh' + (refreshing ? ' osubs-refresh--spin' : '') }, h(IconRefresh), t.quotaRefresh),
            }), h(Button, { size: 'sm', onClick: () => onLogout(id, row.id), label: t.logout }))), h('div', { onClick: (event) => event.stopPropagation() }, id === 'antigravity' && row.needsValidation && h('div', { className: 'osubs-verify' }, h('p', { className: 'osubs-hint osubs-warn' }, t.antigravityVerify), row.validationUrl && h(Button, {
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
                onLogout,
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
            }, h('span', null, id === 'chatgpt' ? t.chatgptLogin : id === 'grok' || id === 'kimi' || id === 'copilot' || id === 'cline' ? t.device : loggedIn ? t.addAccount : t.login)), id === 'grok' && h('button', {
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
            }), h('p', { className: 'osubs-hint' }, t.kimiKeyHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.kimiKeyGo }))), id === 'copilot' && h('button', {
                type: 'button',
                className: 'osubs-login',
                'aria-expanded': showKey, onClick: () => toggleMethod('key'),
            }, h('span', null, t.copilotLoginApiKey)), id === 'copilot' && showKey && !busy && h('form', {
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
                placeholder: t.copilotKeyPlaceholder,
                type: 'password',
                autoFocus: true,
                spellCheck: false,
                'aria-label': t.copilotLoginApiKey,
                autoComplete: 'off',
            }), h('p', { className: 'osubs-hint' }, t.copilotKeyHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.copilotKeyGo }))), id === 'devin' && h('button', {
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
            }, h('span', null, id === 'cursor' ? t.cursorImport : id === 'kimi' ? t.kimiImport : id === 'copilot' ? t.copilotImport : id === 'devin' ? t.devinImport : id === 'cline' ? t.clineImport : id === 'command-code' ? t.commandCodeImport : t.import))), id === 'ollama' && !busy && h('div', { className: 'osubs-logins' }, h('button', {
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
            }, h('span', null, t.import)))));
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
        function AboutPanel({ t, local, update, busy, onCheck, onApply, autoUpdate, autoState, onAutoUpdate, }) {
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
            // The banner owns the status conclusion — the head keeps only the
            // check button; only 当前版本 / 最新版本 exist as version slots.
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
            const Frag = Fragment || 'div';
            return h(Frag, null, pluginCard);
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
        const FAMILY_ORDER = [
            'codex', 'chatgpt', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama',
            'kimi', 'copilot', 'devin', 'cline', 'opencode-go', 'command-code',
        ];
        const FAMILY_NAME = {
            codex: 'Codex', chatgpt: 'ChatGPT', grok: 'Grok', glm: 'GLM', kiro: 'Kiro', antigravity: 'Antigravity',
            cursor: 'Cursor', ollama: 'Ollama', kimi: 'Kimi', copilot: 'Copilot', devin: 'Devin',
            cline: 'Cline', 'opencode-go': 'OpenCode Go', 'command-code': 'Command Code',
        };
        const FAMILY_ICON = {
            codex: 'codex', chatgpt: 'openai', grok: 'grok', glm: 'zai', kiro: 'kiro', antigravity: 'antigravity',
            cursor: 'cursor', ollama: 'ollama', kimi: 'kimi', copilot: 'copilot', devin: 'devin',
            cline: 'cline', 'opencode-go': 'opencodeGo', 'command-code': 'commandCode',
        };
        // Brand tints for rail icons whose LobeHub mark is mono-only; codex,
        // kiro, antigravity, kimi, copilot and devin render their
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
        const railIdOf = (fam) => String(fam ?? '').startsWith('opencode-go') ? 'opencode-go' : String(fam ?? '');
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
            let text = '';
            for (let i = 0; i < style.length; i++)
                text += `${style[i]}:${style.getPropertyValue(style[i])};`;
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
        const shotFooter = (t, { version, repo, at, scope }) => ({
            title: version && version !== '—' ? `${t.pluginAboutTitle} v${version}` : t.pluginAboutTitle,
            repo: String(repo).replace(/^https?:\/\//, ''),
            date: fill(t.usageAnalyzed, stamp(at)),
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
        function ShareButton({ t, busy, disabled, onClick }) {
            return h(Button, {
                size: 'sm', disabled: disabled || busy, onClick,
                label: h('span', { className: 'osubs-refresh' + (busy ? ' osubs-refresh--spin' : '') }, h(IconShare), busy ? t.usageSharing : t.usageShare),
            });
        }
        function UsageSkeleton() {
            return h('div', { className: 'osubs-usk', 'aria-hidden': 'true' }, h('div', { className: 'osubs-ustats' }, [0, 1, 2, 3].map((i) => h('div', { key: i, className: 'osubs-ustat' }, h('i', { className: 'osubs-sk osubs-sk--n' }), h('i', { className: 'osubs-sk osubs-sk--l' })))), h('i', { className: 'osubs-sk osubs-sk--chart' }));
        }
        function UsagePanel({ t, data, error, scope, busy, onRefresh, version, repo }) {
            const [range, setRange] = useState(7);
            const [hover, setHover] = useState(-1);
            const [by, setBy] = useState('model');
            const [copiedId, setCopiedId] = useState(null);
            const shot = useShot(t);
            const cardRef = useRef(null);
            const rows = data?.rows ?? null;
            const ranges = [['today', t.usageToday], [7, fill(t.usageDays, 7)], [30, fill(t.usageDays, 30)]];
            const rangeLabel = ranges.find(([id]) => id === range)?.[1];
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
                onClick: () => { setRange(id); setHover(-1); }, label,
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
            const ttft = usageTtft(total);
            const speed = usageSpeed(total);
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
            return h(Fragment || 'div', null, h('section', { className: 'osubs-card', ref: cardRef }, head, error && h('p', { className: 'osubs-hint osubs-bad' }, error), h('div', { className: 'osubs-ustats' }, stat(t.usageTokens, compactNumber(usageTokens(total)), inOut(total)), stat(t.usageCacheRead, hit != null || total.cacheRead ? compactNumber(total.cacheRead) : '—', hit != null ? fill(t.usageHit, `${Math.round(hit * 100)}%`) : t.usageHitNa, t.usageHitNote), stat(t.usageCalls, total.calls.toLocaleString('en-US'), total.failed ? fill(t.usageFailed, total.failed) : ''), stat(t.usageTtft, ttft != null ? formatMs(ttft) : '—', speed != null ? fill(t.usageSpeed, Math.round(speed)) : ''), stat(t.usageCost, total.cost > 0 || pricedModels ? compactUsd(total.cost) : '—', costSub, t.usageCostNote)), total.calls === 0 && total.failed === 0
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
            // `fresh` after the user's own action: the answer must not come from a
            // poll's snapshot that was already building before the write.
            // `revalidateQuota` goes with (re)entering the quota view: the host
            // re-reads readings older than its 15s floor behind the cached answer.
            const refresh = useCallback(async (fresh = false, revalidateQuota = false) => {
                if (rpc === undefined)
                    return;
                try {
                    const payload = fresh || revalidateQuota
                        ? { ...(fresh ? { fresh: true } : {}), ...(revalidateQuota ? { revalidateQuota: true } : {}) }
                        : undefined;
                    const next = await callRpc(rpc, 'status', payload);
                    setSnap(next);
                    writeStoredSnap(next);
                    setError('');
                }
                catch (caught) {
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
                        setUpdate(result);
                        setSnap((current) => current ? { ...current, update: { ...current.update, ...result } } : current);
                        return result;
                    }
                    if (method === 'models' && result && typeof result === 'object') {
                        // setModels already returns a fresh snapshot — adopt it instead of
                        // spending a second status RPC + snapshot build on convergence.
                        setSnap(result);
                        writeStoredSnap(result);
                    }
                    else {
                        await refresh(true);
                    }
                    return true;
                }
                catch (caught) {
                    const message = caught instanceof Error ? caught.message : String(caught);
                    if (isUnknownOauthMethod(message))
                        return false;
                    if (/^unknown provider /i.test(message)) {
                        // Newer page on an older host: the family exists here but not in
                        // the running build (login/import would misbehave or do nothing).
                        setError(t.hostStale);
                        return false;
                    }
                    setError(message === 'cursor-import-empty' ? t.cursorImportEmpty : message === 'ollama-import-empty' ? t.ollamaImportEmpty : message === 'kimi-import-empty' ? t.kimiImportEmpty : message === 'copilot-import-empty' ? t.copilotImportEmpty : message === 'devin-import-empty' ? t.devinImportEmpty : message === 'cline-import-empty' ? t.clineImportEmpty : message === 'command-code-import-empty' ? t.commandCodeImportEmpty : message);
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
            const card = (id) => h(ProviderCard, {
                t,
                id,
                title: FAMILY_NAME[id] ?? id,
                account: snap?.accounts?.[id],
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
            const accountCountOf = (id) => {
                const roster = snap?.accounts?.[id]?.accounts;
                return Array.isArray(roster) ? roster.length : 0;
            };
            const modelCountOf = (id) => catalogGroups.reduce((n, group) => n + (railIdOf(group.family) === id && Array.isArray(group.models) ? group.models.length : 0), 0);
            const usageCountOf = usageModelCounts(usage?.rows);
            const railCount = (id) => view === 'models' ? modelCountOf(id) : view === 'usage' ? usageCountOf(id) : accountCountOf(id);
            const railFamilies = view === 'usage' ? [...FAMILY_ORDER, ...USAGE_ONLY_FAMILIES] : FAMILY_ORDER;
            const railItems = [
                { id: 'all', name: t.allFamilies, count: railFamilies.reduce((n, id) => n + railCount(id), 0) },
                ...railFamilies.map((id) => ({ id, name: usageFamilyName(t, id), icon: usageFamilyIcon(id), color: FAMILY_COLOR[id], count: railCount(id) })),
            ];
            const quotaPanel = (id) => panel(id, card(id), view === 'quota' && (family === 'all' || family === id));
            return h('div', { className: 'osubs', ref: root }, h('div', { className: 'osubs-ptabs', role: 'tablist' }, h(PageTab, { id: 'quota', label: t.quota, view, onSelect: setView }), h(PageTab, { id: 'models', label: t.modelsTitle, view, onSelect: setView }), h(PageTab, { id: 'usage', label: t.tabUsage, view, onSelect: setView }), h(PageTab, { id: 'version', label: t.tabSettings, view, onSelect: setView }), h(PageTab, { id: 'donate', label: t.tabDonate, view, onSelect: setView })), h('div', { className: 'osubs-body' }, (view === 'quota' || view === 'models' || view === 'usage') && h('div', { className: 'osubs-rail' }, h('div', { className: 'osubs-rail-label' }, t.providers), railItems.map((item) => h(RailItem, { item, current: family, onSelect: setFamily, key: item.id }))), h('div', { className: 'osubs-pane' }, error && h('p', { className: 'osubs-hint osubs-bad' }, error), snap?.proxy?.error && h('p', { className: 'osubs-hint osubs-bad' }, fill(t.proxyError, snap.proxy.error)), view === 'quota' && h('div', { className: 'osubs-qbar' }, h(ShareButton, {
                t,
                busy: quotaShot.busy,
                onClick: () => quotaShot.start(quotaListRef.current, shotFooter(t, {
                    version: aboutVersionOf(snap?.update, update),
                    repo: aboutRepoOf(snap?.update, update),
                    at: Date.now(),
                    scope: `${family === 'all' ? t.allFamilies : usageFamilyName(t, family)} · ${t.quota}`,
                }), `oauth-subs-quota-${stamp(Date.now()).slice(0, 10)}.png`),
            })), 
            // The cards' own box (the pane scrolls and is only as tall as the
            // window), so 分享 captures every card in scope.
            h('div', { className: 'osubs-qlist', ref: quotaListRef, hidden: view !== 'quota' }, quotaPanel('codex'), quotaPanel('chatgpt'), quotaPanel('grok'), quotaPanel('glm'), quotaPanel('kiro'), quotaPanel('antigravity'), quotaPanel('cursor'), quotaPanel('ollama'), quotaPanel('kimi'), quotaPanel('copilot'), quotaPanel('devin'), quotaPanel('cline'), quotaPanel('opencode-go'), quotaPanel('command-code')), panel('models', h(ModelsPanel, {
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
            }), view === 'usage'), panel('version', h(AboutPanel, {
                t,
                local: snap?.update,
                update,
                busy: updateBusy,
                onCheck: () => checkUpdate(false),
                onApply: () => checkUpdate(true),
                autoUpdate: snap?.autoUpdate === true,
                autoState: snap?.autoUpdateState,
                onAutoUpdate: (checked) => {
                    setSnap((current) => current ? { ...current, autoUpdate: checked } : current);
                    void run('autoUpdate', { autoUpdate: checked });
                },
            }), view === 'version'), panel('donate', h(DonatePanel, {
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
