import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { SettingsContext } from "../../context/SettingsContext";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  TextField,
  Grid,
} from "@mui/material";
import PeopleIcon from "@mui/icons-material/People";
import MessageIcon from "@mui/icons-material/Message";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import AssessmentIcon from "@mui/icons-material/Assessment";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import api from "../../services/api";
import { useTeacher } from "../../context/TeacherContext";
import { sectionPriority } from "../../utils/teacherMetrics";
import type { Assessment, Domain, Student } from "../../types";
import { useAuth } from "../../context/AuthContext";
import { assessmentRefreshScheduler } from "../../hooks/assessmentRefresh";
interface DashboardStats {
  totalStudents: string | number;
  unreadMessages: string | number;
  eccdProgress: string;
  priorityDomain: string;
}
interface Message {
  id: number;
  read: boolean;
  name: string;
  time: string;
  preview: string;
}
interface PieData {
  name: string;
  value: number;
  color: string;
}
interface DashboardResponse {
  stats: DashboardStats;
  messages: Message[];
}
interface DashboardFilters {
  sections: string[];
  domains: string[];
}
interface GenderDistribution {
  male: number;
  female: number;
}
const emptyStats: DashboardStats = {
  totalStudents: "0",
  unreadMessages: "0",
  eccdProgress: "0%",
  priorityDomain: "None",
};
const Dashboard: React.FC = () => {
  const { settings } = useContext(SettingsContext);
  const { user } = useAuth();
  const { section, sections } = useTeacher();
  const navigate = useNavigate();
  const filterSection = section?.section_name || "";
  const [filterDomain, setFilterDomain] = useState("All");
  const [filterPeriod, setFilterPeriod] = useState("PRE");
  const [pieData, setPieData] = useState<PieData[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    ...emptyStats,
    priorityDomain: "Loading...",
  });
  const [distribution, setDistribution] = useState<GenderDistribution>({
    male: 0,
    female: 0,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    let current = true;
    let controller: AbortController | null = null;
    setDashboardStats({ ...emptyStats, priorityDomain: "Loading..." });
    setMessages([]);
    setDistribution({ male: 0, female: 0 });
    const load = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const signal = request.signal;
      const activeRequest = () => current && !signal.aborted;
      void api
        .get<DashboardFilters>("/api/teachers/dashboard-filters", { signal })
        .then(({ data }) => {
          if (!activeRequest()) return;
          setDomains(data.domains || []);
          setFilterDomain((previous) =>
            previous === "All" || data.domains.includes(previous)
              ? previous
              : data.domains[0] || "All",
          );
        })
        .catch(() => {
          if (activeRequest()) setDomains([]);
        });
      if (!section) return;

      let roster: Student[] | undefined;
      let questionCount: number | undefined;
      let submitted: number | undefined;
      let priorityDomain: string | undefined;
      let progress: string | undefined;
      const updateProgress = () => {
        if (
          !activeRequest() ||
          !roster ||
          questionCount === undefined ||
          submitted === undefined
        )
          return;
        const required = roster.length * questionCount * 3;
        progress = required
          ? Math.min(100, (submitted / required) * 100).toFixed(1) + "%"
          : "0%";
        setDashboardStats((previous) => ({
          ...previous,
          eccdProgress: progress!,
        }));
      };
      // Each response publishes its own fields. Reference/progress failures
      // must not hide an already available roster, summary or recent feed.
      void api
        .get<DashboardResponse>("/api/teachers/dashboard-stats", {
          params: { section: section.section_name },
          signal,
        })
        .then(({ data }) => {
          if (!activeRequest()) return;
          setDashboardStats((previous) => ({
            ...emptyStats,
            ...data.stats,
            totalStudents: roster ? roster.length : data.stats.totalStudents,
            priorityDomain:
              priorityDomain ?? data.stats.priorityDomain ?? "None",
            eccdProgress: progress ?? previous.eccdProgress,
          }));
          setMessages(data.messages || []);
        })
        .catch(() => {
          if (!activeRequest()) return;
          setDashboardStats((previous) => ({
            ...previous,
            unreadMessages: 0,
            priorityDomain: priorityDomain ?? "None",
          }));
          setMessages([]);
        });
      void api
        .get<Student[]>("/api/students/section/" + section.section_id, {
          signal,
        })
        .then(async ({ data }) => {
          if (!activeRequest()) return;
          const active = data.filter(
            (s) => s.is_active && s.section_id === section.section_id,
          );
          roster = active;
          setDashboardStats((previous) => ({
            ...previous,
            totalStudents: active.length,
          }));
          setDistribution({
            male: active.filter((s) => s.gender?.toLowerCase() === "male")
              .length,
            female: active.filter((s) => s.gender?.toLowerCase() === "female")
              .length,
          });
          updateProgress();
          // Preserve the existing latest-period-per-student priority rule for
          // multiple assignments. Single-section views never need checklists.
          if (sections.length > 1) {
            const records = await Promise.all(
              active.map(async (student) => {
                const response = await api.get<Assessment>(
                  `/api/eccd/assessment/${student.student_id}`,
                  { signal },
                );
                return response.data;
              }),
            );
            if (!activeRequest()) return;
            priorityDomain = sectionPriority(records);
            setDashboardStats((previous) => ({
              ...previous,
              priorityDomain: priorityDomain!,
            }));
          }
        })
        .catch(() => {
          // Keep independently loaded summary data when roster/detail fails.
        });
      void api
        .get<Domain[]>("/api/eccd/domains-progress", { signal })
        .then(({ data }) => {
          if (!activeRequest()) return;
          questionCount = data.reduce(
            (sum, domain) => sum + domain.questions.length,
            0,
          );
          updateProgress();
        })
        .catch(() => {
          // Keep other cards available; only completion needs the denominator.
        });
      void api
        .get<PieData[]>("/api/teachers/dashboard-pie", {
          params: {
            section: section.section_name,
            domain: "All",
            period: "All",
          },
          signal,
        })
        .then(({ data }) => {
          if (!activeRequest()) return;
          submitted = data.reduce(
            (sum, slice) => sum + Number(slice.value || 0),
            0,
          );
          updateProgress();
        })
        .catch(() => {
          // The selected-period chart has its own request and failure state.
        });
    };
    load();
    const reload = () => void load();
    const scheduler = assessmentRefreshScheduler(user?.id || 0, async () =>
      load(),
    );
    window.addEventListener("online", reload);
    window.addEventListener("focus", reload);
    window.addEventListener("ames-record-synced", scheduler.schedule);
    return () => {
      current = false;
      controller?.abort();
      scheduler.cancel();
      window.removeEventListener("online", reload);
      window.removeEventListener("focus", reload);
      window.removeEventListener("ames-record-synced", scheduler.schedule);
    };
  }, [section?.section_id, section?.section_name, sections.length, user?.id]);
  useEffect(() => {
    let current = true;
    let controller: AbortController | null = null;
    setPieData([]);
    const load = async () => {
      if (!filterSection) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await api.get<PieData[]>(
          "/api/teachers/dashboard-pie",
          {
            params: {
              section: filterSection,
              domain: filterDomain,
              period: filterPeriod,
            },
            signal: request.signal,
          },
        );
        if (current && !request.signal.aborted) setPieData(response.data || []);
      } catch {
        if (current && !request.signal.aborted) setPieData([]);
      }
    };
    void load();
    const reload = () => void load();
    const scheduler = assessmentRefreshScheduler(user?.id || 0, load);
    window.addEventListener("online", reload);
    window.addEventListener("focus", reload);
    window.addEventListener("ames-record-synced", scheduler.schedule);
    return () => {
      current = false;
      controller?.abort();
      scheduler.cancel();
      window.removeEventListener("online", reload);
      window.removeEventListener("focus", reload);
      window.removeEventListener("ames-record-synced", scheduler.schedule);
    };
  }, [filterSection, filterDomain, filterPeriod, user?.id]);
  // Dynamically populated stats array
  const stats = [
    {
      title: "Total Student",
      value: dashboardStats.totalStudents,
      icon: <PeopleIcon sx={{ fontSize: 32, color: "#3b82f6" }} />,
      bg: "#eff6ff",
    },
    {
      title: "Unread Messages",
      value: dashboardStats.unreadMessages,
      icon: <MessageIcon sx={{ fontSize: 32, color: "#ef4444" }} />,
      bg: "#fef2f2",
    },
    {
      title: "Overall ECCD Progress",
      value: dashboardStats.eccdProgress,
      icon: <ShowChartIcon sx={{ fontSize: 32, color: "#10b981" }} />,
      bg: "#ecfdf5",
    },
    {
      title: "Priority Domain",
      value: dashboardStats.priorityDomain,
      icon: <AssessmentIcon sx={{ fontSize: 32, color: "#f59e0b" }} />,
      bg: "#fffbeb",
    },
  ];
  return (
    <Box
      sx={{
        minHeight: "calc(100vh - 4.5rem)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        py: { xs: 2, sm: 3, md: 4 },
        px: { xs: 1, sm: 2, md: 3 },
        maxWidth: "1440px",
        mx: "auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* STATISTICS GRID */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2.5,
          flexWrap: "wrap",
          gap: 1.5,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontWeight: "bold",
            color: "#1f2937",
            fontSize: { xs: "1.2rem", sm: "1.4rem" },
          }}
        >
          Educational Overview
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: "bold",
              color: "#10b981",
              bgcolor: "#ecfdf5",
              px: 2,
              py: 0.8,
              borderRadius: 2,
            }}
          >
            SY {settings.current_school_year || "Loading..."}
          </Typography>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: "bold",
              color: "#3b82f6",
              bgcolor: "#eff6ff",
              px: 2,
              py: 0.8,
              borderRadius: 2,
            }}
          >
            Section: {filterSection || "Loading..."}
          </Typography>
        </Box>
      </Box>
      <Grid container spacing={2.5} sx={{ mb: 3.5 }}>
        {stats.map((stat, idx) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
            <Card
              aria-label={
                stat.title === "Total Student"
                  ? `Total students: ${dashboardStats.totalStudents}; Male: ${distribution.male}; Female: ${distribution.female}`
                  : undefined
              }
              sx={{
                borderRadius: 4,
                boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <CardContent
                sx={{
                  display: "flex",
                  alignItems: "center",
                  p: 2.5,
                  pb: "20px !important",
                }}
              >
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 3,
                    bgcolor: stat.bg,
                    mr: 2,
                    display: "flex",
                  }}
                >
                  {stat.icon}
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#6b7280",
                      fontWeight: "bold",
                      display: "block",
                      lineHeight: 1.2,
                    }}
                  >
                    {stat.title}
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: "900", color: "#111827", mt: 0.5 }}
                  >
                    {stat.value}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* PRIMARY SECTIONS */}
      <Grid container spacing={3}>
        {/* Left Section: ECCD Progress Overview */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Card
            sx={{
              borderRadius: 4,
              boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
              p: { xs: 2.5, sm: 3 },
              height: "100%",
            }}
          >
            <Box sx={{ mb: 3 }}>
              <Typography
                variant="h6"
                sx={{ fontWeight: "bold", color: "#1f2937", mb: 2 }}
              >
                ECCD Development
              </Typography>

              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <FormControl
                  size="small"
                  sx={{ minWidth: 140, flex: { xs: "1 1 100%", sm: "none" } }}
                >
                  <TextField
                    size="small"
                    label="Section"
                    value={filterSection || "Loading..."}
                    sx={{ bgcolor: "#f9fafb" }}
                    slotProps={{
                      input: { readOnly: true },
                    }}
                  />
                </FormControl>

                <FormControl
                  size="small"
                  sx={{
                    minWidth: 180,
                    flex: { xs: "1 1 calc(50% - 8px)", sm: "none" },
                  }}
                >
                  <InputLabel id="teacher-chart-domain-label">
                    Domain
                  </InputLabel>
                  <Select
                    labelId="teacher-chart-domain-label"
                    value={filterDomain}
                    label="Domain"
                    onChange={(e) => setFilterDomain(e.target.value)}
                  >
                    <MenuItem value="All">All</MenuItem>
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

                <FormControl
                  size="small"
                  sx={{
                    minWidth: 140,
                    flex: { xs: "1 1 calc(50% - 8px)", sm: "none" },
                  }}
                >
                  <InputLabel id="teacher-chart-period-label">
                    Testing Period
                  </InputLabel>
                  <Select
                    labelId="teacher-chart-period-label"
                    value={filterPeriod}
                    label="Testing Period"
                    onChange={(e) => setFilterPeriod(e.target.value)}
                  >
                    <MenuItem value="All">All</MenuItem>
                    <MenuItem value="PRE">Pre-Test</MenuItem>
                    <MenuItem value="MID">Mid-Test</MenuItem>
                    <MenuItem value="POST">Post-Test</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>

            <Divider sx={{ mb: 3 }} />

            <Box sx={{ height: { xs: 280, sm: 320, md: 350 }, width: "100%" }}>
              {pieData.reduce((sum, item) => sum + (item.value || 0), 0) > 0 ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  initialDimension={{ width: 300, height: 300 }}
                >
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
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
                  <ShowChartIcon
                    sx={{ fontSize: 48, color: "#9ca3af", mb: 2 }}
                  />
                  <Typography
                    variant="body1"
                    sx={{ color: "#6b7280", fontWeight: "500" }}
                  >
                    No ECCD assessment data available yet.
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#9ca3af" }}>
                    Try selecting a different domain or testing period.
                  </Typography>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>

        {/* Right Section: Unread Messages Feed */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card
            sx={{
              borderRadius: 4,
              boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
              p: { xs: 2.5, sm: 3 },
              height: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography
                variant="h6"
                sx={{ fontWeight: "bold", color: "#1f2937" }}
              >
                Unread Messages
              </Typography>
              {messages.filter((m) => !m.read).length > 0 && (
                <Box
                  sx={{
                    bgcolor: "#ef4444",
                    color: "white",
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 5,
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: "bold" }}>
                    {messages.filter((m) => !m.read).length} New
                  </Typography>
                </Box>
              )}
            </Box>

            {messages.filter((m) => !m.read).length > 0 ? (
              <List
                sx={{
                  width: "100%",
                  bgcolor: "background.paper",
                  flexGrow: 1,
                  overflowY: "auto",
                }}
              >
                {messages
                  .filter((m) => !m.read)
                  .map((msg, index, arr) => (
                    <React.Fragment key={msg.id}>
                      <ListItem alignItems="flex-start" sx={{ px: 0, py: 2 }}>
                        <ListItemAvatar>
                          <Avatar
                            sx={{ bgcolor: "primary.main", fontWeight: "bold" }}
                          >
                            {msg.name.charAt(0)}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                              }}
                            >
                              <Typography
                                component="span"
                                variant="subtitle2"
                                sx={{ fontWeight: "bold", color: "#111827" }}
                              >
                                {msg.name}
                              </Typography>
                              <Typography
                                component="span"
                                variant="caption"
                                sx={{ color: "#6b7280", fontWeight: "bold" }}
                              >
                                {msg.time}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Typography
                              component="span"
                              variant="body2"
                              sx={{
                                color: "#4b5563",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {msg.preview}
                            </Typography>
                          }
                        />
                      </ListItem>
                      {index < arr.length - 1 && <Divider component="li" />}
                    </React.Fragment>
                  ))}
              </List>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "200px",
                  opacity: 0.6,
                  flexGrow: 1,
                }}
              >
                <MessageIcon sx={{ fontSize: 48, color: "#9ca3af", mb: 1 }} />
                <Typography
                  variant="body1"
                  sx={{ color: "#6b7280", fontWeight: "500" }}
                >
                  No unread messages
                </Typography>
              </Box>
            )}

            <Box sx={{ textAlign: "center", mt: "auto", pt: 2 }}>
              <Typography
                variant="body2"
                onClick={() => navigate("/teacher/messages")}
                sx={{
                  color: "primary.main",
                  cursor: "pointer",
                  fontWeight: "bold",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                View All Messages
              </Typography>
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
export default Dashboard;
