/**
 * Minimal protobuf + Connect-RPC v1 framing for the Devin/Cascade subset this
 * hop sends and reads: GetChatMessage (server stream), GetUserJwt,
 * GetCliModelConfigs, GetUserStatus. Field numbers come from the exa.* protos
 * the Devin CLI 3000.10.31 binary implements, cross-checked against oh-my-pi
 * `pi-catalog`'s vendored copies. Do not vendor the generated tree.
 *
 * Verified live: GetCliModelConfigs / GetUserStatus (unary `application/proto`),
 * GetChatMessage (Connect+proto, gzip frames, JSON end trailer).
 */
export declare const CONNECT_FLAG_GZIP = 1;
export declare const CONNECT_FLAG_END = 2;
/**
 * The 4-byte length prefix is peer-controlled (up to 4 GiB). Cap it so a
 * corrupt stream fails fast instead of buffering gigabytes.
 */
export declare const MAX_CONNECT_FRAME_PAYLOAD: number;
export declare function encodeVarint(value: any): Buffer<ArrayBuffer>;
export declare function encodeKey(field: any, wire: any): Buffer<ArrayBuffer>;
export declare function encodeBytes(field: any, value: any): Buffer<ArrayBuffer>;
export declare function encodeString(field: any, value: any): Buffer<ArrayBuffer>;
export declare function encodeBool(field: any, value: any): Buffer<ArrayBuffer>;
export declare function encodeUint(field: any, value: any): Buffer<ArrayBuffer>;
export declare function encodeDouble(field: any, value: any): Buffer<ArrayBuffer>;
export declare function encodeMessage(field: any, bytes: any): Buffer<ArrayBuffer>;
export declare function readVarint(buf: any, offset?: number): {
    value: number;
    bigint: bigint;
    offset: number;
};
export declare function decodeFields(buf: any): any[];
export declare function fieldBytes(fields: any, number: any): any;
export declare function fieldString(fields: any, number: any): any;
export declare function fieldVarint(fields: any, number: any): any;
/** int64/uint64 past 2^53 stays a BigInt; small values come back as Number. */
export declare function fieldBigint(fields: any, number: any): any;
export declare function fieldBool(fields: any, number: any): boolean | undefined;
export declare function encodeDevinMetadata({ apiKey, userJwt, ideName, ideVersion, extensionName, extensionVersion, locale, os, modelDisplays }?: any): Buffer<ArrayBuffer>;
export declare function encodeGetUserJwtRequest(metadataBytes: any): Buffer<ArrayBuffer>;
export declare function decodeGetUserJwtResponse(buf: any): {
    userJwt: any;
    customApiServerUrl: any;
};
export declare const DEVIN_SOURCE_USER = 1;
export declare const DEVIN_SOURCE_SYSTEM = 2;
export declare const DEVIN_SOURCE_TOOL = 4;
export declare function encodeChatToolCall({ id, name, argumentsJson }?: any): Buffer<ArrayBuffer>;
export declare function decodeChatToolCall(buf: any): {
    id: any;
    name: any;
    argumentsJson: any;
};
export declare function encodeImageData({ base64Data, mimeType }?: any): Buffer<ArrayBuffer>;
export declare function encodeChatMessagePrompt({ messageId, source, prompt, toolCalls, toolCallId, toolResultIsError, images, thinking, signature, }?: any): Buffer<ArrayBuffer>;
export declare function encodeChatToolDefinition({ name, description, jsonSchemaString, strict }?: any): Buffer<ArrayBuffer>;
export declare function encodeChatToolChoice({ optionName, toolName }?: any): Buffer<ArrayBuffer>;
/** PromptCacheOptions { type = 1 } — CACHE_CONTROL_TYPE_EPHEMERAL = 1. */
export declare function encodePromptCacheOptions(type?: number): Buffer<ArrayBuffer>;
export declare const DEVIN_REQUEST_TYPE_CASCADE = 5;
export declare const DEVIN_PLANNER_MODE_DEFAULT = 1;
export declare function encodeCompletionConfiguration({ maxTokens, temperature, topP, stopPatterns, }?: any): Buffer<ArrayBuffer>;
export declare function encodeGetChatMessageRequest({ metadata, prompt, chatMessagePrompts, chatModelUid, configuration, tools, toolChoice, cascadeId, executionId, plannerMode, requestType, }?: any): Buffer<ArrayBuffer>;
export declare const DEVIN_STOP_REASON_MAX_TOKENS = 3;
export declare const DEVIN_STOP_REASON_FUNCTION_CALL = 10;
export declare const DEVIN_STOP_REASON_ERROR = 13;
export declare function decodeGetChatMessageResponse(buf: any): {
    messageId: any;
    deltaText: any;
    deltaTokens: any;
    stopReason: any;
    deltaToolCalls: any;
    usage: {
        modelUid: any;
        inputTokens: number;
        outputTokens: number;
        cacheWriteTokens: number;
        cacheReadTokens: number;
    } | undefined;
    deltaThinking: any;
    deltaSignature: any;
    actualModelUid: any;
};
export declare function encodeGetCliModelConfigsRequest(metadataBytes: any): Buffer<ArrayBuffer>;
export declare function decodeGetCliModelConfigsResponse(buf: any): any;
export declare function encodeGetUserStatusRequest(metadataBytes: any): Buffer<ArrayBuffer>;
export declare function decodeGetUserStatusResponse(buf: any): {
    userStatus: {
        pro: boolean | undefined;
        name: any;
        teamId: any;
        email: any;
        teamsTier: any;
        planStatus: {
            planInfo: {
                teamsTier: any;
                planName: any;
                devinInfo: {
                    canUseCli: boolean | undefined;
                    webappHost: any;
                    apiUrl: any;
                    accountDisplayName: any;
                } | undefined;
                isDevin: boolean | undefined;
                hideDailyQuota: boolean;
                hideWeeklyQuota: boolean;
            } | undefined;
            planStart: any;
            planEnd: any;
            availablePromptCredits: any;
            usedPromptCredits: any;
            dailyQuotaRemainingPercent: any;
            weeklyQuotaRemainingPercent: any;
            dailyQuotaResetAt: number | undefined;
            weeklyQuotaResetAt: number | undefined;
        } | undefined;
        userId: any;
    } | undefined;
    planInfo: {
        teamsTier: any;
        planName: any;
        devinInfo: {
            canUseCli: boolean | undefined;
            webappHost: any;
            apiUrl: any;
            accountDisplayName: any;
        } | undefined;
        isDevin: boolean | undefined;
        hideDailyQuota: boolean;
        hideWeeklyQuota: boolean;
    } | undefined;
};
/** Compress then frame: flag bit 0x01 marks a gzipped payload, 0x02 the JSON trailer. */
export declare function frameConnect(payload: any, { compress, end }?: {
    compress?: boolean | undefined;
    end?: boolean | undefined;
}): Buffer<ArrayBuffer>;
/**
 * Split a buffered chunk into Connect frames. Returns `{ frames, rest }`;
 * a declared payload over MAX_CONNECT_FRAME_PAYLOAD throws before buffering.
 */
export declare function splitConnectFrames(buf: any): {
    frames: any[];
    rest: Buffer<any>;
};
export declare function unframePayload(frame: any): any;
/** Unary replies arrive as raw proto, a single Connect frame, or gzipped. */
export declare function decodeUnaryBody(buf: any): any;
/** Connect end trailer: `{ error: { code, message } }` or `{}` on success. */
export declare function connectTrailerError(text: any): string | undefined;
