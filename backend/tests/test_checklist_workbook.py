"""Integrity of the ten-sheet summary asset, independent of school records."""
import hashlib
from copy import copy
import json
import warnings
from zipfile import ZipFile
from xml.etree import ElementTree

import openpyxl
import pytest

from backend.utils.excel import TEMPLATES, workbook_bytes


SUMMARY_SHEETS = ["PR", "M", "PO", "GMF", "FMF", "SHF", "RLF", "ELF", "CF", "SEF"]


def test_summary_template_is_blank_and_manifest_matches():
    path = TEMPLATES / "ECCD_Summary_Matrix_Template.xlsx"
    manifest = next(item for item in json.loads((TEMPLATES / "manifest.json").read_text()) if item["file"] == path.name)
    assert manifest["sheets"] == SUMMARY_SHEETS
    assert manifest["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        workbook = openpyxl.load_workbook(path)
        assert workbook.sheetnames == SUMMARY_SHEETS
        for style in workbook._cell_styles:
            assert style.fontId < len(workbook._fonts)
            assert style.fillId < len(workbook._fills)
            assert style.borderId < len(workbook._borders)
        for sheet in list(workbook)[3:]:
            assert all(cell.value is None and cell.comment is None for row in sheet.iter_rows(min_row=9, max_row=38) for cell in row)
            assert all(cell.data_type != "f" for row in sheet for cell in row)
            for row in sheet:
                for cell in row:
                    # Resolve all style references; invalid cross-workbook IDs fail here.
                    _ = cell.font, cell.fill, cell.border, cell.alignment, cell.number_format
            for dimension in (*sheet.row_dimensions.values(), *sheet.column_dimensions.values()):
                _ = dimension.font, dimension.fill, dimension.border, dimension.alignment, dimension.number_format
        for name in ("FMF", "RLF"):
            sheet = workbook[name]
            assert [sheet.cell(5, cell.column).value for cell in sheet[6] if cell.value == "RAW SCORE"] == ["PRETEST", "MID", "POSTTEST"]
        workbook_bytes(workbook)
        workbook.close()
    assert not caught
    with ZipFile(path) as archive:
        assert archive.testzip() is None
        for name in archive.namelist():
            if name.endswith((".xml", ".rels")):
                ElementTree.fromstring(archive.read(name))
        assert not any("externalLink" in name for name in archive.namelist())


def test_domain_templates_retain_source_layouts():
    source_path = TEMPLATES / "EasyCD-Checklist-2024-V3.-violet-FEMALE-2024-2025-.xlsx"
    if not source_path.exists():
        pytest.skip("Original EasyCD workbook is a local, untracked reference asset")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        source = openpyxl.load_workbook(source_path)
    target = openpyxl.load_workbook(TEMPLATES / "ECCD_Summary_Matrix_Template.xlsx")
    try:
        for name in SUMMARY_SHEETS[3:]:
            original, copied = source[name], target[name]
            assert str(original.merged_cells) == str(copied.merged_cells)
            assert str(original.print_area) == str(copied.print_area)
            assert original.page_setup == copied.page_setup
            assert original.page_margins == copied.page_margins
            assert original.row_breaks == copied.row_breaks
            assert original.col_breaks == copied.col_breaks
            assert original.sheet_format == copied.sheet_format
            assert {key: dim.height for key, dim in original.row_dimensions.items()} == {key: dim.height for key, dim in copied.row_dimensions.items()}
            assert {key: (dim.width, dim.hidden) for key, dim in original.column_dimensions.items()} == {key: (dim.width, dim.hidden) for key, dim in copied.column_dimensions.items()}
            for dimensions in ("row_dimensions", "column_dimensions"):
                for key, dimension in getattr(original, dimensions).items():
                    other = getattr(copied, dimensions)[key]
                    for attr in ("font", "fill", "border", "alignment", "protection", "number_format"):
                        assert copy(getattr(dimension, attr)) == copy(getattr(other, attr))
            for row in original:
                for cell in row:
                    other = copied[cell.coordinate]
                    assert copy(cell.font) == copy(other.font)
                    assert copy(cell.fill) == copy(other.fill)
                    assert copy(cell.border) == copy(other.border)
                    assert copy(cell.alignment) == copy(other.alignment)
                    assert cell.number_format == other.number_format
    finally:
        source.close()
        target.close()
