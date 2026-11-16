import { useEffect, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useDurableFile } from "../../utils/fileDrafts";

export default function HomePhotoField({
  resource,
  eligible,
  disabled,
}: {
  resource: string;
  eligible: boolean;
  disabled: boolean;
}) {
  const file = useDurableFile(resource);
  const [preview, setPreview] = useState<string>("");
  useEffect(() => {
    if (!file.file) return;
    const url = URL.createObjectURL(file.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file.file]);
  if (!eligible && !file.file) return null;
  return (
    <Stack spacing={1} sx={{ alignItems: "flex-start", minWidth: 0 }}>
      {eligible && (
        <Button
          component="label"
          size="small"
          variant="outlined"
          disabled={disabled}
          sx={{ borderRadius: 3 }}
        >
          Optional photo
          <input
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) file.choose(selected);
              event.target.value = "";
            }}
          />
        </Button>
      )}
      {file.file && (
        <>
          {preview && (
            <Box
              component="img"
              src={preview}
              alt="Optional photo preview"
              sx={{
                maxWidth: "100%",
                maxHeight: "12rem",
                borderRadius: 2,
                objectFit: "contain",
              }}
            />
          )}
          <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
            {file.file.name} · Photo stays on this device until you submit.
          </Typography>
          {!eligible && (
            <Typography variant="caption">
              An earlier KAYA now carries forward. Remove this photo before
              submitting.
            </Typography>
          )}
          <Button
            size="small"
            disabled={disabled}
            onClick={() => void file.confirm(file.revision.current)}
            sx={{ borderRadius: 3 }}
          >
            Remove photo
          </Button>
        </>
      )}
    </Stack>
  );
}
