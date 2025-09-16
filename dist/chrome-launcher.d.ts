export declare class ChromeLauncher {
    private chrome;
    private port;
    constructor(port?: number);
    launch(): Promise<any>;
    kill(): Promise<void>;
    getPort(): number;
    getChromeInstance(): any;
}
//# sourceMappingURL=chrome-launcher.d.ts.map