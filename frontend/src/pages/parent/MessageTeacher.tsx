import React from 'react';
import { Box, Typography } from '@mui/material';
import ChatInterface from '../../components/ChatInterface';
import { useChildren } from '../../hooks/useChildren';

const MessageTeacher: React.FC = () => {
  const { child } = useChildren();
  const adviser = [child?.teacher_fname, child?.teacher_lname].filter(Boolean).join(' ');
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

      <ChatInterface currentUserRole="parent" preferredContactName={adviser} />
    </Box>
  );
};

export default MessageTeacher;
