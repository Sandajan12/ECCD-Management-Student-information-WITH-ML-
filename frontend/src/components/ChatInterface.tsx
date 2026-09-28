import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Paper, TextField, IconButton, Avatar, Divider, List, ListItem, ListItemText, ListItemButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { io, Socket } from 'socket.io-client';
import api from '../services/api';

const socketURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
let socket: Socket;

interface Contact {
  id: number;
  name: string;
}

interface Message {
  message_id?: number;
  teacher_id: number;
  parent_id: number;
  message_body: string;
  sender_role: string;
  sent_at: string;
}

interface ChatInterfaceProps {
  currentUserRole: 'teacher' | 'parent';
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ currentUserRole }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [myInternalId, setMyInternalId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      socket = io(socketURL, { transports: ['websocket'] });
    } catch (e) {
      console.warn("Socket initialization error:", e);
    }
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchContacts = async () => {
      try {
        const response = await api.get('/api/messages/contacts');
        if (response.status === 200 && isMounted) {
          setMyInternalId(response.data.myId);
          setContacts(response.data.contacts || []);
          if (response.data.contacts && response.data.contacts.length > 0) {
            setActiveContact(response.data.contacts[0]);
          }
        }
      } catch (error) {
        console.error("Failed to fetch contacts", error);
      }
    };
    fetchContacts();
    return () => {
      isMounted = false;
    };
  }, []);

  const getRoomId = () => {
    if (!myInternalId || !activeContact) return null;
    const ids = [myInternalId, activeContact.id].sort((a, b) => a - b);
    return `room-${ids[0]}-${ids[1]}`;
  };

  useEffect(() => {
    if (!activeContact?.id || !myInternalId) return;

    let isMounted = true;

    const fetchMessagesAndMarkRead = async () => {
      try {
        const teacherId = currentUserRole === 'teacher' ? myInternalId : activeContact.id;
        const parentId = currentUserRole === 'parent' ? myInternalId : activeContact.id;

        const response = await api.get(`/api/messages/history?teacher_id=${teacherId}&parent_id=${parentId}`);
        if (response.status === 200 && isMounted) {
          setMessages(response.data || []);
          setTimeout(scrollToBottom, 100);
        }

        await api.put('/api/messages/read', {
          teacher_id: teacherId,
          parent_id: parentId,
          current_user_role: currentUserRole
        });

        window.dispatchEvent(new Event('messagesRead'));
      } catch (error) {
        console.error("Failed to fetch messages", error);
      }
    };

    fetchMessagesAndMarkRead();

    const room = getRoomId();
    if (room && socket && typeof socket.emit === 'function') {
      socket.emit("join_room", room);
    }

    // Polling fallback to keep message stream synced smoothly
    const intervalId = setInterval(fetchMessagesAndMarkRead, 8000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [activeContact?.id, myInternalId, currentUserRole]);

  useEffect(() => {
    const receiveMessageHandler = (data: Message) => {
      setContacts(prevContacts => {
        const contactId = currentUserRole === 'teacher' ? data.parent_id : data.teacher_id;
        const index = prevContacts.findIndex(c => c.id === contactId);
        if (index > -1) {
          const newContacts = [...prevContacts];
          const [contact] = newContacts.splice(index, 1);
          newContacts.unshift(contact);
          return newContacts;
        }
        return prevContacts;
      });

      setMessages((prevMessages) => [...prevMessages, data]);
      setTimeout(scrollToBottom, 100);
    };

    if (socket && typeof socket.on === 'function') {
      socket.on("receive_message", receiveMessageHandler);
    }

    return () => {
      if (socket && typeof socket.off === 'function') {
        socket.off("receive_message", receiveMessageHandler);
      }
    };
  }, [currentUserRole]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async () => {
    if (newMessage.trim() === '' || !activeContact || !myInternalId) return;

    const teacherId = currentUserRole === 'teacher' ? myInternalId : activeContact.id;
    const parentId = currentUserRole === 'parent' ? myInternalId : activeContact.id;
    const room = getRoomId();

    const messagePayload: Message = {
      teacher_id: teacherId,
      parent_id: parentId,
      message_body: newMessage,
      sender_role: currentUserRole,
      sent_at: new Date().toISOString()
    };

    try {
      const response = await api.post('/api/messages/', messagePayload);
      if (response.status === 200 || response.status === 201) {
        const newMsgObj = { ...messagePayload, message_id: Date.now() };
        setMessages((prev) => [...prev, newMsgObj]);
        
        setContacts(prevContacts => {
          const contactId = currentUserRole === 'teacher' ? parentId : teacherId;
          const index = prevContacts.findIndex(c => c.id === contactId);
          if (index > -1) {
            const newContacts = [...prevContacts];
            const [contact] = newContacts.splice(index, 1);
            newContacts.unshift(contact);
            return newContacts;
          }
          return prevContacts;
        });

        if (socket && typeof socket.emit === 'function') {
          socket.emit("send_message", { ...newMsgObj, room });
        }
        setNewMessage('');
        setTimeout(scrollToBottom, 100);
      }
    } catch (error) {
      console.error("Failed to send message", error);
    }
  };

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 1).toUpperCase();
  };

  return (
    <Paper sx={{ display: 'flex', height: { xs: 'calc(100vh - 160px)', md: '80vh' }, borderRadius: 3, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
      {/* LEFT SIDE: Contacts List */}
      <Box sx={{ width: { xs: '100%', md: 300 }, borderRight: '1px solid #e2e8f0', display: { xs: activeContact ? 'none' : 'flex', md: 'flex' }, flexDirection: 'column', bgcolor: 'background.paper' }}>
        <Typography variant="h6" sx={{ p: 3, fontWeight: 'bold' }}>Messages</Typography>
        <Divider />
        <List sx={{ overflowY: 'auto', flex: 1, p: 0 }}>
          {contacts.map((contact) => {
            const isActive = activeContact?.id === contact.id;
            return (
              <ListItem disablePadding key={contact.id}>
                <ListItemButton 
                  onClick={() => setActiveContact(contact)}
                  sx={{ 
                    borderLeft: isActive ? '4px solid #2563EB' : '4px solid transparent',
                    bgcolor: isActive ? '#F8FAFC' : 'transparent',
                    py: 2,
                    '&:hover': { bgcolor: '#F1F5F9' }
                  }}
                >
                  <ListItemText 
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: isActive ? 'bold' : 'normal', color: isActive ? 'primary.main' : 'text.primary' }}>
                        {contact.name}
                      </Typography>
                    }
                  />
                </ListItemButton>
              </ListItem>
            )
          })}
          {contacts.length === 0 && (
            <Typography variant="caption" sx={{ p: 3, display: 'block', textAlign: 'center', color: 'text.secondary' }}>
              No active contacts for this school year.
            </Typography>
          )}
        </List>
      </Box>

      {/* RIGHT SIDE: Chat Area */}
      <Box sx={{ flex: 1, display: { xs: activeContact ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', bgcolor: '#F8FAFC' }}>
        {activeContact ? (
          <>
            <Box sx={{ p: 2, bgcolor: 'background.paper', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 2 }}>
              <IconButton sx={{ display: { md: 'none' } }} onClick={() => setActiveContact(null)}>
                <ArrowBackIcon />
              </IconButton>
              <Avatar sx={{ bgcolor: '#DBEAFE', color: '#1D4ED8', fontWeight: 'bold' }}>
                {getInitials(activeContact.name)}
              </Avatar>
              <Typography variant="h6">{activeContact.name}</Typography>
            </Box>

            <Box sx={{ flex: 1, p: 3, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {messages.map((msg, index) => {
                const isMe = msg.sender_role === currentUserRole;
                return (
                  <Box key={msg.message_id || index} sx={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    <Box sx={{ 
                      maxWidth: '60%', p: 2, borderRadius: 3,
                      borderBottomRightRadius: isMe ? 0 : 3,
                      borderBottomLeftRadius: !isMe ? 0 : 3,
                      bgcolor: isMe ? 'primary.main' : 'background.paper', 
                      color: isMe ? 'white' : 'text.primary',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                    }}>
                      <Typography variant="body1">{msg.message_body}</Typography>
                      <Typography variant="caption" sx={{ display: 'block', textAlign: 'right', mt: 0.5, color: isMe ? 'rgba(255,255,255,0.7)' : 'text.secondary' }}>
                        {formatTime(msg.sent_at)}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
              <div ref={messagesEndRef} />
            </Box>

            <Box sx={{ p: 2, bgcolor: 'background.paper', borderTop: '1px solid #e2e8f0' }}>
              <TextField
                fullWidth
                placeholder="Type a message.."
                variant="outlined"
                size="small"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 8, bgcolor: '#F8FAFC' } }}
                slotProps={{ input: {
                  endAdornment: (
                    <IconButton onClick={handleSendMessage} sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' }, p: 1, ml: 1 }}>
                      <SendIcon fontSize="small" />
                    </IconButton>
                  )
                }}}
              />
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body1" sx={{ color: 'text.secondary' }}>Select a contact to start messaging</Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default ChatInterface;
