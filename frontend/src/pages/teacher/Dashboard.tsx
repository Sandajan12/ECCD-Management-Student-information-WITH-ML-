import React, { useState, useContext } from "react";
import { SettingsContext } from "../../context/SettingsContext";
import {
  Box,
  Typography,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Stack,
} from "@mui/material";
import PeopleIcon from "@mui/icons-material/People";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import GpsFixedRoundedIcon from "@mui/icons-material/GpsFixedRounded";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useTeacher } from "../../context/TeacherContext";
import type { Period } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { useTeacherDashboard } from "../../hooks/useTeacherDashboard";
import type { DashboardStatCardProps } from "../../components/teacher/DashboardStatCard";
import { ASSESSMENT_PERIOD_LABELS } from "../../components/chairman/dashboardFilters";
import { PERIODS } from "../../types";
import { PendingEvaluations } from "../../components/teacher/PendingEvaluations";

const Dashboard: React.FC = () => {
  const { settings } = useContext(SettingsContext);
  const { user } = useAuth();
  const { section } = useTeacher();
  const [filterDomain, setFilterDomain] = useState<string>("All");
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("PRE");
  const { filters, summary, chart } = useTeacherDashboard(
    section?.section_id,
    selectedPeriod,
    filterDomain,
    user?.id || 0,
  );
  const domains = filters.data?.domains || [];
  const schoolYear =
    settings.current_school_year || filters.data?.currentSchoolYear || "";
  const teacherName =
    user?.full_name?.trim() ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Teacher";
  const insights = summary.data?.teacherInsights;
  const pieData = chart.data || [];
  const totalItems = pieData.reduce((sum, item) => sum + item.value, 0);
  const excellence = insights?.excellingDomain;
  const critical = insights?.criticalDomain;
  const hasRecords = Boolean(insights?.domains.length);
  const summaryPlaceholder = !section
    ? "No section assigned"
    : summary.status === "error"
      ? "Summary unavailable"
      : "Loading...";
  const emptySubtitle = insights ? "No period data" : summaryPlaceholder;
  const selectedDomain = insights?.domains.find(
    (domain) => domain.domainName === filterDomain,
  );
  const formatDomainName = (name: string) => name.replace(/ Domain$/, "");
  const stats: DashboardStatCardProps[] = [
    {
      title: "Total Students",
      value: insights ? insights.totalStudents : "—",
      subtitle: "Active Enrollees",
      icon: <PeopleIcon className="w-4! h-4!" />,
      iconClassName: "bg-[var(--primary)]/10 text-[var(--primary)]",
    },
    {
      title: "Assessment Progress",
      value: insights
        ? `${insights.completedStudents} / ${insights.totalStudents}`
        : "—",
      subtitle: "Evaluations Completed",
      icon: <ShowChartIcon className="w-4! h-4!" />,
      iconClassName: "bg-[var(--primary)]/10 text-[var(--primary)]",
    },
    {
      title: "Domain of Excellence",
      value: excellence
        ? formatDomainName(excellence.domainName)
        : insights
          ? "No Data"
          : "—",
      subtitle: excellence ? `${excellence.masteryRate}% Kaya` : emptySubtitle,
      icon: <EmojiEventsRoundedIcon className="w-4! h-4!" />,
      iconClassName: "bg-emerald-50 text-emerald-600",
      badgeClassName: excellence
        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
        : undefined,
      muted: !excellence,
    },
    {
      title: "Critical Domain Focus",
      value: critical
        ? formatDomainName(critical.domainName)
        : hasRecords
          ? "No Di-Kaya Recorded"
          : insights
            ? "No Data"
            : "—",
      subtitle: critical
        ? `${Math.round((critical.totalDiKaya * 10000) / critical.totalItems) / 100}% Di-Kaya`
        : hasRecords
          ? "No Di-Kaya"
          : emptySubtitle,
      icon: <GpsFixedRoundedIcon className="w-4! h-4!" />,
      iconClassName: "bg-rose-50 text-rose-600",
      badgeClassName: critical
        ? "bg-rose-50 text-rose-700 border border-rose-200"
        : undefined,
      muted: !critical,
    },
  ];
  return (
    <Box
      className="bg-slate-50 [--primary:var(--primary-color,#2563eb)]"
      sx={{
        minHeight: "calc(100vh - 4.5rem)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        py: { xs: 2, sm: 3, md: 4 },
        px: { xs: 1, sm: 2, md: 3 },
        maxWidth: "90rem",
        mx: "auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <Stack
        component="header"
        direction={{ xs: "column", lg: "row" }}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "stretch", lg: "center" },
          mb: 2.5,
          gap: 3,
          minWidth: 0,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            variant="h5"
            sx={{
              fontWeight: "bold",
              color: "#1f2937",
              fontSize: { xs: "1.2rem", sm: "1.4rem" },
            }}
          >
            Educational Overview
          </Typography>
          <Typography
            variant="body2"
            sx={{ mt: 0.5, color: "text.secondary", overflowWrap: "anywhere" }}
          >
            Welcome, Tr. {teacherName}
          </Typography>
        </Box>
        <Grid
          container
          component="section"
          aria-label="Dashboard filters"
          spacing={1.5}
          sx={{ width: "100%", maxWidth: { lg: "42rem" }, minWidth: 0 }}
        >
          <Grid size={{ xs: 12, sm: 4 }} sx={{ minWidth: 0 }}>
            <FormControl fullWidth size="small" disabled={!schoolYear}>
              <InputLabel id="teacher-school-year-label">
                School Year
              </InputLabel>
              <Select
                labelId="teacher-school-year-label"
                label="School Year"
                value={schoolYear}
                className="[&:hover_.MuiOutlinedInput-notchedOutline]:border-[var(--primary)]/50! [&.Mui-focused_.MuiOutlinedInput-notchedOutline]:border-[var(--primary)]! [&.Mui-focused]:ring-2 [&.Mui-focused]:ring-[var(--primary)]/20"
                sx={{ borderRadius: 3 }}
              >
                {schoolYear && (
                  <MenuItem value={schoolYear}>{schoolYear}</MenuItem>
                )}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }} sx={{ minWidth: 0 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="teacher-period-label">
                Assessment Period
              </InputLabel>
              <Select
                labelId="teacher-period-label"
                label="Assessment Period"
                value={selectedPeriod}
                className="[&:hover_.MuiOutlinedInput-notchedOutline]:border-[var(--primary)]/50! [&.Mui-focused_.MuiOutlinedInput-notchedOutline]:border-[var(--primary)]! [&.Mui-focused]:ring-2 [&.Mui-focused]:ring-[var(--primary)]/20"
                sx={{ borderRadius: 3 }}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "PRE" || value === "MID" || value === "POST")
                    setSelectedPeriod(value);
                }}
              >
                {PERIODS.map((period) => (
                  <MenuItem key={period} value={period}>
                    {ASSESSMENT_PERIOD_LABELS[period]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid
            size={{ xs: 12, sm: 4 }}
            sx={{ minWidth: 0, display: "flex", alignItems: "center" }}
          >
            <Typography
              variant="subtitle2"
              className="bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/20"
              sx={{
                fontWeight: "bold",
                px: 2,
                minHeight: "2.5rem",
                display: "flex",
                alignItems: "center",
                borderRadius: 2,
                width: "100%",
                overflowWrap: "anywhere",
              }}
            >
              Section: {section?.section_name || "No section assigned"}
            </Typography>
          </Grid>
        </Grid>
      </Stack>
      <Box
        component="section"
        aria-label="Section statistics"
        aria-busy={summary.status === "loading"}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch auto-rows-fr"
        sx={{ mb: 3.5 }}
      >
        {stats.map((stat) => (
          <article
            key={stat.title}
            aria-label={stat.title}
            className="min-w-0 flex flex-col justify-between p-4 sm:p-5 lg:px-3 xl:px-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm"
          >
            <div className="flex items-center justify-center gap-2">
              <div
                aria-hidden="true"
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${stat.iconClassName}`}
              >
                {stat.icon}
              </div>
              <h2
                title={stat.title}
                className="min-w-0 line-clamp-2 text-xs font-semibold text-slate-600 text-center leading-tight"
              >
                {stat.title}
              </h2>
            </div>
            <div
              title={typeof stat.value === "string" ? stat.value : undefined}
              className={`my-1 min-w-0 text-center tracking-tight ${stat.muted ? "truncate text-[11px] font-normal text-slate-400" : `line-clamp-2 break-words text-xl sm:text-2xl font-bold text-slate-900 leading-6 sm:leading-6 ${stat.title === "Assessment Progress" ? "" : "lg:text-base lg:leading-[1.125rem] xl:text-2xl xl:leading-6"}`}`}
            >
              {stat.value}
            </div>
            <div className="h-6 flex min-w-0 shrink-0 items-center justify-center text-center">
              <span
                title={stat.subtitle}
                className={`min-w-0 max-w-full leading-3 ${stat.muted ? "text-[11px] font-normal text-slate-400" : "text-xs font-medium"} ${stat.badgeClassName ? `rounded-full px-2 py-0.5 lg:px-1 lg:text-[11px] xl:px-2 xl:text-xs ${stat.badgeClassName}` : stat.muted ? "" : "text-slate-500"}`}
              >
                {stat.subtitle}
              </span>
            </div>
          </article>
        ))}
      </Box>
      {(!section || summary.status === "error") && (
        <Typography role="status" sx={{ mb: 3, color: "text.secondary" }}>
          {summaryPlaceholder}
        </Typography>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch [&>section]:border-slate-200/80">
        <section
          aria-labelledby="eccd-development-title"
          className="min-w-0 flex flex-col p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm"
        >
          <Box sx={{ mb: 3 }}>
            <Typography
              id="eccd-development-title"
              component="h2"
              variant="h6"
              sx={{ fontWeight: "bold", color: "#1f2937", mb: 2 }}
            >
              ECCD Development
            </Typography>

            <FormControl size="small" sx={{ width: "100%", minWidth: 0 }}>
              <InputLabel id="teacher-chart-domain-label">Domain</InputLabel>
              <Select
                labelId="teacher-chart-domain-label"
                value={filterDomain}
                label="Domain"
                className="[&:hover_.MuiOutlinedInput-notchedOutline]:border-[var(--primary)]/50! [&.Mui-focused_.MuiOutlinedInput-notchedOutline]:border-[var(--primary)]! [&.Mui-focused]:ring-2 [&.Mui-focused]:ring-[var(--primary)]/20"
                sx={{ borderRadius: 3 }}
                onChange={(e) => setFilterDomain(e.target.value)}
              >
                <MenuItem value="All">All Domains</MenuItem>
                {domains.length === 0 && (
                  <MenuItem disabled>No Domains</MenuItem>
                )}
                {domains.map((dom) => (
                  <MenuItem key={dom} value={dom}>
                    {dom}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Divider sx={{ mb: 3 }} />

          <Box
            aria-label="ECCD development chart"
            aria-busy={chart.status === "loading"}
            sx={{
              width: "100%",
              maxWidth: "24rem",
              aspectRatio: "1 / 1",
              flexShrink: 0,
              mx: "auto",
            }}
          >
            {totalItems > 0 ? (
              <ResponsiveContainer
                width="100%"
                aspect={1}
                minWidth={0}
                initialDimension={{ width: 300, height: 300 }}
              >
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius="50%"
                    outerRadius="70%"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Box
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.6,
                }}
              >
                <ShowChartIcon sx={{ fontSize: 48, color: "#9ca3af", mb: 2 }} />
                <Typography
                  variant="body1"
                  sx={{ color: "#6b7280", fontWeight: "500" }}
                >
                  {!section
                    ? "No section assigned"
                    : chart.status === "loading"
                      ? "Loading assessment data..."
                      : chart.status === "error"
                        ? "Assessment data unavailable"
                        : "No ECCD assessment data for this selection."}
                </Typography>
                <Typography variant="caption" sx={{ color: "#9ca3af" }}>
                  Try selecting a different domain or testing period.
                </Typography>
              </Box>
            )}
          </Box>
          <Stack sx={{ gap: 1, mt: 2, textAlign: "center" }} aria-live="polite">
            {chart.status === "ready" && (
              <>
                <div
                  aria-label="Assessment item totals"
                  className="flex flex-wrap items-center justify-center gap-2"
                >
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs px-3 py-1 rounded-lg font-medium">
                    Total Kaya:{" "}
                    {pieData.find((item) => item.name === "KAYA")?.value || 0}
                  </span>
                  <span className="bg-rose-50 text-rose-700 border border-rose-200 text-xs px-3 py-1 rounded-lg font-medium">
                    Total Di-Kaya:{" "}
                    {pieData.find((item) => item.name === "DI-KAYA")?.value ||
                      0}
                  </span>
                </div>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {totalItems} recorded items
                </Typography>
              </>
            )}
            {selectedDomain && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {formatDomainName(selectedDomain.domainName)}:{" "}
                {selectedDomain.masteryRate}% Kaya
              </Typography>
            )}
          </Stack>
        </section>
        <PendingEvaluations
          section={section}
          period={selectedPeriod}
          ownerId={user?.id || 0}
        />
      </div>
    </Box>
  );
};
export default Dashboard;
