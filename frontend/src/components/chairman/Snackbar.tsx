import { useEffect } from "react";
import LegacyIcon from "../LegacyIcon";
import { IconButton } from "./ui";

export interface SnackbarMessage {
  message: string;
  severity: "success" | "error" | "info";
}
interface SnackbarProps {
  notification: SnackbarMessage | null;
  onClose: () => void;
}
export default function Snackbar({ notification, onClose }: SnackbarProps) {
  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(timer);
  }, [notification, onClose]);
  if (!notification) return null;
  const colors = {
    success: "bg-[#edf7ed] text-[#1e4620]",
    error: "bg-[#fdeded] text-[#5f2120]",
    info: "bg-[#e5f6fd] text-[#014361]",
  };
  return (
    <div
      role="alert"
      className={`fixed bottom-2 left-2 right-2 z-[1400] flex items-start rounded-lg px-4 py-1.5 text-sm leading-[1.43] legacy-sm:bottom-6 legacy-sm:left-auto legacy-sm:right-6 ${colors[notification.severity]}`}
    >
      <LegacyIcon
        name={
          notification.severity === "success"
            ? "CheckCircleOutline"
            : notification.severity === "error"
              ? "ErrorOutline"
              : "InfoOutlined"
        }
        className="my-[7px] mr-3 size-[22px] shrink-0"
      />
      <div className="min-w-0 break-words py-2">{notification.message}</div>
      <div className="-mr-2 ml-4 flex pt-1">
        <IconButton
          small
          aria-label="Close notification"
          onClick={onClose}
          className="text-inherit"
        >
          <LegacyIcon name="Close" className="size-5" />
        </IconButton>
      </div>
    </div>
  );
}
