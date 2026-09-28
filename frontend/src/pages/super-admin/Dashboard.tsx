import React, { useState, useEffect, useContext } from 'react';
import { Box, Grid, Typography, Card, CardContent, LinearProgress, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { SettingsContext } from '../../context/SettingsContext';
import PeopleIcon from '@mui/icons-material/People';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SchoolIcon from '@mui/icons-material/School';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import api from '../../services/api';

interface Stats {
  totalStudents: string;
  totalTeachers: string;
  priorityIntervention: string;
  priorityInterventionSubtitle: string;
  criticalDomain: string;
  criticalDomainSubtitle: string;
  eccdProgress: string;
  eccdAvg: string;
}

interface Mastery {
  kaya: number;
  dikaya: number;
}

interface PieData {
  name: string;
  value: number;
  color: string;
}

interface DomainPerformance {
  name: string;
  percentage: number;
}

const SuperAdminDashboard: React.FC = () => {
  const { settings } = useContext(SettingsContext);
  const [filterSection, setFilterSection] = useState('All');
  const [filterDomain, setFilterDomain] = useState('All');
  const [filterPeriod, setFilterPeriod] = useState('All');
  const [filterSchoolYear, setFilterSchoolYear] = useState('All');

  const [sections, setSections] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [schoolYears, setSchoolYears] = useState<string[]>([]);

  const [stats, setStats] = useState<Stats>({
    totalStudents: '0',
    totalTeachers: '0',
    priorityIntervention: 'Loading...',
    priorityInterventionSubtitle: '',
    criticalDomain: 'Loading...',
    criticalDomainSubtitle: '',
    eccdProgress: '0%',
    eccdAvg: '0%'
  });
  const [pieData, setPieData] = useState<PieData[]>([]);
  const [mastery, setMastery] = useState<Mastery>({ kaya: 0, dikaya: 0 });
  const [domainPerformance, setDomainPerformance] = useState<DomainPerformance[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsRes, filtersRes] = await Promise.all([
          api.get(`/api/analytics/stats?section=${encodeURIComponent(filterSection)}&schoolYear=${encodeURIComponent(filterSchoolYear)}`),
          api.get(`/api/analytics/filters`)
        ]);

        if (statsRes.status === 200) {
          setStats(statsRes.data.stats);
          setMastery(statsRes.data.functionalMastery);
        }
        if (filtersRes.status === 200) {
          setSections(filtersRes.data.sections);
          setDomains(filtersRes.data.domains);
          if (filtersRes.data.schoolYears) setSchoolYears(filtersRes.data.schoolYears);
        }
      } catch (err) {
        console.error("Failed to fetch chairman dashboard stats/filters", err);
      }
    };
    fetchDashboardData();
  }, [filterSection, filterSchoolYear]);

  useEffect(() => {
    const fetchPieData = async () => {
      try {
        const url = `/api/analytics/pie-data?section=${encodeURIComponent(filterSection)}&domain=${encodeURIComponent(filterDomain)}&period=${encodeURIComponent(filterPeriod)}&schoolYear=${encodeURIComponent(filterSchoolYear)}`;
        const response = await api.get(url);
        if (response.status === 200) {
          setPieData(response.data);
        }
      } catch (err) {
        console.error("Error fetching pie data:", err);
      }
    };
    fetchPieData();
  }, [filterSection, filterDomain, filterPeriod, filterSchoolYear]);

  useEffect(() => {
    const fetchDomainPerformances = async () => {
      if (domains.length === 0) return;
      try {
        const results = await Promise.all(
          domains.map(async (dom) => {
            const url = `/api/analytics/pie-data?section=${encodeURIComponent(filterSection)}&domain=${encodeURIComponent(dom)}&period=${encodeURIComponent(filterPeriod)}&schoolYear=${encodeURIComponent(filterSchoolYear)}`;
            const response = await api.get(url);
            if (response.status === 200) {
              const kaya = response.data.find((d: any) => d.name === 'KAYA')?.value || 0;
              const dikaya = response.data.find((d: any) => d.name === 'DI-KAYA')?.value || 0;
              const total = kaya + dikaya;
              const percentage = total > 0 ? Math.round((kaya / total) * 100) : 0;
              return { name: dom.replace(' Domain', ''), percentage };
            }
            return { name: dom.replace(' Domain', ''), percentage: 0 };
          })
        );
        results.sort((a, b) => b.percentage - a.percentage);
        setDomainPerformance(results);
      } catch (err) {
        console.error("Error fetching domain performances:", err);
      }
    };
    fetchDomainPerformances();
  }, [filterSection, filterPeriod, domains, filterSchoolYear]);

  const totalPieValue = pieData.reduce((sum, item) => sum + (item.value || 0), 0);
  const hasData = parseInt(stats.totalStudents) > 0 && (mastery.kaya > 0 || mastery.dikaya > 0);

  const priorityValue = hasData ? stats.priorityIntervention : 'N/A';
  const prioritySubtitle = hasData ? stats.priorityInterventionSubtitle : 'No assessments yet';
  const priorityIcon = hasData 
    ? <WarningAmberIcon sx={{ fontSize: 32, color: '#f59e0b' }}/> 
    : <InfoOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled' }}/>;
  const priorityBg = hasData ? '#fffbeb' : '#f3f4f6';
  const priorityColor = hasData ? '#f59e0b' : 'text.disabled';

  const domainValue = hasData ? stats.criticalDomain : 'N/A';
  const domainSubtitle = hasData ? stats.criticalDomainSubtitle : 'No assessments yet';
  const domainIcon = hasData 
    ? <GpsFixedIcon sx={{ fontSize: 32, color: '#ef4444' }}/> 
    : <InfoOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled' }}/>;
  const domainBg = hasData ? '#fef2f2' : '#f3f4f6';
  const domainColor = hasData ? '#ef4444' : 'text.disabled';

  const statsArray = [
    { title: 'Total Students', value: stats.totalStudents, icon: <PeopleIcon sx={{ fontSize: 32, color: '#3b82f6' }}/>, bg: '#eff6ff' },
    { title: 'Total Teachers', value: stats.totalTeachers, icon: <SchoolIcon sx={{ fontSize: 32, color: '#a855f7' }}/>, bg: '#f3e8ff' },
    { title: 'Priority Intervention', value: priorityValue, subtitle: prioritySubtitle, subtitleColor: priorityColor, icon: priorityIcon, bg: priorityBg },
    { title: 'Critical Domain Focus', value: domainValue, subtitle: domainSubtitle, subtitleColor: domainColor, icon: domainIcon, bg: domainBg },
  ];

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'text.primary' }}>Educational Overview</Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#10b981', bgcolor: '#ecfdf5', px: 2, py: 0.5, borderRadius: 2 }}>
              SY {settings.current_school_year || 'Loading...'}
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#3b82f6', bgcolor: '#eff6ff', px: 2, py: 0.5, borderRadius: 2 }}>
              {filterSection === 'All' ? 'All Sections' : `Section: ${filterSection}`}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Stat Cards Row */}
      <Grid container spacing={3} sx={{ mb: 4, mt: 2 }}>
        {statsArray.map((stat, idx) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={idx}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3, pb: "24px !important" }}>
                <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: stat.bg, mr: 2, display: 'flex' }}>
                  {stat.icon}
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', display: 'block', lineHeight: 1.2 }}>{stat.title}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: '900', color: 'text.primary', mt: 0.5, lineHeight: 1.1 }}>{stat.value}</Typography>
                  {stat.subtitle && (
                    <Typography variant="caption" sx={{ color: stat.subtitleColor, fontWeight: 'bold', display: 'block', mt: 0.5, lineHeight: 1.1 }}>
                      {stat.subtitle}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3}>
        
        {/* ECCD Progress Overview Chart */}
        <Grid size={{ xs: 12, md: 8 }} >
          <Card sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.primary', mb: 2 }}>ECCD Progress Overview</Typography>
              
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'nowrap', overflowX: 'auto', pt: 1, pb: 1 }}>
                <FormControl size="small" sx={{ flex: 1, minWidth: 130 }}>
                  <InputLabel>School Year</InputLabel>
                  <Select value={filterSchoolYear} label="School Year" onChange={(e) => setFilterSchoolYear(e.target.value)}>
                    <MenuItem value="All">All Years</MenuItem>
                    {schoolYears.map(year => (
                      <MenuItem key={year} value={year}>{year}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ flex: 1, minWidth: 130 }}>
                  <InputLabel>Section</InputLabel>
                  <Select value={filterSection} label="Section" onChange={(e) => setFilterSection(e.target.value)}>
                    <MenuItem value="All">All Sections</MenuItem>
                    {sections.map(sec => (
                      <MenuItem key={sec} value={sec}>{sec}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ flex: 1, minWidth: 130 }}>
                  <InputLabel>Domain</InputLabel>
                  <Select value={filterDomain} label="Domain" onChange={(e) => setFilterDomain(e.target.value)}>
                    <MenuItem value="All">All Domains</MenuItem>
                    {domains.map(dom => (
                      <MenuItem key={dom} value={dom}>{dom}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ flex: 1, minWidth: 130 }}>
                  <InputLabel>Period</InputLabel>
                  <Select value={filterPeriod} label="Period" onChange={(e) => setFilterPeriod(e.target.value)}>
                    <MenuItem value="All">All Periods</MenuItem>
                    <MenuItem value="PRE">PRE</MenuItem>
                    <MenuItem value="MID">MID</MenuItem>
                    <MenuItem value="POST">POST</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1, minHeight: 300 }}>
              {totalPieValue > 0 ? (
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
                      label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
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
                  <ShowChartIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: '500' }}>No ECCD assessment data available yet.</Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>Try selecting a different section.</Typography>
                </Box>
              )}
            </Box>
          </Card>
        </Grid>
        
        {/* Domain Performance Breakdown */}
        <Grid size={{ xs: 12, md: 4 }} >
          <Card sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Domain Performance</Typography>
              <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {filterSection === 'All' ? 'Showing: All Sections' : `Showing: Section ${filterSection}`}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', flexGrow: 1 }}>
              {domainPerformance.length > 0 ? domainPerformance.map((dom, idx) => (
                <Box key={idx}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>{dom.name}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{dom.percentage}% KAYA</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={dom.percentage} sx={{ height: 10, borderRadius: 5, backgroundColor: '#f3f4f6', '& .MuiLinearProgress-bar': { backgroundColor: 'primary.main', borderRadius: 5 } }} />
                </Box>
              )) : (
                <Typography variant="body2" sx={{ textAlign: 'center', mt: 4, color: 'text.secondary' }}>Loading domain data...</Typography>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SuperAdminDashboard;
