import type { AutoPreviewPanel, CandidatePickerState, ShellContextRow, ShellFeedbackKind, ShellOutputPanel } from "./cliShellTypes";
export declare const createOutputPanel: (title: string, content: string, kind?: Exclude<ShellFeedbackKind, "warning">) => ShellOutputPanel;
export declare const getPanelLineIcon: (line: string) => string;
export declare const renderPanelLine: (line: string, kind: Exclude<ShellFeedbackKind, "warning">) => string;
export declare const printSectionTitle: (title: string) => void;
export declare const printOutputPanel: (panel: AutoPreviewPanel | ShellOutputPanel) => void;
export declare const printCandidatePicker: (picker: CandidatePickerState) => void;
export declare const renderContextValue: (row: ShellContextRow) => string;
export declare const renderContextRow: (row: ShellContextRow) => string;
export declare const printContextRows: (rows: readonly ShellContextRow[]) => void;
export declare const printCommandList: (entries: readonly {
    name: string;
    summary: string;
}[], prefix?: string, includeSummary?: boolean) => void;
export declare const printRootQuickStart: () => void;
