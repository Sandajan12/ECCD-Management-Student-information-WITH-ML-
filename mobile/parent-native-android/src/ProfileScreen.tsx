import React, { useState } from "react";
import { View } from "react-native";
import type { Child, ChildProfile, LinkResponse, User } from "./contracts";
import { session } from "./session";
import { messageOf, transient } from "./sessionCore";
import { draft, OFFLINE_MESSAGE } from "./draftStore";
import { drafts, useDraft } from "./drafts";
import {
  linkError,
  PROFILE_FIELDS,
  profilePayload,
  profileValues,
  validateProfile,
} from "./profile";
import type { ProfileField, ProfileValues } from "./profile";
import { Feedback, useResource } from "./resources";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Copy,
  Dialog,
  Heading,
  Input,
  Label,
  Notice,
  Progress,
  Screen,
  Segments,
  styles,
} from "./ui";

interface LinkValues {
  lrn_number: string;
  relationship_type: string;
}
export function LinkChild({
  user,
  linked,
  close,
}: {
  user: User;
  linked: (id: number) => Promise<void>;
  close: () => void;
}) {
  const key = `ames_draft_${user.id}_parent_link`;
  const { snapshot, ready, storageError } = useDraft<LinkValues>(key, user.id);
  const values = snapshot?.values || {
    lrn_number: "",
    relationship_type: "Guardian",
  };
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState<"SYNCED" | "PENDING" | null>(null);
  const [attempted, setAttempted] = useState(false);
  const change = (next: LinkValues) => {
    setStatus(null);
    setNotice("");
    void drafts.put(key, draft(user.id, next)).catch(() => {});
  };
  const submit = async () => {
    if (!ready || busy) return;
    setAttempted(true);
    setStatus(null);
    const error = linkError(values.lrn_number);
    if (error) {
      setNotice(error);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const saved = draft(user.id, values);
      await drafts.put(key, saved);
      const response = await session.request<LinkResponse>(
        "/api/parents/children/link",
        "POST",
        {
          lrn_number: values.lrn_number.trim(),
          relationship_type: values.relationship_type.trim() || "Guardian",
        },
      );
      await drafts.confirm(key, user.id, saved.revision);
      setAttempted(false);
      setStatus(response.status);
      setNotice(
        response.status === "PENDING"
          ? `Pending adviser approval. ${response.message}`
          : response.message,
      );
      if (response.status === "SYNCED") await linked(response.student_id);
    } catch (error) {
      setNotice(transient(error) ? OFFLINE_MESSAGE : messageOf(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Connect Your Child" close={close} locked={busy}>
      <Copy>
        Enter the child’s 12-digit Learner Reference Number (LRN) supplied by
        the school. Requests may require adviser approval.
      </Copy>
      {!!storageError && <Notice error>{storageError}</Notice>}
      <Input
        icon="school"
        label="12-digit LRN"
        placeholder="Enter 12-digit LRN"
        value={values.lrn_number}
        error={attempted ? linkError(values.lrn_number) : undefined}
        keyboardType="number-pad"
        editable={ready && !busy}
        onChangeText={(lrn_number) => change({ ...values, lrn_number })}
      />
      <Input
        icon="child"
        label="Relationship (optional)"
        value={values.relationship_type}
        editable={ready && !busy}
        onChangeText={(relationship_type) =>
          change({ ...values, relationship_type })
        }
      />
      {status && (
        <Badge
          icon={status === "SYNCED" ? "check" : "clock"}
          color={status === "SYNCED" ? "#15803d" : "#b45309"}
        >
          {status === "SYNCED"
            ? "SYNCED · Connected"
            : "PENDING · Adviser approval"}
        </Badge>
      )}
      {!!notice && (
        <Notice
          tone={
            status === "SYNCED"
              ? "success"
              : status === "PENDING"
                ? "warning"
                : undefined
          }
        >
          {notice}
        </Notice>
      )}
      <Button
        icon="sync"
        title={busy ? "Verifying…" : "Connect"}
        disabled={!ready || busy}
        onPress={() => void submit()}
      />
      <Button
        secondary
        title="Back (keep draft)"
        disabled={busy}
        onPress={close}
      />
    </Dialog>
  );
}
export function ProfileScreen({
  user,
  child,
  changed,
}: {
  user: User;
  child: Child;
  changed: () => Promise<void>;
}) {
  const state = useResource<ChildProfile>(
    `/api/students/${child.student_id}`,
    JSON.stringify(child),
  );
  const key = `ames_draft_${user.id}_parent_profile_${child.student_id}`;
  const { snapshot, ready, storageError } = useDraft<ProfileValues>(
    key,
    user.id,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempted, setAttempted] = useState(false);
  const record = state.data;
  const visible =
    child.allow_parent_view_student_info &&
    record?.allow_parent_view_student_info;
  const editable =
    visible &&
    child.allow_parent_edit_student_info &&
    record?.allow_parent_edit_student_info;
  const values = snapshot?.values || profileValues(record || undefined);
  const baseline = snapshot?.baseline || profileValues(record || undefined);
  const change = (field: ProfileField, value: string) => {
    void drafts
      .put(key, draft(user.id, { ...values, [field]: value }, baseline))
      .catch(() => {});
  };
  const save = async () => {
    if (!editable || !ready || busy || !record) return;
    setAttempted(true);
    const error =
      validateProfile(values, baseline) ||
      validateProfile(values, profileValues(record));
    if (error) {
      setNotice(error);
      return;
    }
    const payload = profilePayload(values, baseline);
    if (!Object.keys(payload).length) {
      setNotice("No changed fields to save.");
      return;
    }
    setBusy(true);
    setNotice("");
    const saved = draft(user.id, values, baseline);
    try {
      await drafts.put(key, {
        ...saved,
        is_pending_sync: true,
        request: {
          path: `/api/parents/children/${child.student_id}`,
          method: "put",
          data: payload,
        },
      });
      await session.request(
        `/api/parents/children/${child.student_id}`,
        "PUT",
        payload,
      );
      await drafts.confirm(key, user.id, saved.revision);
      const newer = drafts.peek<ProfileValues>(key, user.id);
      if (newer) await drafts.put(key, { ...newer, baseline: values });
      state.update({ ...record, ...payload } as ChildProfile);
      setNotice("Profile changes saved.");
      await Promise.all([state.reload(), changed()]);
    } catch (error) {
      if (!transient(error))
        await drafts
          .confirm<ProfileValues>(key, user.id, saved.revision, (current) => ({
            ...current,
            is_pending_sync: false,
            error: messageOf(error),
          }))
          .catch(() => {});
      setNotice(transient(error) ? OFFLINE_MESSAGE : messageOf(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      footer={
        visible && (
          <>
            {!!snapshot && (
              <Copy>Draft saved on this device · Submit changes manually</Copy>
            )}
            {!!notice && <Notice>{notice}</Notice>}
            <Button
              icon="save"
              color="#15803d"
              title={busy ? "Saving…" : "Save Changes"}
              disabled={!editable || !ready || busy}
              onPress={() => void save()}
            />
          </>
        )
      }
    >
      <Heading
        title="Child Information"
        subtitle="View official school records and family background details."
        icon="child"
      />
      <Feedback {...state} />
      <Card>
        {!visible ? (
          <>
            <Heading title="Access Restricted" icon="lock" />
            <Notice>
              Student information viewing is disabled by your teacher. Please
              contact your child’s adviser via the Messages tab if you have any
              questions. Saved drafts are preserved on this device.
            </Notice>
          </>
        ) : (
          record && (
            <>
              <View style={{ alignItems: "center", gap: 12 }}>
                <Avatar name={record.full_name || "Child"} size={72} />
                <Label style={{ fontSize: 18 }}>
                  {record.full_name || "Child"}
                </Label>
                <Badge color={record.is_active ? "#15803d" : "#64748b"}>
                  {record.is_active ? "Active" : "Inactive"}
                </Badge>
                <Copy>LRN: {record.masked_lrn}</Copy>
              </View>
              <View style={{ gap: 6 }}>
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  <Copy>Profile completeness</Copy>
                  <Label>{record.profile_completeness}%</Label>
                </View>
                <Progress
                  value={record.profile_completeness}
                  label="Profile completeness"
                />
              </View>
              {[
                ["Birth date", record.date_of_birth],
                ["Gender", record.gender],
                ["Age", record.age],
                ["Section", record.section_name],
                ["School year", record.school_year],
                ["Adviser", record.adviser_name],
              ].map(([label, value]) => (
                <View
                  key={label}
                  style={{
                    gap: 3,
                    paddingVertical: 5,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f1f5f9",
                  }}
                >
                  <Copy>{label}</Copy>
                  <Label>{value ?? "—"}</Label>
                </View>
              ))}
            </>
          )
        )}
      </Card>
      {visible && (
        <>
          {!editable && (
            <Notice>Profile editing is locked by the adviser.</Notice>
          )}
          {!!storageError && <Notice error>{storageError}</Notice>}
          {sections.map((section) => (
            <Card key={section.title}>
              <Heading
                title={section.title}
                icon={
                  section.title === "Contact & Household" ? "home" : "child"
                }
              />
              {PROFILE_FIELDS.filter((field) =>
                section.fields.includes(field),
              ).map((field) =>
                field === "handedness" ? (
                  <View key={field} style={{ gap: 8 }}>
                    <Label>Handedness</Label>
                    <Segments
                      options={(["", "Left", "Right"] as const).map(
                        (value) => ({ value, label: value || "Not supplied" }),
                      )}
                      value={values.handedness}
                      disabled={!editable || !ready || busy}
                      onChange={(value) => change(field, value)}
                    />
                  </View>
                ) : (
                  <Input
                    key={field}
                    label={fieldLabel(field)}
                    value={values[field]}
                    editable={Boolean(editable && ready && !busy)}
                    error={
                      attempted
                        ? fieldError(field, values, baseline)
                        : undefined
                    }
                    helper={
                      field === "emergency_contact"
                        ? "11 digits beginning with 09"
                        : undefined
                    }
                    icon={
                      field === "emergency_contact"
                        ? "phone"
                        : field === "address"
                          ? "address"
                          : undefined
                    }
                    keyboardType={
                      field.endsWith("_age") ||
                      field === "num_of_siblings" ||
                      field === "emergency_contact"
                        ? "number-pad"
                        : "default"
                    }
                    onChangeText={(value) => change(field, value)}
                  />
                ),
              )}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
const sections: Array<{ title: string; fields: readonly ProfileField[] }> = [
  {
    title: "Contact & Household",
    fields: [
      "emergency_contact",
      "address",
      "handedness",
      "num_of_siblings",
      "birth_order",
    ],
  },
  {
    title: "Father’s Information",
    fields: ["father_name", "father_age", "father_occ", "father_educ"],
  },
  {
    title: "Mother’s Information",
    fields: ["mother_name", "mother_age", "mother_occ", "mother_educ"],
  },
  {
    title: "Legal Guardian’s Information",
    fields: [
      "legal_guardian_name",
      "legal_guardian_age",
      "legal_guardian_occ",
      "legal_guardian_educ",
    ],
  },
];
function fieldLabel(field: ProfileField) {
  return (
    (
      {
        emergency_contact: "Emergency Contact",
        address: "Home Address",
        num_of_siblings: "Number of Siblings",
        birth_order: "Birth Order",
      } as Partial<Record<ProfileField, string>>
    )[field] ||
    (field.endsWith("_name")
      ? "Full Name"
      : field.endsWith("_age")
        ? "Age"
        : field.endsWith("_occ")
          ? "Occupation"
          : "Educational Attainment")
  );
}
function fieldError(
  field: ProfileField,
  values: ProfileValues,
  baseline: ProfileValues,
): string {
  const value = values[field].trim();
  if (field === "emergency_contact" && value && !/^09[0-9]{9}$/.test(value))
    return "Contact number must begin with 09 and contain exactly 11 digits.";
  if (
    (field.endsWith("_age") || field === "num_of_siblings") &&
    value &&
    (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)))
  )
    return "Enter a non-negative whole number.";
  if (field.endsWith("_name") && !value && baseline[field].trim())
    return "An existing guardian’s name cannot be cleared.";
  const limit =
    field.endsWith("_name") || field === "address"
      ? 100
      : field.endsWith("_occ") || field === "birth_order"
        ? 50
        : field.endsWith("_educ")
          ? 20
          : 0;
  return limit && [...value].length > limit
    ? `Maximum ${limit} characters.`
    : "";
}
