import { useEffect, useRef, useState } from "react";
import { Alert, Box, Grid, Paper, Switch, Typography } from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import api, { errorMessage, isNetworkError } from "../../services/api";
import {
  confirmDraft,
  readDraft,
  storeDraft,
  syncDrafts,
  type Draft,
} from "../../utils/drafts";
import type {
  ParentAssessmentAccess,
  SectionAssessmentAccess,
} from "../../types";

interface Props {
  sectionId: number | null;
  homeBasedEnabled: boolean;
  disabled: boolean;
  onHomeBasedChange: (checked: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onFeedback: (message: string, severity: "success" | "error") => void;
}
const defaults: ParentAssessmentAccess = {
  pre_test_parent_editable: true,
  mid_test_parent_editable: false,
  post_test_parent_editable: false,
};
const controls = [
  {
    key: "pre_test_parent_editable",
    label: "Pre-Test Home-Based Edit",
    description: "Allow Pre-test home-based question editing",
    color: "info",
  },
  {
    key: "mid_test_parent_editable",
    label: "Mid-Test Home-Based Edit",
    description: "Allow Mid-test home-based question editing",
    color: "warning",
  },
  {
    key: "post_test_parent_editable",
    label: "Post-Test Home-Based Edit",
    description: "Allow Post-test home-based question editing",
    color: "success",
  },
] as const;

export default function ParentAssessmentAccessSettings({
  sectionId,
  homeBasedEnabled,
  disabled,
  onHomeBasedChange,
  onBusyChange,
  onFeedback,
}: Props) {
  const { user } = useAuth();
  const owner = user?.id || 0;
  const key = `ames_draft_${owner}_parent_assessment_access_${sectionId}`;
  const path = `/api/teacher/settings/parent-assessment-access?section_id=${sectionId}`;
  const [values, setValues] = useState<ParentAssessmentAccess>(() => {
    const draft = readDraft<ParentAssessmentAccess>(key);
    return draft?.owner_id === owner ? draft.values : defaults;
  });
  const desired = useRef(values);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    onBusyChange(sectionId !== null && (!ready || saving));
  }, [sectionId, ready, saving, onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    const load = async () => {
      if (sectionId === null) return;
      const version = generation.current;
      try {
        const response = await api.get<SectionAssessmentAccess>(path);
        if (!mounted.current || generation.current !== version) return;
        const draft = readDraft<ParentAssessmentAccess>(key);
        const next = (draft?.owner_id === owner ? draft.values : null) || {
          pre_test_parent_editable: response.data.pre_test_parent_editable,
          mid_test_parent_editable: response.data.mid_test_parent_editable,
          post_test_parent_editable: response.data.post_test_parent_editable,
        };
        desired.current = next;
        setValues(next);
        setReady(true);
      } catch (error) {
        if (mounted.current) onFeedback(errorMessage(error), "error");
      }
    };
    const online = () => {
      void syncDrafts(owner);
      void load();
    };
    const synced = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) {
        void load();
        onFeedback("Parent access settings saved successfully!", "success");
      }
    };
    void load();
    window.addEventListener("online", online);
    window.addEventListener("focus", load);
    window.addEventListener("ames-record-synced", synced);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", online);
      window.removeEventListener("focus", load);
      window.removeEventListener("ames-record-synced", synced);
    };
  }, [key, owner, path, sectionId, onFeedback]);
  const change = (field: keyof ParentAssessmentAccess, checked: boolean) => {
    if (!ready || disabled || saving || sectionId === null) return;
    onFeedback("", "success");
    const version = ++generation.current;
    const next = { ...desired.current, [field]: checked };
    desired.current = next;
    setValues(next);
    const draft: Draft<ParentAssessmentAccess> = {
      owner_id: owner,
      values: next,
      revision: crypto.randomUUID(),
      is_pending_sync: true,
      request: { path, method: "put", data: next },
    };
    storeDraft(key, draft);
    setSaving(true);
    queue.current = queue.current.then(async () => {
      if (readDraft(key)?.revision !== draft.revision) return;
      try {
        if (!navigator.onLine) throw new Error("offline");
        const response = await api.put<SectionAssessmentAccess>(path, next);
        if (response.status !== 200 && response.status !== 201)
          throw new Error("The server did not confirm this save.");
        confirmDraft(key, draft.revision);
        if (mounted.current)
          onFeedback("Parent access settings saved successfully!", "success");
      } catch (error) {
        const pending = !navigator.onLine || isNetworkError(error);
        if (!pending && readDraft(key)?.revision === draft.revision)
          storeDraft(key, {
            ...draft,
            is_pending_sync: false,
            error: errorMessage(error),
          });
        if (mounted.current)
          onFeedback(
            pending
              ? "Saved locally on device. Will automatically sync once reconnected."
              : errorMessage(error),
            pending ? "success" : "error",
          );
      } finally {
        if (mounted.current && generation.current === version) setSaving(false);
      }
    });
  };
  return (
    <>
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: "bold", color: "#374151", mb: 2 }}
      >
        ECCD Assessment Editing
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
        Enable Home-Based Checklist Edit, then choose which assessment periods
        parents can edit. Changes save automatically.
      </Typography>
      {sectionId === null && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Select an active assigned section to manage home-based assessment
          periods.
        </Alert>
      )}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Box>
                <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                  Home-Based Checklist Edit
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Allow parents to fill out home checklist
                </Typography>
              </Box>
              <Switch
                checked={homeBasedEnabled}
                disabled={disabled || saving}
                onChange={(event) => onHomeBasedChange(event.target.checked)}
                color="success"
                slotProps={{
                  input: { "aria-label": "Home-Based Checklist Edit" },
                }}
              />
            </Box>
          </Paper>
        </Grid>
        {controls.map((control) => (
          <Grid key={control.key} size={{ xs: 12, sm: 6 }}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                    {control.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary" }}
                  >
                    {control.description}
                  </Typography>
                </Box>
                <Switch
                  checked={values[control.key]}
                  disabled={!ready || saving || disabled || sectionId === null}
                  onChange={(event) =>
                    change(control.key, event.target.checked)
                  }
                  color={control.color}
                  slotProps={{ input: { "aria-label": control.label } }}
                />
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </>
  );
}
