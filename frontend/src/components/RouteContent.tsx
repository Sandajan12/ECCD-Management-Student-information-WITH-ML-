import { Component, Suspense, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";

interface RouteContentProps {
  children?: ReactNode;
}

interface RouteErrorState {
  failed: boolean;
}

class RouteErrorBoundary extends Component<RouteContentProps, RouteErrorState> {
  state: RouteErrorState = { failed: false };

  static getDerivedStateFromError(): RouteErrorState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <Stack role="alert" sx={{ p: 3, gap: 2, borderRadius: 3 }}>
          This page could not load. Reconnect and reload to try again.
          <Button
            onClick={() => window.location.reload()}
            sx={{ borderRadius: 3, alignSelf: "flex-start" }}
          >
            Reload page
          </Button>
        </Stack>
      );
    }
    return this.props.children;
  }
}

export default function RouteContent({ children }: RouteContentProps) {
  return (
    <RouteErrorBoundary>
      <Suspense
        fallback={
          <Stack
            role="status"
            sx={{ p: 3, gap: 2, borderRadius: 3, color: "text.secondary" }}
          >
            Loading page…
          </Stack>
        }
      >
        {children ?? <Outlet />}
      </Suspense>
    </RouteErrorBoundary>
  );
}
