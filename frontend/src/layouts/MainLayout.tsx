import React, { useContext, useState, useEffect } from 'react';
import { 
  Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, 
  Typography, Button, Badge, AppBar, Toolbar, IconButton, useTheme, useMediaQuery 
} from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';
import PeopleIcon from '@mui/icons-material/People';
import AssignmentIcon from '@mui/icons-material/Assignment';
import SettingsIcon from '@mui/icons-material/Settings';
import AccessibilityIcon from '@mui/icons-material/Accessibility';
import LogoutIcon from '@mui/icons-material/Logout';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import MessageIcon from '@mui/icons-material/Message';
import HomeIcon from '@mui/icons-material/Home';
import MenuIcon from '@mui/icons-material/Menu';
import { useLocation, useNavigate, Outlet } from 'react-router-dom'; 

import { SettingsContext } from '../context/SettingsContext';
import api from '../services/api';

const drawerWidth = 260;

const MainLayout: React.FC = () => {
  const { settings } = useContext(SettingsContext);
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const userString = localStorage.getItem('user');
  const user = userString ? JSON.parse(userString) : { role: '' };
  const role = user.role.toLowerCase();

  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (role === 'admin' || role === 'user' || role === 'teacher' || role === 'parent') {
      const fetchUnreadCount = async () => {
        try {
          const response = await api.get('/api/messages/unread-count');
          if (response.status === 200) {
            setUnreadCount(response.data.unreadCount || 0);
          }
        } catch (error) {
          console.error("Error fetching unread count", error);
        }
      };

      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 3000);
      return () => clearInterval(interval);
    }
  }, [role]);

  const chairmanMenuItems = [
    { text: 'Dashboard', icon: <BarChartIcon />, path: "/super-admin/dashboard" },
    { text: 'Teacher Accounts', icon: <PeopleIcon />, path: "/super-admin/teachers" },
    { text: 'Student Records', icon: <ChildCareIcon />, path: "/super-admin/students" },
    { text: 'System Audit Log', icon: <SettingsIcon />, path: '/super-admin/audit' },
    { text: 'ECCD Questions', icon: <AssignmentIcon />, path: '/super-admin/eccd-questions' },
    { text: 'Settings', icon: <AccessibilityIcon/>, path: '/super-admin/settings' }
  ];

  const teacherMenuItems = [
    { text: 'Dashboard', icon: <BarChartIcon />, path: "/teacher/dashboard" },
    { text: 'My Students', icon: <PeopleIcon />, path: "/teacher/students" },
    { text: 'Assessments', icon: <AssignmentIcon />, path: "/teacher/eccdassessment" },
    { text: 'Messages', icon: <MessageIcon />, path: "/teacher/messages" },
    ...(user.allow_eccd_question_management
      ? [{ text: 'ECCD Questions', icon: <AssignmentIcon />, path: "/teacher/eccd-questions" }]
      : []),
    { text: 'Settings', icon: <SettingsIcon />, path: '/teacher/settings' },
  ];

  const parentMenuItems = [
    { text: 'Overview', icon: <HomeIcon />, path: '/parent/dashboard' },
    { text: 'ECCD Management', icon: <ChildCareIcon />, path: '/parent/eccdassessment' },
    { text: 'Child Information', icon: <AssignmentIcon />, path: "/parent/childinformation" },
    { text: 'Messages', icon: <MessageIcon />, path: "/parent/messages" },
  ];

  let activeMenuItems: Array<{text: string, icon: React.ReactNode, path: string}> = [];
  if (role === 'super-admin' || role === 'chairman') activeMenuItems = chairmanMenuItems;
  else if (role === 'admin' || role === 'teacher') activeMenuItems = teacherMenuItems;
  else if (role === 'user' || role === 'parent') activeMenuItems = parentMenuItems;

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  const drawerContent = (
    <>
      <Box sx={{ 
        p: 3, borderBottom: '1px solid rgba(255,255,255,0.08)', mb: 2, 
        display: 'flex', flexDirection: 'column', alignItems: 'center', 
        textAlign: 'center', minHeight: 140, justifyContent: 'center'
      }}>
        {settings.logo_url && (
          <Box component="img" src={settings.logo_url} alt="System Logo" 
               sx={{ width: 70, height: 70, objectFit: 'cover', mb: 2, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', backgroundColor: 'white' }} />
        )}
        <Typography variant="h6" sx={{ fontWeight: '800', fontSize: '1.1rem', color: '#F9FAFB', letterSpacing: '0.5px', lineHeight: 1.3, width: '100%', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'break-word' }}>
          {settings.system_title}
        </Typography>
      </Box>

      <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
        <List>
          {activeMenuItems.map((item) => {
            const isActive = location.pathname.includes(item.path);
            
            return (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  onClick={() => {
                      navigate(item.path);
                      if (isMobile) setMobileOpen(false);
                  }}
                  sx={{
                    backgroundColor: isActive ? settings.primary_color : 'transparent',
                    borderRadius: '0 24px 24px 0', mr: 2, mb: 0.5,
                    '&:hover': { backgroundColor: isActive ? settings.primary_color : 'rgba(255,255,255,0.08)' },
                  }}
                >
                  <ListItemIcon sx={{ color: isActive ? 'white' : '#9CA3AF' }}>
                      {item.text === 'Messages' ? (
                          <Badge badgeContent={unreadCount} color="error" sx={{ '& .MuiBadge-badge': { fontWeight: 'bold' } }}>
                              {item.icon}
                          </Badge>
                      ) : (
                          item.icon
                      )}
                  </ListItemIcon>
                  <ListItemText primary={item.text} sx={{ color: isActive ? 'white' : '#D1D5DB', '& .MuiTypography-root': { fontWeight: isActive ? 'bold' : 'normal' } }} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      <Box sx={{ p: 2, mt: 'auto' }}>
        <Button onClick={handleLogout} variant="contained" color="error" startIcon={<LogoutIcon />} fullWidth 
                sx={{ borderRadius: 3, borderColor: 'rgba(255,255,255,0.2)', color: 'white', textTransform: 'none', '&:hover': { bgcolor: '#d32f2f' } }}>
            Logout
        </Button>
      </Box>
    </>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: theme.palette.background.default }}>
      {isMobile && (
        <AppBar position="fixed" elevation={1} sx={{ zIndex: theme.zIndex.drawer + 1, backgroundColor: '#111827' }}>
          <Toolbar>
            <IconButton color="inherit" aria-label="open drawer" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 'bold' }}>
              {settings.system_title || 'AMES System'}
            </Typography>
          </Toolbar>
        </AppBar>
      )}
      <Box sx={{ display: 'flex', flexGrow: 1, pt: isMobile ? '64px' : 0 }}>
        <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
          {isMobile ? (
            <Drawer
              variant="temporary"
              open={mobileOpen}
              onClose={handleDrawerToggle}
              ModalProps={{ keepMounted: true }}
              sx={{
                display: { xs: 'block', md: 'none' },
                '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, backgroundColor: '#111827', color: 'white' },
              }}
            >
              {drawerContent}
            </Drawer>
          ) : (
            <Drawer
              variant="permanent"
              sx={{
                display: { xs: 'none', md: 'block' },
                '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, backgroundColor: '#111827', color: 'white', borderRight: 'none' },
              }}
              open
            >
              {drawerContent}
            </Drawer>
          )}
        </Box>

        <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` }, overflowX: 'hidden' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default MainLayout;
