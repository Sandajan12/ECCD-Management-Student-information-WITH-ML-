"""Printable tables from the same populated workbooks used by Excel downloads."""
from datetime import date, datetime
from pathlib import Path

from fpdf import FPDF
from fpdf.fonts import FontFace
from matplotlib import get_data_path

from backend.utils.eccd_dates import now_pht


def cell_text(cell) -> str:
    value = cell.value
    if value is None:
        return ""
    if cell.font.name == "Wingdings" and value:
        return "✓"
    if isinstance(value, (date, datetime)):
        return value.strftime("%m/%d/%Y")
    return str(value).strip()


class ReportPDF(FPDF):
    def __init__(self, title: str, scope: str, landscape: bool):
        super().__init__(orientation="L" if landscape else "P", format="A4")
        self.report_title = title
        self.scope = scope
        self.table_title = ""
        self.exported_at = now_pht().strftime("%Y-%m-%d %I:%M %p")
        fonts = Path(get_data_path()) / "fonts" / "ttf"
        self.add_font("Report", fname=str(fonts / "DejaVuSans.ttf"))
        self.add_font("Report", style="B", fname=str(fonts / "DejaVuSans-Bold.ttf"))
        self.set_margins(10, 10, 10)
        self.set_auto_page_break(True, margin=17)
        self.alias_nb_pages()
        self.set_title(title)

    def header(self):
        self.set_font("Report", "B", 11)
        self.multi_cell(0, 6, "Apolinario Mabini Elementary School", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Report", "B", 10)
        self.multi_cell(0, 5, self.report_title, new_x="LMARGIN", new_y="NEXT")
        self.set_font("Report", size=8)
        self.multi_cell(0, 4, self.scope, new_x="LMARGIN", new_y="NEXT")
        if self.table_title:
            self.multi_cell(0, 4, self.table_title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def footer(self):
        self.set_y(-12)
        self.set_font("Report", size=7)
        self.cell(0, 5, f"Exported {self.exported_at} Philippine Time (Asia/Manila, UTC+8) | Page {self.page_no()} of {{nb}}", align="C")

    def report_table(self, title, headings, rows, widths):
        self.table_title = title.split("\n")[0]
        self.add_page()
        self.set_font("Report", "B", 9)
        details = title.partition("\n")[2]
        if details:
            self.multi_cell(0, 5, details, new_x="LMARGIN", new_y="NEXT", wrapmode="CHAR")
        self.ln(2)
        self.set_font("Report", size=8)
        with self.table(col_widths=widths, line_height=4, padding=1.2,
                        text_align="LEFT", wrapmode="CHAR", borders_layout="HORIZONTAL_LINES",
                        headings_style=FontFace(emphasis="B", fill_color=(232, 238, 247))) as table:
            header = table.row()
            for value in headings:
                header.cell(str(value))
            for values in rows:
                # fpdf tables cannot split one oversized row across pages.
                lines = [self.multi_cell(self.epw * weight / sum(widths) - 3, 4, str(value),
                                         dry_run=True, output="LINES", wrapmode="CHAR")
                         for value, weight in zip(values, widths)]
                for start in range(0, max(len(value) for value in lines), 20):
                    row = table.row()
                    for index, value in enumerate(lines):
                        chunk = value[start:start + 20]
                        if start and index == 0 and len(values) > 1 and len(value) <= 20:
                            chunk = value
                        row.cell("\n".join(chunk))


def checklist_tables(sheet):
    """Unfold the three side-by-side card panels without losing supplementary rows."""
    rows = [[" | ".join(cell_text(cell) for cell in row if cell.value is not None)]
            for row in sheet.iter_rows(min_row=2, max_row=29, min_col=21, max_col=29)
            if any(cell.value is not None for cell in row)]
    yield "Student and family information", ["Identification and family details"], rows, (1,)
    rows = [[period, cell_text(sheet.cell(row, 13)), *[cell_text(sheet.cell(row, col)) for col in (17, 18, 19)]]
            for period, row in (("PRE", 3), ("MID", 4), ("POST", 5))]
    yield "Official testing dates and age", ["Period", "Testing date", "Years", "Months", "Days"], rows, (1, 3, 1, 1, 1)
    rows = [[cell_text(sheet.cell(row, 12)), *[cell_text(sheet.cell(row, col)) for col in range(14, 20)]] for row in range(9, 16)]
    yield "Official domain scores", ["Domain", "PRE raw", "PRE scaled", "MID raw", "MID scaled", "POST raw", "POST scaled"], rows, (4, 1, 1, 1, 1, 1, 1)
    rows = [[cell_text(sheet.cell(row, 12)), *[cell_text(sheet.cell(row, col)) for col in (14, 16, 18)]] for row in (16, 17)]
    rows.append(["Interpretation", *[cell_text(sheet.cell(row, 13)) for row in (20, 21, 22)]])
    yield "Official overall results", ["Result", "PRE", "MID", "POST"], rows, (2, 3, 3, 3)
    notes = [[cell_text(sheet.cell(row, 12))] for row in (24, 25) if sheet.cell(row, 12).value]
    # Supplementary result rows span all three original panels; keep their labels.
    spanning = {region.min_row for region in sheet.merged_cells.ranges if region.min_col == 1 and region.max_col == 29}
    supplementary = {row for row in range(70, sheet.max_row + 1)
                     if isinstance(sheet.cell(row, 1).value, str) and type(sheet.cell(row, 11).value) is int}
    for row in sorted(spanning):
        notes.append([cell_text(sheet.cell(row, 1))])
    for first, start, initial in ((1, 2, "Socio-Emotional Domain"), (11, 26, "Self-Help Domain — continued"), (21, 30, "Checklist")):
        rows = []
        title = initial
        for row in sheet.iter_rows(min_row=start, max_row=sheet.max_row, min_col=first, max_col=first + 8):
            if row[0].row in spanning or row[0].row in supplementary:
                continue
            values = [cell_text(cell) for cell in row]
            if not any(values):
                continue
            if values[1] and "PRE" in values[3].upper():
                if rows:
                    yield title, ["No.", "Skill", "PRE", "MID", "POST"], rows, (1, 9, 2, 2, 2)
                    rows = []
                title = values[1]
            elif type(row[0].value) is int and values[1]:
                answers = ["KAYA" if values[3 + index * 2] else "DI-KAYA" if values[4 + index * 2] else "" for index in range(3)]
                rows.append([values[0], " ".join(filter(None, values[1:3])), *answers])
            elif values[1] == "ISKOR":
                rows.append(["", "Raw score / supplementary ratio", values[3], values[5], values[7]])
            elif set(filter(None, values)) - {"KAYA", "DI-KAYA"}:
                notes.append([" | ".join(filter(None, values))])
        if rows:
            yield title, ["No.", "Skill", "PRE", "MID", "POST"], rows, (1, 9, 2, 2, 2)
    if notes:
        yield "Report notes and supplementary totals — PRE / MID / POST", ["Details"], notes, (1,)
    if supplementary:
        rows = [[cell_text(sheet.cell(row, col)) for col in (1, 11, 14, 18, 22)] for row in sorted(supplementary)]
        yield "Custom Domain Results — Supplementary", ["Domain", "Questions", "PRE", "MID", "POST"], rows, (3, 1, 2, 2, 2)
    comments = [[cell.coordinate, cell.comment.text] for row in sheet for cell in row if cell.comment]
    if comments:
        yield "Saved-mark timestamps (Philippine Time)", ["Cell", "Recorded provenance"], comments, (1, 8)


def summary_tables(sheet):
    if sheet.title in ("PR", "M", "PO"):
        period = {"PR": "PRE", "M": "MID", "PO": "POST"}[sheet.title]
        # Split horizontally, repeating learner identity in every score table.
        identity = [2, 3, 4]
        columns = [7, 8, 9, 10, *range(11, 28)]
        for offset in range(0, len(columns), 6):
            selected = identity + columns[offset:offset + 6]
            headings = [cell_text(sheet.cell(12, column)) for column in selected]
            headings = [f"{cell_text(sheet.cell(12, column - 1))} scaled" if column in range(12, 25, 2) else value for column, value in zip(selected, headings)]
            rows = [[cell_text(sheet.cell(row, column)) for column in selected] for row in range(14, 44) if sheet.cell(row, 4).value]
            yield f"{period} — official section summary ({offset // 6 + 1})", headings, rows, [1, 2.5, 4] + [2] * (len(selected) - 3)
        rows = [[" | ".join(cell_text(cell) for cell in sheet[row] if cell.value is not None)] for row in [3, 8, 10, 13, 44, 45, 46]]
        yield f"{period} — report details and interpretation counts", ["Workbook details"], rows, (1,)
        return
    slots = [cell for cell in sheet[5] if type(cell.value) is int and sheet.cell(6, cell.column).value is not None]
    blocks = [cell.column for cell in sheet[5] if cell.value == "No."]
    totals = [cell.column for cell in sheet[6] if str(cell.value).startswith("RAW SCORE")]
    for offset in range(0, len(slots), 3):
        selected = slots[offset:offset + 3]
        headings = ["Student"] + [f"Question {cell.value}\nPRE K/D | MID K/D | POST K/D" for cell in selected]
        rows = []
        for row in range(9, 39):
            if not sheet.cell(row, blocks[0] + 1).value:
                continue
            values = [cell_text(sheet.cell(row, blocks[0] + 1))]
            for cell in selected:
                values.append(" | ".join("/".join(cell_text(sheet.cell(row, cell.column + index * 2 + answer)) or "—" for answer in range(2)) for index in range(3)))
            rows.append(values)
        question_key = "\n".join(f"Question {cell.value}: {cell_text(sheet.cell(6, cell.column))}" for cell in selected)
        yield f"{sheet.title} — question marks (K = KAYA, D = DI-KAYA; — = blank)\n{question_key}", headings, rows, [3] + [4] * len(selected)
    rows = [[cell_text(sheet.cell(row, blocks[0] + 1)), *[cell_text(sheet.cell(row, column)) for column in totals]] for row in range(9, 39) if sheet.cell(row, blocks[0] + 1).value]
    yield f"{sheet.title} — whole-domain raw scores", ["Student", "PRE", "MID", "POST"], rows, (4, 1, 1, 1)
    rows = [[" | ".join(cell_text(cell) for cell in sheet[row] if cell.value is not None)] for row in (1, 2, 3)]
    yield f"{sheet.title} — report details", ["Workbook details"], rows, (1,)


def workbook_pdf(workbook, *, title: str, scope: str, checklist: bool = False) -> bytes:
    pdf = ReportPDF(title, scope, landscape=not checklist)
    for sheet in workbook:
        tables = checklist_tables(sheet) if checklist else summary_tables(sheet)
        for caption, headings, rows, widths in tables:
            pdf.report_table(caption, headings, rows, widths)
    return bytes(pdf.output())
