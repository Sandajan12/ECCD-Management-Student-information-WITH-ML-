import { useId } from "react";
import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface TermsAndPrivacyModalProps {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
  container?: HTMLElement | null;
}

interface NoticeSectionProps {
  title: string;
  children: ReactNode;
}

function NoticeSection({ title, children }: NoticeSectionProps) {
  const headingId = useId();
  return (
    <Stack component="section" aria-labelledby={headingId} sx={{ gap: 1.5 }}>
      <Typography
        id={headingId}
        component="h3"
        sx={{ fontSize: "1rem", fontWeight: 600, color: "#4543c0" }}
      >
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

export default function TermsAndPrivacyModal({
  open,
  onClose,
  onAccept,
  container,
}: TermsAndPrivacyModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Dialog
      open={open}
      container={container ?? undefined}
      onClose={onClose}
      onKeyDown={(event) => {
        // Dismiss only this modal, preserving the enclosing native OTP dialog.
        if (event.key === "Escape") event.preventDefault();
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      scroll="paper"
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            m: { xs: 2, sm: 4 },
            width: { xs: "calc(100% - 2rem)", sm: "calc(100% - 4rem)" },
            maxHeight: "calc(100dvh - 4rem)",
            fontFamily: "inherit",
            boxShadow: "0 12px 48px rgba(30, 30, 47, 0.16)",
          },
        },
      }}
    >
      <DialogTitle
        id={titleId}
        sx={{
          px: { xs: 2, sm: 3 },
          pt: 3,
          fontWeight: 600,
          fontFamily: "inherit",
        }}
      >
        Terms and Conditions and Data Privacy Notice
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 3 }, overflowWrap: "anywhere" }}>
        <Stack
          sx={{
            gap: 3,
            color: "text.secondary",
            "& .MuiTypography-root": { fontFamily: "inherit", lineHeight: 1.7 },
          }}
        >
          <Typography id={descriptionId}>
            Please review how Apolinario Mabini Elementary School (AMES) handles
            learner, family, and account information in its ECCD System before
            registering or signing in.
          </Typography>

          <NoticeSection title="1. Data privacy and child protection">
            <Typography>
              AMES processes personal and sensitive information in compliance
              with the Philippine Data Privacy Act of 2012 (Republic Act No.
              10173) and applicable DepEd child protection policies, including
              DepEd Order No. 40, s. 2012. Information must be used for the
              declared educational purposes, with respect for each learner’s
              privacy, dignity, and safety.
            </Typography>
          </NoticeSection>

          <NoticeSection title="2. Information collected and processed">
            <Typography>
              <strong>Student identity and demographics:</strong> Full name,
              Learner Reference Number (LRN), date of birth, age in months
              derived from birth and assessment dates, gender, handedness,
              residential address, emergency contact number, section, and school
              year.
            </Typography>
            <Typography>
              <strong>Family and household information:</strong> Parent/guardian
              names, account email addresses, relationship to the learner, age,
              educational attainment, occupation, number of siblings, and the
              learner’s birth order, together with parent-child linking requests
              and verification status.
            </Typography>
            <Typography>
              <strong>ECCD developmental records:</strong> Item-level KAYA /
              DI-KAYA checklist responses, home-based observations, assessment
              dates and ages, evaluator information, raw scores, scaled scores,
              standard scores, and developmental interpretations for Pre-Test,
              Mid-Test, and Post-Test. The seven official domains are Gross
              Motor, Fine Motor, Self-Help, Receptive Language, Expressive
              Language, Cognitive, and Socio-Emotional.
            </Typography>
            <Typography>
              <strong>Accounts and system activity:</strong> Account names,
              email addresses, roles, protected password and OTP verification
              records, remembered-device information when enabled,
              parent-teacher portal messages, assessment release and access
              permissions, and security audit logs. Form drafts are kept on this
              browser to recover unsaved work after reloads or connection
              failures.
            </Typography>
          </NoticeSection>

          <NoticeSection title="3. Why information is processed">
            <Typography>
              The system supports official deterministic computation and
              record-keeping of DepEd Kindergarten ECCD assessments, learner and
              section administration, secure parent-teacher progress monitoring
              and communication, account verification, and protection of school
              records. Official scores are calculated from recorded assessment
              responses using the ECCD scoring tables.
            </Typography>
            <Typography>
              <strong>Advisory machine learning analytics:</strong> Pre-Test
              domain scores and their derived totals, standard score and domain
              support count, age at Pre-Test, gender, handedness, parental
              education, household occupation tier where available, number of
              siblings, and birth order are processed by a Random Forest
              research model to generate hypothetical Post-Test readiness
              projections. Pre-Test results also inform early intervention
              activity guides. Names and LRNs are not model predictors. Missing
              model inputs may be filled using training-data values; projections
              can be inaccurate.
            </Typography>
            <Typography
              sx={{
                p: 2,
                borderRadius: 3,
                bgcolor: "#f0f7f3",
                color: "#24543b",
              }}
            >
              ML outputs are <strong>advisory educational support only</strong>.
              They are <strong>not clinical or medical diagnoses</strong>, must
              be reviewed by a teacher, and never alter or replace official
              teacher-administered ECCD scores. They must not be the sole basis
              for decisions about a learner’s placement or access to support.
            </Typography>
          </NoticeSection>

          <NoticeSection title="4. Security, access, sharing, and retention">
            <Typography>
              LRNs and system-generated backups are encrypted. Access is
              strictly role-based: the Chairman administers school records;
              assigned section teachers access their authorized learners; and
              verified, Synced Parents access only their linked children,
              subject to the active adviser’s permissions. Score release,
              checklist visibility, editing, and parent predictions have
              separate permission gates. Accepting these terms does not unlock
              restricted records.
            </Typography>
            <Typography>
              Personal data is never sold or shared with unauthorized third
              parties. Any legally required disclosure must have a lawful basis
              and appropriate safeguards. Users must keep downloaded records and
              backups secure and use shared devices carefully because drafts can
              contain confidential information.
            </Typography>
            <Typography>
              Records and backups must be retained only as needed for the stated
              purposes and applicable DepEd and legal record-keeping
              obligations, then securely disposed of. Archiving a learner or
              rolling over a school year preserves historical records; it does
              not delete them. Ask the school administration for the applicable
              retention schedule and disposal process.
            </Typography>
          </NoticeSection>

          <NoticeSection title="5. Your rights and responsibilities">
            <Typography>
              You may request information about processing, access to your data,
              correction of inaccuracies, and, where applicable, objection,
              withdrawal of consent, blocking, erasure, or a portable copy.
              Requests remain subject to lawful school record-keeping duties.
              Contact the AMES school administration through the school office
              to exercise these rights or raise a privacy concern. You may also
              lodge a complaint with the National Privacy Commission.
            </Typography>
            <Typography>
              Parents, guardians, teachers, and the Chairman agree to provide
              truthful information, submit only records they are authorized to
              provide, protect account credentials and OTPs, respect adviser
              permissions, and keep student messages, exported records, and
              backups confidential. Parents/guardians must be authorized to act
              for the child. Acknowledgment does not waive privacy rights or
              authorize unrelated processing.
            </Typography>
          </NoticeSection>

          <Stack sx={{ gap: 1 }}>
            <Typography
              component="h3"
              sx={{ fontWeight: 600, color: "text.primary" }}
            >
              Official references
            </Typography>
            <Link
              href="https://privacy.gov.ph/data-privacy-act/"
              target="_blank"
              rel="noopener noreferrer"
            >
              RA 10173 — National Privacy Commission
            </Link>
            <Link
              href="https://www.deped.gov.ph/2012/05/14/do-40-s-2012-deped-child-protection-policy/"
              target="_blank"
              rel="noopener noreferrer"
            >
              DepEd Order No. 40, s. 2012 — Child Protection Policy
            </Link>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ display: "block", p: { xs: 2, sm: 3 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{ gap: 2, justifyContent: "flex-end" }}
        >
          <Button
            type="button"
            onClick={onClose}
            sx={{ borderRadius: 3, textTransform: "none" }}
          >
            Close
          </Button>
          <Button
            type="button"
            variant="contained"
            onClick={() => {
              onAccept();
              onClose();
            }}
            sx={{ borderRadius: 3, textTransform: "none", bgcolor: "#4543c0" }}
          >
            I Agree &amp; Accept
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
