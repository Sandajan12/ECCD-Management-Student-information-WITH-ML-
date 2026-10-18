"""Section-scoped home assessment windows, independent of score release."""
from pydantic import ConfigDict, StrictBool
from .common import ApiModel, PositiveId


class ParentAssessmentAccess(ApiModel):
    pre_test_parent_editable: StrictBool
    mid_test_parent_editable: StrictBool
    post_test_parent_editable: StrictBool
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class SectionAssessmentAccess(ParentAssessmentAccess):
    section_id: PositiveId
