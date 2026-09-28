import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, TextField, InputAdornment, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, IconButton, Divider
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import api from '../../services/api';

interface LogEntry {
  log_id: string | number;
  timestamp: string;
  teacher_name: string;
  action_type: string;
  details?: string;
}

const SystemAuditLog: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [openModal, setOpenModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await api.get('/api/analytics/logs');
      setLogs(response.data);
    } catch (error) {
      console.error("Failed to fetch system logs:", error);
    }
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    };
    return date.toLocaleDateString('en-US', options);
  };

  const filteredLogs = logs.filter(log => 
    log.teacher_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.action_type?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRowClick = (log: LogEntry) => {
    setSelectedLog(log);
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setSelectedLog(null);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Paper 
        sx={{ 
            p: { xs: 3, md: 5 }, 
            borderRadius: 4, 
            maxWidth: 1200, 
            mx: 'auto', 
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            minHeight: '80vh'
        }}
      >
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: '900', color: '#111827' }}>
            System Audit Logs
          </Typography>

          <TextField
            placeholder="Enter search Logs by (Name or Action Type)"
            variant="outlined"
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ 
                width: { xs: '100%', sm: 350 },
                '& .MuiOutlinedInput-root': { 
                    borderRadius: 8,
                    bgcolor: '#F9FAFB'
                } 
            }}
            slotProps={{ input: {
              endAdornment: (
                <InputAdornment position="end">
                  <SearchIcon sx={{ color: '#9CA3AF' }} />
                </InputAdornment>
              ),
            }}}
          />
        </Box>

        <TableContainer>
          <Table sx={{ minWidth: 650 }}>
            
            <TableHead>
              <TableRow sx={{ bgcolor: '#F3F4F6' }}>
                <TableCell sx={{ fontWeight: 'bold', color: '#6B7280', py: 2, borderBottom: 'none', borderTopLeftRadius: 8, borderBottomLeftRadius: 8, width: '30%' }}>
                  Timestamp
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: '#6B7280', py: 2, borderBottom: 'none', width: '40%' }}>
                  Fullname
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', color: '#6B7280', py: 2, borderBottom: 'none', borderTopRightRadius: 8, borderBottomRightRadius: 8, width: '30%' }}>
                  Action Type
                </TableCell>
              </TableRow>
            </TableHead>
            
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow 
                  key={log.log_id} 
                  onClick={() => handleRowClick(log)}
                  sx={{ 
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    '&:hover': { bgcolor: '#F9FAFB' },
                    '& td': { borderBottom: '1px solid #F3F4F6' } 
                  }}
                >
                  <TableCell sx={{ py: 3, fontWeight: 'bold', color: '#111827' }}>
                    {formatDateTime(log.timestamp)}
                  </TableCell>
                  <TableCell sx={{ py: 3, fontWeight: 'bold', color: '#111827' }}>
                    {log.teacher_name}
                  </TableCell>
                  <TableCell sx={{ py: 3, fontWeight: 'bold', color: '#111827' }}>
                    {log.action_type}
                  </TableCell>
                </TableRow>
              ))}

              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No audit logs found matching your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>

          </Table>
        </TableContainer>
      </Paper>

      <Dialog 
        open={openModal} 
        onClose={handleCloseModal} 
        maxWidth="sm" 
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 4, p: 1 } } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '900', color: '#111827' }}>
          Audit Action Details
          <IconButton onClick={handleCloseModal} size="small" sx={{ color: '#9CA3AF' }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ py: 3 }}>
          {selectedLog && (
            <Box sx={{ display: 'flex', flexDirection: 'column' ,  gap: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}  >
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>Action Taken By:</Typography>
                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 'bold' }}>{selectedLog.teacher_name}</Typography>
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}  >
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>Date & Time:</Typography>
                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 'bold' }}>{formatDateTime(selectedLog.timestamp)}</Typography>
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}  >
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>Action Type:</Typography>
                <Typography variant="body2" sx={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>{selectedLog.action_type}</Typography>
              </Box>

              <Box sx={{ mt: 2 }} >
                <Typography variant="caption" sx={{ mb: 1, display: 'block', color: 'text.secondary', fontWeight: 'bold' }}>
                  SPECIFIC DETAILS:
                </Typography>
                <Box sx={{ p: 2, bgcolor: '#F9FAFB', borderRadius: 4, border: '1px solid #F3F4F6' }}>
                  <Typography variant="body2" sx={{ color: '#4B5563', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {selectedLog.details || "No specific details were recorded for this action."}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

    </Box>
  );
};

export default SystemAuditLog;

