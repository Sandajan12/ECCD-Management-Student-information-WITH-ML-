"""Display an already-populated workbook without regenerating its card content."""
from datetime import date, datetime
from html import escape

from openpyxl.utils.cell import column_index_from_string, range_boundaries, range_to_tuple
from openpyxl.worksheet.worksheet import Worksheet


def worksheet_table(sheet: Worksheet) -> str:
    """Preserve one sheet's print area, merged cells, proportions and styling."""
    bounds = range_to_tuple(sheet.print_area)[1] if sheet.print_area else range_boundaries(sheet.calculate_dimension())
    first_column, first_row, last_column, last_row = bounds
    merged = {}
    covered = set()
    for region in sheet.merged_cells.ranges:
        merged[(region.min_row, region.min_col)] = region
        covered.update(
            (row, column)
            for row in range(region.min_row, region.max_row + 1)
            for column in range(region.min_col, region.max_col + 1)
            if (row, column) != (region.min_row, region.min_col)
        )

    widths = {column: sheet.sheet_format.defaultColWidth or 13 for column in range(first_column, last_column + 1)}
    for dimension in sheet.column_dimensions.values():
        start = dimension.min or column_index_from_string(dimension.index)
        end = dimension.max or start
        for column in range(max(first_column, start), min(last_column, end) + 1):
            widths[column] = dimension.width
    total_width = sum(widths.values())
    columns = "".join(f'<col style="width:{width / total_width:.4%}">' for width in widths.values())
    rows = []
    for row in range(first_row, last_row + 1):
        cells = []
        for column in range(first_column, last_column + 1):
            if (row, column) in covered:
                continue
            cell = sheet.cell(row, column)
            region = merged.get((row, column))
            span = f' rowspan="{region.max_row - row + 1}" colspan="{region.max_col - column + 1}"' if region else ""
            font, alignment = cell.font, cell.alignment
            styles = [f"font-size:{font.sz or 11}pt"]
            if font.b:
                styles.append("font-weight:bold")
            if font.i:
                styles.append("font-style:italic")
            horizontal = {"left": "left", "center": "center", "centerContinuous": "center", "right": "right", "justify": "justify"}.get(alignment.horizontal, "left")
            vertical = {"top": "top", "center": "middle", "bottom": "bottom"}.get(alignment.vertical, "middle")
            styles.extend((f"text-align:{horizontal}", f"vertical-align:{vertical}"))
            styles.append("white-space:pre-wrap" if alignment.wrap_text else "white-space:pre")
            if font.color and font.color.type == "rgb":
                styles.append(f"color:#{font.color.rgb[-6:]}")
            if cell.fill.patternType == "solid" and cell.fill.fgColor.type == "rgb":
                styles.append(f"background-color:#{cell.fill.fgColor.rgb[-6:]}")
            for side in ("top", "right", "bottom", "left"):
                edge = getattr(cell.border, side)
                if edge and edge.style:
                    style = "double" if edge.style == "double" else "dashed" if "dash" in edge.style.lower() else "solid"
                    styles.append(f"border-{side}:1px {style} #444")
            value = cell.value
            if font.name == "Wingdings" and value:
                value = "\u2713"
            elif isinstance(value, (date, datetime)):
                value = value.strftime("%m/%d/%Y")
            content = escape(str(value)) if value is not None else ""
            cells.append(f'<td data-cell="{cell.coordinate}"{span} style="{";".join(styles)}">{content}</td>')
        height = sheet.row_dimensions[row].height or sheet.sheet_format.defaultRowHeight or 15
        rows.append(f'<tr style="height:{height}pt">{"".join(cells)}</tr>')
    return (
        f'<section aria-label="{escape(sheet.title, quote=True)}"><table aria-label="Official ECCD Card">'
        f'<colgroup>{columns}</colgroup><tbody>{"".join(rows)}</tbody></table></section>'
    )


def worksheet_preview(sheet: Worksheet, continuation_sheets: tuple[Worksheet, ...] = ()) -> str:
    tables = ''.join(worksheet_table(page) for page in (sheet, *continuation_sheets))
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'
        '<title>ECCD Card</title><style>'
        'body{margin:0;padding:1rem;background:white;color:#111;font-family:Arial,sans-serif}'
        'table{border-collapse:collapse;table-layout:fixed;width:100%;min-width:75rem}'
        'td{padding:.1rem;box-sizing:border-box}'
        'section+section{margin-top:2rem;break-before:page}'
        '</style></head><body>'
        f'{tables}</body></html>'
    )
