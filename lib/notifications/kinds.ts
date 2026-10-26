export const NOTIFY_KINDS = {
  message_inbound: { sound: "message", tagPrefix: "msg" },
  alerts_toggle: { sound: "success", tagPrefix: "alerts" },
  lead_assigned: { sound: "attention", tagPrefix: "lead-assigned" },
  lead_won: { sound: "success", tagPrefix: "lead-won" },
  lead_lost: { sound: "failure", tagPrefix: "lead-lost" },
  mention: { sound: "attention", tagPrefix: "mention" },
  central: { sound: "attention", tagPrefix: "central" },
} as const;

export type NotifyKind = keyof typeof NOTIFY_KINDS;
