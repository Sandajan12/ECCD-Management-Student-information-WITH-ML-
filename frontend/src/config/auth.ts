// This controls the browser flow only; the backend enforces ENABLE_OTP independently.
export const OTP_ENABLED: boolean = import.meta.env.VITE_ENABLE_OTP !== "false";
