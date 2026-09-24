import type { Profile } from "../criteria";

export interface Finding {
  selector: string;
  sample: string;
  ratio: number;
  threshold: number;
  criterion: "1.4.3" | "1.4.6";
  large: boolean;
}
export interface Unknown { selector: string; reason: string }
export interface ScanResult {
  profile: Profile;
  findings: Finding[];
  unknown: Unknown[];
  checked: number;
}

export type PanelCommand =
  | { type: "RUN"; requestId: number; tabId: number; origin: string; profile: Profile }
  | { type: "STOP"; requestId: number; tabId: number };
export type WorkerReply =
  | { type: "RESULT"; requestId?: number; result: ScanResult }
  | { type: "STOPPED"; requestId: number }
  | { type: "ERROR"; requestId?: number; message: string };
