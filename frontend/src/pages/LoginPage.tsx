import React, { useContext, useState, useRef, } from 'react';
import type { ChangeEvent } from 'react';
import type { KeyboardEvent } from 'react';
import type { FormEvent } from 'react';
import { Box, Typography, TextField, Button, Alert, Paper, InputAdornment, IconButton, Stack } from '@mui/material';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, Link } from 'react-router-dom';
import BackgroundPic from '../assets/background_pic.webp';

import { SettingsContext } from '../context/SettingsContext';
import api from '../services/api';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useContext(SettingsContext);

  const [step, setStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [formData, setFormData] = useState({ email: '', password: '', otp: '' });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleOtpChange = (index: number, event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    if (!/^[0-9]*$/.test(value)) return;

    let otpArray = formData.otp.split('');

    if (value.length > 1) {
      const pastedData = value.slice(0, 6).split('');
      otpArray = [...pastedData, ...Array(6 - pastedData.length).fill('')].slice(0, 6);
      setFormData({ ...formData, otp: otpArray.join('') });
      
      const focusIndex = pastedData.length < 6 ? pastedData.length : 5;
      otpRefs.current[focusIndex]?.focus();
      return;
    }

    otpArray[index] = value;
    setFormData({ ...formData, otp: otpArray.join('') });

    if (value !== '' && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Backspace' && !formData.otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleStep1 = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    setErrorMessage('');
    if (!formData.email || !formData.password) {
      return setErrorMessage("Please enter both email and password.");
    }

    setIsLoading(true);

    try {
      const response = await api.post('/api/auth/login', { email: formData.email, password: formData.password });

      if (response.data) {
        setSuccessMessage('Login successful!');
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        const userRole = response.data.user.role.toLowerCase(); 
        
        if (userRole === 'super-admin' || userRole === 'chairman') navigate('/super-admin/dashboard');
        else if (userRole === 'admin' || userRole === 'teacher') navigate('/teacher/dashboard');
        else if (userRole === 'user' || userRole === 'parent') navigate('/parent/dashboard');
        else navigate('/');
      }
    } catch (error: any) {
      setErrorMessage(error.response?.data?.message || 'Invalid credentials or cannot connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep2 = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    setErrorMessage('');
    if (formData.otp.length < 6) return setErrorMessage("Please enter the full 6-digit code.");

    setIsLoading(true);
    try {
      const response = await api.post('/api/auth/login', { email: formData.email, password: formData.password, otp: formData.otp });

      if (response.data) {
        setSuccessMessage('Login successful!');
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        const userRole = response.data.user.role.toLowerCase(); 
        
        if (userRole === 'super-admin' || userRole === 'chairman') navigate('/super-admin/dashboard');
        else if (userRole === 'admin' || userRole === 'teacher') navigate('/teacher/dashboard');
        else if (userRole === 'user' || userRole === 'parent') navigate('/parent/dashboard');
        else navigate('/');
      }
    } catch (error: any) {
      setErrorMessage(error.response?.data?.message || 'Invalid verification code or cannot connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ position: 'relative', width: '100vw', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', p: 3 }}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: `url(${BackgroundPic})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(3px)', zIndex: -2 }} />
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: -1 }} />

      <Paper elevation={4} sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, width: '100%', maxWidth: 800, minHeight: { xs: 'auto', md: 450 }, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)' }}>
        <Box sx={{ width: { xs: '100%', md: '35%' }, backgroundColor: 'primary.main', display: 'flex', justifyContent: 'center', alignItems: 'center', py: { xs: 4, md: 4 }, px: { xs: 2, md: 3 } }}>
          <Box component="img" src={settings?.logo_url || "https://via.placeholder.com/150?text=Logo"} alt="School Logo" sx={{ width: { xs: 90, md: 140 }, height: { xs: 90, md: 140 }, objectFit: 'cover', borderRadius: '50%', boxShadow: 3, border: '3px solid white', backgroundColor: 'white' }} />
        </Box>

        <Box sx={{ flex: 1, p: { xs: 4, sm: 5, md: 6 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <Stack spacing={3} sx={{ width: '100%', maxWidth: 420, textAlign: 'center', mx: 'auto' }}>
            <Typography variant="h5" sx={{ fontWeight: '800', color: 'primary.main', textTransform: 'uppercase', letterSpacing: { xs: 0, md: 0.5 }, lineHeight: 1.4, fontSize: { xs: '1.2rem', md: '1.5rem' } }}>
              {settings?.system_title && settings.system_title.includes('&') ? (
                <><span style={{ whiteSpace: 'nowrap' }}>{settings.system_title.split('&')[0].trim()}</span><br/><span style={{ fontSize: '1.5em', fontWeight: '300' }}>&</span><br/><span style={{ whiteSpace: 'nowrap' }}>{settings.system_title.split('&').slice(1).join('&').trim()}</span></>
              ) : (
                <span style={{ wordBreak: 'break-word' }}>{settings?.system_title || "System Login"}</span>
              )}
            </Typography>

            {errorMessage && <Alert severity="error" sx={{ borderRadius: 2 }}>{errorMessage}</Alert>}
            {successMessage && <Alert severity="success" sx={{ borderRadius: 2 }}>{successMessage}</Alert>}

            {step === 1 ? (
              <Box component="form" onSubmit={handleStep1} noValidate sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 'bold', mb: 0.5, display: 'block', color: 'text.secondary', textAlign: 'left' }}>EMAIL ADDRESS</Typography>
                  <TextField fullWidth size="medium" name="email" placeholder="Enter your email" variant="outlined" value={formData.email} onChange={handleChange} sx={{ backgroundColor: '#f9fafb', borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} slotProps={{ input: { startAdornment: (<InputAdornment position="start"><EmailOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>) } }}/>
                </Box>

                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 'bold', mb: 0.5, display: 'block', color: 'text.secondary', textAlign: 'left' }}>PASSWORD</Typography>
                  <TextField fullWidth size="medium" name="password" placeholder="Enter your password" type="password" variant="outlined" value={formData.password} onChange={handleChange} sx={{ backgroundColor: '#f9fafb', borderRadius: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }} slotProps={{ input: { startAdornment: (<InputAdornment position="start"><LockOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>) } }}/>
                </Box>

                <Button disabled={isLoading} type="submit" fullWidth variant="contained" size="large" sx={{ py: 1.5, fontWeight: 'bold', borderRadius: 2, mt: 1 }}>
                  {isLoading ? 'Processing...' : 'Log In'}
                </Button>

                <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                  Don't have an account yet? <Link to="/register-parent" style={{ color: '#1976d2', fontWeight: 'bold', textDecoration: 'none' }}>Click here</Link>
                </Typography>
              </Box>
            ) : (
              <Box component="form" onSubmit={handleStep2} noValidate sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2, animation: 'fadeIn 0.3s' }}>
                <Stack direction="row"  spacing={1} sx={{ mb: 1, alignItems: "center" }}>
                  <IconButton onClick={() => { setStep(1); setFormData({...formData, otp: ''}); }} size="small" sx={{ color: 'text.secondary' }}><ArrowBackIcon fontSize="small" /></IconButton>
                  <Typography variant="body2" sx={{ color: 'textSecondary', fontWeight: 'bold' }}>Back to Login</Typography>
                </Stack>
                
                <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', color: 'text.secondary', letterSpacing: 0.5, textAlign: 'center' }}>
                  6-DIGIT VERIFICATION CODE
                </Typography>

                <Typography variant="body2" sx={{ color: 'text.primary', textAlign: 'center' }}>
                  We sent a code to <br/><strong>{formData.email}</strong>
                </Typography>

                <Stack direction="row" spacing={1} sx={{ my: 2, justifyContent: "center" }}>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <TextField
                      key={index}
                      inputRef={(el) => (otpRefs.current[index] = el)}
                      value={formData.otp[index] || ''}
                      onChange={(e) => handleOtpChange(index, e)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      variant="outlined"
                      slotProps={{ htmlInput: { 
                        maxLength: 6,
                        style: { textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold', padding: '12px 0' } 
                      }}}
                      sx={{ width: 50, backgroundColor: '#f9fafb', '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                  ))}
                </Stack>

                <Button disabled={isLoading} type="submit" fullWidth variant="contained" size="large" sx={{ py: 1.5, fontWeight: 'bold', borderRadius: 2 }}>
                  {isLoading ? 'Verifying...' : 'Verify & Log In'}
                </Button>
              </Box>
            )}
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
};

export default LoginPage;
