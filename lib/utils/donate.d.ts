/**
 * Payment QR codes shipped in the package under assets/donate/. Read once and
 * handed to the workbench as data URIs — the client bundle is a classic
 * script with no static-file channel of its own. A file missing from a
 * trimmed install just drops that entry.
 */
export declare function donateQr(): Promise<Record<string, string>>;
