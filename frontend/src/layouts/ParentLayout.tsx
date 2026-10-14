import { Outlet } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import MainLayout from "./MainLayout";
import { teacherTheme } from "../components/teacher/theme";
import "../components/parent/parent.css";

export default function ParentLayout() {
  return (
    <ThemeProvider theme={teacherTheme}>
      <CssBaseline />
      <MainLayout>
        <div className="parent-portal">
          <Outlet />
        </div>
      </MainLayout>
    </ThemeProvider>
  );
}
