import { createTheme } from "@mui/material/styles";

// Exact palette, typography and component defaults from the read-only reference.
export const teacherTheme = createTheme({
  palette: {
    primary: { main: "#4543c0" },
    secondary: { main: "#1e1e2f" },
    background: { default: "#f4f5f7" },
    text: { primary: "#333", secondary: "#777" },
  },
  typography: {
    fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        root: { letterSpacing: "normal", whiteSpace: "normal" },
      },
    },
    MuiButton: {
      styleOverrides: { root: { textTransform: "none", borderRadius: "8px" } },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: "12px",
          boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.05)",
        },
      },
    },
  },
});
