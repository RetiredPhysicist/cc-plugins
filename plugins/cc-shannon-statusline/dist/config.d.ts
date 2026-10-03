export interface StatuslineConfig {
    rain: boolean;
    throughput: boolean;
}
export declare const DEFAULT_STATUSLINE_CONFIG: StatuslineConfig;
/**
 * Config lives under a package-specific directory. Older installs of the
 * pre-rename package used the same directory without the `cc-` prefix; read
 * that path as a fallback so an upgrade does not silently reset the user's
 * toggles.
 */
export declare function getConfigPath(homeDir?: string): string;
export declare function loadConfig(homeDir?: string): StatuslineConfig;
//# sourceMappingURL=config.d.ts.map