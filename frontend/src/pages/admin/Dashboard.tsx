import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsContext } from '../../context/SettingsContext';
import { 
  Box, Typography, Card, CardContent, Divider, 
  Select, MenuItem, FormControl, InputLabel, Avatar, 
  List, ListItem, ListItemAvatar, ListItemText, TextField,
  Stack, Grid as Grid
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import MessageIcon from '@mui/icons-material/Message';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import AssessmentIcon from '@mui/icons-material/Assessment';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../services/api';

interface DashboardStats {
  totalStudents: string | number;
  unreadMessages: string | number;
  eccdProgress: string;
  priorityDomain: string;
}

interface Message {
  id: string | number;
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

const Dashboard: React.FC = () => {
  const { settings } = useContext(SettingsContext) as any;
  const navigate = useNavigate();
  const [filterSection, setFilterSection] = useState<string>('');
  const [filterDomain, setFilterDomain] = useState<string>('Gross Motor Domain');
  const [filterPeriod, setFilterPeriod] = useState<string>('PRE');
  const [pieData, setPieData] = useState<PieData[]>([]);
  const [, setSections] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalStudents: '0',
    unreadMessages: '0',
    eccdProgress: '0%',
    priorityDomain: 'Loading...'
  });
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsResponse, filtersResponse] = await Promise.all([
          api.get('/api/analytics/stats'),
          api.get('/api/analytics/filters')
        ]);

        if (statsResponse.data) {
          setDashboardStats(statsResponse.data.stats);
          setMessages(statsResponse.data.messages || []);
        }
        
        if (filtersResponse.data) {
          const filtersData = filtersResponse.data;
          setSections(filtersData.sections || []);
          setDomains(filtersData.domains || []);
          if (filtersData.sections && filtersData.sections.length > 0 && !filtersData.sections.includes(filterSection)) {
             setFilterSection(filtersData.sections[0]);
          }
          if (filtersData.domains && filtersData.domains.length > 0 && filterDomain !== 'All' && !filtersData.domains.includes(filterDomain)) {
             setFilterDomain(filtersData.domains[0]);
          }
        }
      } catch (err) {
        console.error("Error fetching dashboard stats or filters:", err);
      }
    };
    fetchDashboardData();
  }, [filterSection, filterDomain]);

  useEffect(() => {
    const fetchPieData = async () => {
      try {
        const response = await api.get(`/api/analytics/pie-data`, {
          params: {
            section: filterSection,
            domain: filterDomain,
            period: filterPeriod
          }
        });
        if (response.data) {
          setPieData(response.data);
        }
      } catch (err) {
        console.error("Error fetching pie data:", err);
      }
    };
    if (filterSection && filterDomain && filterPeriod) {
        fetchPieData();
    }
  }, [filterSection, filterDomain, filterPeriod]);

  // Dynamically populated stats array
  const stats = [
    { title: 'Total Student', value: dashboardStats.totalStudents, icon: <PeopleIcon sx={{ fontSize: 32, color: '#3b82f6' }}/>, bg: '#eff6ff' },
    { title: 'Unread Messages', value: dashboardStats.unreadMessages, icon: <MessageIcon sx={{ fontSize: 32, color: '#ef4444' }}/>, bg: '#fef2f2' },
    { title: 'Overall ECCD Progress', value: dashboardStats.eccdProgress, icon: <ShowChartIcon sx={{ fontSize: 32, color: '#10b981' }}/>, bg: '#ecfdf5' },
    { title: 'Priority Domain', value: dashboardStats.priorityDomain, icon: <AssessmentIcon sx={{ fontSize: 32, color: '#f59e0b' }}/>, bg: '#fffbeb' },
  ];

  return (
    <Stack spacing={4} sx={{ p: 3 }}>
      {/* STATISTICS GRID */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1f2937' }}>Educational Overview</Typography>
        <Stack direction="row" spacing={2}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#10b981', bgcolor: '#ecfdf5', px: 2, py: 0.5, borderRadius: 2 }}>
            SY {settings?.current_school_year || 'Loading...'}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: '#3b82f6', bgcolor: '#eff6ff', px: 2, py: 0.5, borderRadius: 2 }}>
            Section: {filterSection || 'Loading...'}
          </Typography>
        </Stack>
      </Box>
      <Grid container spacing={3}>
        {stats.map((stat, idx) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
            <Card sx={{ borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3, pb: "24px !important" }}>
                <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: stat.bg, mr: 2, display: 'flex' }}>
                  {stat.icon}
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 'bold', display: 'block', lineHeight: 1.2 }}>{stat.title}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: '900', color: '#111827', mt: 0.5 }}>{stat.value}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* PRIMARY SECTIONS */}
      <Grid container spacing={3}>
        
        {/* Left Section: ECCD Progress Overview */}
        <Grid size={{ xs: 12, md: 8 }} >
          <Card sx={{ borderRadius: 4, p: 3, height: '100%' }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1f2937', mb: 2 }}>Eccd development</Typography>
              
              <Stack direction="row" spacing={2}>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <TextField 
                     size="small" 
                     label="Section" 
                     value={filterSection || 'Loading...'} 
                     slotProps={{ input: { readOnly: true } }}
                     sx={{ bgcolor: '#f9fafb' }} 
                  />
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Domain</InputLabel>
                  <Select value={filterDomain} label="Domain" onChange={(e) => setFilterDomain(e.target.value as string)}>
                    <MenuItem value="All">All</MenuItem>
                    {domains.length === 0 && <MenuItem disabled>No Domains</MenuItem>}
                    {domains.map(dom => (
                      <MenuItem key={dom} value={dom}>{dom}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Testing Period</InputLabel>
                  <Select value={filterPeriod} label="Testing Period" onChange={(e) => setFilterPeriod(e.target.value as string)}>
                    <MenuItem value="All">All</MenuItem>
                    <MenuItem value="PRE">Pre-Test</MenuItem>
                    <MenuItem value="MID">Mid-Test</MenuItem>
                    <MenuItem value="POST">Post-Test</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            </Box>

            <Divider sx={{ mb: 3 }} />

            <Box sx={{ height: 350, width: '100%' }}>
              {pieData.reduce((sum, item) => sum + (item.value || 0), 0) > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
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
                <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
                  <ShowChartIcon sx={{ fontSize: 48, color: '#9ca3af', mb: 2 }} />
                  <Typography variant="body1" sx={{ color: '#6b7280', fontWeight: '500' }}>No ECCD assessment data available yet.</Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>Try selecting a different domain or testing period.</Typography>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>

        {/* Right Section: Unread Messages Feed */}
        <Grid size={{ xs: 12, md: 4 }} >
          <Card sx={{ borderRadius: 4, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1f2937' }}>Unread Messages</Typography>
              {messages.filter(m => !m.read).length > 0 && (
                <Box sx={{ bgcolor: '#ef4444', color: 'white', px: 1.5, py: 0.5, borderRadius: 5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{messages.filter(m => !m.read).length} New</Typography>
                </Box>
              )}
            </Box>

            {messages.filter(m => !m.read).length > 0 ? (
              <List sx={{ width: '100%', bgcolor: 'background.paper', flexGrow: 1, overflowY: 'auto' }}>
                {messages.filter(m => !m.read).map((msg, index, arr) => (
                  <React.Fragment key={msg.id}>
                    <ListItem alignItems="flex-start" sx={{ px: 0, py: 2 }}>
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'primary.main', fontWeight: 'bold' }}>
                          {msg.name.charAt(0)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography component="span" variant="subtitle2" sx={{ fontWeight: 'bold', color: '#111827' }}>
                              {msg.name}
                            </Typography>
                            <Typography component="span" variant="caption" sx={{ color: '#6b7280', fontWeight: 'bold' }}>
                              {msg.time}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Typography component="span" variant="body2" sx={{ color: '#4b5563', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', opacity: 0.6, flexGrow: 1 }}>
                <MessageIcon sx={{ fontSize: 48, color: '#9ca3af', mb: 1 }} />
                <Typography variant="body1" sx={{ color: '#6b7280', fontWeight: '500' }}>No unread messages</Typography>
              </Box>
            )}
            
            <Box sx={{ textAlign: 'center', mt: 'auto', pt: 2 }}>
                <Typography variant="body2" onClick={() => navigate('/admin/messages')}
                   sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 'bold', '&:hover': { textDecoration: 'underline' } }}
                >
                    View All Messages
                </Typography>
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
};

export default Dashboard;
