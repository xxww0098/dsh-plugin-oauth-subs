/**
 * gRPC-web codec for grok.com reset cards (「重置卡」):
 *   POST grok.com/prod_mc_billing.ConsumerUiSvc/GetRemainingResets  (empty request)
 *   POST grok.com/prod_mc_billing.ConsumerUiSvc/RedeemReset         (token_id = field 10)
 *
 * The grok CLI (1.0.44) has no client for either RPC; grok.com's web usage page
 * does. References: stablyai/orca PR #18116 (live GetRemainingResets hex) and
 * diegosouzapw/OmniRoute dd263fe (redeem status mapping).
 *
 * Response: repeated top-level field 10 = ConsumerResetToken. orca's live
 * capture numbers the token fields 10 (id) / 20 (granted) / 30 (expires, a
 * google.protobuf.Timestamp); OmniRoute's notes say 1 / 2 / 3 with bare unix
 * seconds. Both shapes decode. An empty DATA frame + grpc-status 0 is a real
 * zero-card inventory.
 *
 * Token ids (`restok_…`) redeem a card for whoever holds the bearer, so they
 * never leave the host: the public id is a hash, resolved by re-listing.
 */
/** Split a gRPC-web body into its data payload and trailer status/message. */
export declare function readGrokRpc(buffer: any, headerStatus?: any, headerMessage?: any): {
    payload: Buffer<ArrayBuffer>;
    grpcStatus: string | undefined;
    grpcMessage: any;
};
/** Public card id: stable per token, useless without the host's re-list. */
export declare function grokResetCardId(tokenId: any): string;
/**
 * GetRemainingResets payload → live tokens, earliest expiry first. Expired
 * tokens are dropped; undefined when the message itself is malformed.
 */
export declare function decodeGrokResetTokens(payload: any, now?: number): any[] | undefined;
/** Tokens → the shared resetCredits bank (ids hashed, token ids dropped). */
export declare function grokResetBank(tokens: any): {
    nextExpiresAt?: any;
    availableCount: any;
    credits: any;
};
/** One gRPC-web data frame. */
export declare function grokRpcFrame(payload?: Buffer<ArrayBuffer>): Buffer<ArrayBuffer>;
/** ConsumerRedeemResetReq { token_id = 10 }, framed. */
export declare function grokRedeemResetFrame(tokenId: any): Buffer<ArrayBuffer>;
/**
 * RedeemReset status → outcome. 0 = reset; 9 "already …" = this token was
 * already spent (a retry after a lost answer — treat as done); 9 otherwise
 * or 3 "token_id" = no such card. Anything else is a failure.
 */
export declare function grokRedeemOutcome(grpcStatus: any, grpcMessage?: any): "failed" | "reset" | "alreadyRedeemed" | "noCredit";
