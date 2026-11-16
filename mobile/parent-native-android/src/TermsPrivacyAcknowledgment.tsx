import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Button, Copy, Dialog, Icon, Label, Notice } from "./ui";

// sRGB conversion of the website's blue-600: oklch(54.6% 0.245 262.881).
export const linkBlue = "#155dfc";

interface TermsPrivacyAcknowledgmentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function NoticeSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Label style={{ fontSize: 16, color: "#4543c0" }}>{title}</Label>
      {children}
    </View>
  );
}

/** Native copy of the website's acknowledgment/notice; only "browser" becomes "device". */
export function TermsPrivacyAcknowledgment({
  checked,
  onChange,
  disabled = false,
}: TermsPrivacyAcknowledgmentProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const toggle = () => {
    if (!disabled) onChange(!checked);
  };
  const reference = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setError("Unable to open this reference in your browser.");
    }
  };
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="I have read and agree to the Terms and Conditions."
          accessibilityHint="Required to continue"
          accessibilityState={{ checked, disabled }}
          disabled={disabled}
          onPress={toggle}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: checked ? linkBlue : "#cbd5e1",
              backgroundColor: checked ? linkBlue : "#fff",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {checked && <Icon name="check" color="#fff" size={15} />}
          </View>
        </Pressable>
        <Copy style={{ flex: 1, color: "#4b5563" }}>
          <Text onPress={toggle}>I have read and agree to the </Text>
          <Text
            accessibilityRole="link"
            accessibilityHint="Opens the Terms and Conditions dialog"
            onPress={() => {
              setError("");
              setOpen(true);
            }}
            style={{ color: linkBlue, fontWeight: "500" }}
          >
            Terms and Conditions
          </Text>
          .
        </Copy>
      </View>
      {open && (
        <Dialog
          title="Terms and Conditions and Data Privacy Notice"
          close={() => setOpen(false)}
          closeLabel="Close Terms and Conditions"
          footer={
            <View style={{ gap: 12 }}>
              <Button secondary title="Close" onPress={() => setOpen(false)} />
              <Button
                title="I Agree & Accept"
                disabled={disabled}
                onPress={() => {
                  if (disabled) return;
                  onChange(true);
                  setOpen(false);
                }}
              />
            </View>
          }
        >
          <Copy>
            Please review how Apolinario Mabini Elementary School (AMES) handles
            learner, family, and account information in its ECCD System before
            registering or signing in.
          </Copy>
          <NoticeSection title="1. Data privacy and child protection">
            <Copy>
              AMES processes personal and sensitive information in compliance
              with the Philippine Data Privacy Act of 2012 (Republic Act No.
              10173) and applicable DepEd child protection policies, including
              DepEd Order No. 40, s. 2012. Information must be used for the
              declared educational purposes, with respect for each learner’s
              privacy, dignity, and safety.
            </Copy>
          </NoticeSection>
          <NoticeSection title="2. Information collected and processed">
            <Copy>
              <Text style={{ fontWeight: "600" }}>
                Student identity and demographics:
              </Text>{" "}
              Full name, Learner Reference Number (LRN), date of birth, age in
              months derived from birth and assessment dates, gender,
              handedness, residential address, emergency contact number,
              section, and school year.
            </Copy>
            <Copy>
              <Text style={{ fontWeight: "600" }}>
                Family and household information:
              </Text>{" "}
              Parent/guardian names, account email addresses, relationship to
              the learner, age, educational attainment, occupation, number of
              siblings, and the learner’s birth order, together with
              parent-child linking requests and verification status.
            </Copy>
            <Copy>
              <Text style={{ fontWeight: "600" }}>
                ECCD developmental records:
              </Text>{" "}
              Item-level KAYA / DI-KAYA checklist responses, home-based
              observations, assessment dates and ages, evaluator information,
              raw scores, scaled scores, standard scores, and developmental
              interpretations for Pre-Test, Mid-Test, and Post-Test. The seven
              official domains are Gross Motor, Fine Motor, Self-Help, Receptive
              Language, Expressive Language, Cognitive, and Socio-Emotional.
            </Copy>
            <Copy>
              <Text style={{ fontWeight: "600" }}>
                Accounts and system activity:
              </Text>{" "}
              Account names, email addresses, roles, protected password and OTP
              verification records, authentication session information,
              parent-teacher portal messages, assessment release and access
              permissions, and security audit logs. Form drafts are kept on this
              device to recover unsaved work after reloads or connection
              failures.
            </Copy>
          </NoticeSection>
          <NoticeSection title="3. Why information is processed">
            <Copy>
              The system supports official deterministic computation and
              record-keeping of DepEd Kindergarten ECCD assessments, learner and
              section administration, secure parent-teacher progress monitoring
              and communication, account verification, and protection of school
              records. Official scores are calculated from recorded assessment
              responses using the ECCD scoring tables.
            </Copy>
            <Copy>
              <Text style={{ fontWeight: "600" }}>
                Advisory machine learning analytics:
              </Text>{" "}
              Pre-Test domain scores and their derived totals, standard score
              and domain support count, age at Pre-Test, gender, handedness,
              parental education, household occupation tier where available,
              number of siblings, and birth order are processed by a Random
              Forest research model to generate hypothetical Post-Test readiness
              projections. Pre-Test results also inform early intervention
              activity guides. Names and LRNs are not model predictors. Missing
              model inputs may be filled using training-data values; projections
              can be inaccurate.
            </Copy>
            <Copy
              style={{
                padding: 16,
                borderRadius: 12,
                backgroundColor: "#f0f7f3",
                color: "#24543b",
              }}
            >
              ML outputs are{" "}
              <Text style={{ fontWeight: "600" }}>
                advisory educational support only
              </Text>
              . They are{" "}
              <Text style={{ fontWeight: "600" }}>
                not clinical or medical diagnoses
              </Text>
              , must be reviewed by a teacher, and never alter or replace
              official teacher-administered ECCD scores. They must not be the
              sole basis for decisions about a learner’s placement or access to
              support.
            </Copy>
          </NoticeSection>
          <NoticeSection title="4. Security, access, sharing, and retention">
            <Copy>
              LRNs and system-generated backups are encrypted. Access is
              strictly role-based: the Chairman administers school records;
              assigned section teachers access their authorized learners; and
              verified, Synced Parents access only their linked children,
              subject to the active adviser’s permissions. Score release,
              checklist visibility, editing, and parent predictions have
              separate permission gates. Accepting these terms does not unlock
              restricted records.
            </Copy>
            <Copy>
              Personal data is never sold or shared with unauthorized third
              parties. Any legally required disclosure must have a lawful basis
              and appropriate safeguards. Users must keep downloaded records and
              backups secure and use shared devices carefully because drafts can
              contain confidential information.
            </Copy>
            <Copy>
              Records and backups must be retained only as needed for the stated
              purposes and applicable DepEd and legal record-keeping
              obligations, then securely disposed of. Archiving a learner or
              rolling over a school year preserves historical records; it does
              not delete them. Ask the school administration for the applicable
              retention schedule and disposal process.
            </Copy>
          </NoticeSection>
          <NoticeSection title="5. Your rights and responsibilities">
            <Copy>
              You may request information about processing, access to your data,
              correction of inaccuracies, and, where applicable, objection,
              withdrawal of consent, blocking, erasure, or a portable copy.
              Requests remain subject to lawful school record-keeping duties.
              Contact the AMES school administration through the school office
              to exercise these rights or raise a privacy concern. You may also
              lodge a complaint with the National Privacy Commission.
            </Copy>
            <Copy>
              Parents, guardians, teachers, and the Chairman agree to provide
              truthful information, submit only records they are authorized to
              provide, protect account credentials and OTPs, respect adviser
              permissions, and keep student messages, exported records, and
              backups confidential. Parents/guardians must be authorized to act
              for the child. Acknowledgment does not waive privacy rights or
              authorize unrelated processing.
            </Copy>
          </NoticeSection>
          <Label>Official references</Label>
          <Copy>
            <Text
              accessibilityRole="link"
              style={{ color: linkBlue }}
              onPress={() =>
                void reference("https://privacy.gov.ph/data-privacy-act/")
              }
            >
              RA 10173 — National Privacy Commission
            </Text>
          </Copy>
          <Copy>
            <Text
              accessibilityRole="link"
              style={{ color: linkBlue }}
              onPress={() =>
                void reference(
                  "https://www.deped.gov.ph/2012/05/14/do-40-s-2012-deped-child-protection-policy/",
                )
              }
            >
              DepEd Order No. 40, s. 2012 — Child Protection Policy
            </Text>
          </Copy>
          {!!error && <Notice error>{error}</Notice>}
        </Dialog>
      )}
    </>
  );
}
