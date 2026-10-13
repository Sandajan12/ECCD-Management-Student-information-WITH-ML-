import React from 'react';
import { Box, Typography, Stack } from '@mui/material';
import ChatInterface from '../../components/ChatInterface'; // Adjust path if needed

const MessageParent: React.FC = () => {
    return (
        <Stack spacing={4} sx={{ p: { xs: 2, md: 4 }, minHeight: '100vh' }}>
            
            <Box>
                <Typography variant="h4" sx={{ fontWeight: '800', color: '#1e1e2f', mb: 0.5 }}>
                    Message Parents
                </Typography>
                <Typography variant="body1" sx={{ color: 'textSecondary' }}>
                    Communicate directly and securely with your student's parents.
                </Typography>
            </Box>

            {/* Here is where we PLUG IN the chat engine! */}
            <Box sx={{ flexGrow: 1 }}>
                <ChatInterface 
                    currentUserRole="teacher" 
                />
            </Box>

        </Stack>
    );
};

export default MessageParent;
