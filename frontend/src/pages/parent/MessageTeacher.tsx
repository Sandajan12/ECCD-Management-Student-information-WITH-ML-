import React from "react";
import { Box, Typography } from "@mui/material";
import ChatInterface from "../../components/ChatInterface";
import { useChildren } from "../../hooks/useChildren";

const MessageTeacher: React.FC = () => {
  const { child } = useChildren();
  const adviser = [child?.teacher_fname, child?.teacher_lname]
    .filter(Boolean)
    .join(" ");
  return (
    <Box
      sx={{
        p: { xs: 0.5, sm: 1.5, md: 2.5 },
        width: "100%",
        maxWidth: "1280px",
        mx: "auto",
        pb: { xs: 8, md: 3 },
      }}
    >
      <Box sx={{ mb: { xs: 1.5, sm: 2.5 } }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 800,
            color: "#1e1e2f",
            mb: 0.5,
            fontSize: { xs: "1.25rem", sm: "1.75rem" },
          }}
        >
          Message Teacher
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            fontSize: { xs: "0.8rem", sm: "0.9rem" },
          }}
        >
          Communicate directly with your child's adviser.
        </Typography>
      </Box>

      <ChatInterface currentUserRole="parent" preferredContactName={adviser} />
    </Box>
  );
};

export default MessageTeacher;
