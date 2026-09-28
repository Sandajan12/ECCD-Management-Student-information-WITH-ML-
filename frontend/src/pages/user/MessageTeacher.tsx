import React from 'react';
import { Box, Typography } from '@mui/material';
import ChatInterface from '../../components/ChatInterface';

const MessageTeacher: React.FC = () => {
  return (
    <Box sx={{ p: { xs: 1, md: 3 }, minHeight: '100vh' }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: '#1e1e2f', mb: 0.5 }}>
          Message Teacher
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Communicate directly with your child's adviser.
        </Typography>
      </Box>

      <ChatInterface currentUserRole="parent" />
    </Box>
  );
};

export default MessageTeacher;
