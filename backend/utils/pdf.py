"""Printable tables from the same populated workbooks used by Excel downloads."""
from datetime import date, datetime
from pathlib import Path

from fpdf import FPDF
from fpdf.fonts import FontFace
from matplotlib import get_data_path
from openpyxl.cell.cell import MergedCell

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
        self.summary_header = None
        self.exported_at = now_pht().strftime("%Y-%m-%d %I:%M %p")
        fonts = Path(get_data_path()) / "fonts" / "ttf"
        self.add_font("Report", fname=str(fonts / "DejaVuSans.ttf"))
        self.add_font("Report", style="B", fname=str(fonts / "DejaVuSans-Bold.ttf"))
        self.set_margins(10, 10, 10)
        self.set_auto_page_break(True, margin=17)
        self.alias_nb_pages()
        self.set_title(title)

    def header(self):
        if self.summary_header:
            school, title, details = self.summary_header
            for text, size, style, height in ((school, 11, "B", 6), (title, 10, "B", 5), (details, 8, "", 4)):
                self.set_font("Report", style, size)
                self.multi_cell(0, height, text, new_x="LMARGIN", new_y="NEXT")
            self.ln(3)
            return
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

    def section_summary(self, sheet):
        _, headings, rows, widths = next(summary_tables(sheet))
        period = {"PR": "PRETEST", "M": "MID", "PO": "POSTTEST"}[sheet.title]
        school = "Apolinario Mabini Elementary School"
        if cell_text(sheet["E8"]):
            school += f" | School Number: {cell_text(sheet['E8'])}"
        year = cell_text(sheet["J8"]).partition(":")[2].strip() or cell_text(sheet["J8"])
        self.summary_header = (
            school, f"ECCD Section Summary — {period}",
            f"Section: {cell_text(sheet['N10'])} | School Year: {year} | Teacher: {cell_text(sheet['T10'])} | Testing Date: {cell_text(sheet['U8'])}",
        )
        bottom_margin = self.b_margin
        # Reserve the counts box and clearance even on continuation pages.
        self.set_auto_page_break(True, margin=43)
        self.add_page()
        self.set_font("Report", size=7)
        with self.table(col_widths=widths, line_height=3.2, padding=0.3,
                        text_align="CENTER", wrapmode="WORD", borders_layout="HORIZONTAL_LINES",
                        headings_style=FontFace(emphasis="B", fill_color=(232, 238, 247))) as table:
            header = table.row()
            for value in headings:
                header.cell(value)
            for values in rows:
                row = table.row()
                for index, value in enumerate(values):
                    row.cell(value, align="LEFT" if index in (2, 16) else "CENTER")
        self.set_auto_page_break(True, margin=bottom_margin)
        counts = {cell_text(sheet.cell(row, 2)): [cell_text(sheet.cell(row, column)) or "0" for column in range(4, 9)]
                  for row in range(14, sheet.max_row + 1) if cell_text(sheet.cell(row, 2)) in ("Male", "Female")}
        totals = [str(sum(int(values[index]) for values in counts.values())) for index in range(5)]
        self.set_y(self.h - 39)
        self.set_x(self.w - self.r_margin - 110)
        self.cell(110, 4, "Interpretation counts (HA / SA / A / SD / D)", new_x="LMARGIN", new_y="NEXT")
        with self.table(width=110, align="RIGHT", col_widths=(2, 1, 1, 1, 1, 1), line_height=3.2,
                        padding=0.4, text_align="CENTER",
                        headings_style=FontFace(emphasis="B", fill_color=(232, 238, 247))) as table:
            table.row(["", "HA", "SA", "A", "SD", "D"])
            for label in ("Male", "Female", "Total"):
                table.row([label, *(totals if label == "Total" else counts.get(label, ["0"] * 5))])


def checklist_tables(sheet, *, supplementary_only=False):
    """Unfold the three side-by-side card panels without losing supplementary rows."""
    if not supplementary_only:
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
    notes = [] if supplementary_only else [[cell_text(sheet.cell(row, 12))] for row in (24, 25) if sheet.cell(row, 12).value]
    # Supplementary result rows span all three original panels; keep their labels.
    spanning = {region.min_row for region in sheet.merged_cells.ranges if region.min_col == 1 and region.max_col == 29}
    supplementary = {row for row in range(70, sheet.max_row + 1)
                     if isinstance(sheet.cell(row, 1).value, str) and type(sheet.cell(row, 11).value) is int}
    for row in sorted(spanning):
        notes.append([cell_text(sheet.cell(row, 1))])
    for first, start, initial in ((1, 2, "Socio-Emotional Domain"), (11, 26, "Self-Help Domain — continued"), (21, 30, "Checklist")):
        rows = []
        title = initial
        for row in sheet.iter_rows(min_row=max(start, 70) if supplementary_only else start, max_row=sheet.max_row, min_col=first, max_col=first + 8):
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
    if sheet.title not in ("PR", "M", "PO"):
        return
    period = {"PR": "PRE", "M": "MID", "PO": "POST"}[sheet.title]
    headings = ["No.", "LRN", "Name of Pupils", "Sex", "Birthday", "Test Date", "Age",
                "GM R/S", "FM R/S", "SH R/S", "RL R/S", "EL R/S", "C R/S", "SE R/S",
                "Total Scaled", "Std Score", "Interpretation"]
    rows = []
    for row in range(14, sheet.max_row + 1):
        if type(sheet.cell(row, 2).value) is not int or not sheet.cell(row, 4).value:
            continue
        values = [cell_text(sheet.cell(row, column)) for column in (2, 3, 4, 7, 8, 9, 10)]
        for column in range(11, 25, 2):
            raw, scaled = (cell_text(sheet.cell(row, index)) for index in (column, column + 1))
            values.append(f"{raw} / {scaled}" if raw or scaled else "")
        values.extend(cell_text(sheet.cell(row, column)) for column in (25, 26, 27))
        rows.append(values)
    yield f"{period} — official section summary", headings, rows, (7, 19, 43, 10, 18, 18, 10, 11, 11, 11, 11, 11, 11, 11, 13, 13, 39)


def workbook_pdf(workbook, *, title: str, scope: str, checklist: bool = False) -> bytes:
    pdf = ReportPDF(title, scope, landscape=not checklist)
    for sheet in workbook:
        if checklist:
            for caption, headings, rows, widths in checklist_tables(sheet):
                pdf.report_table(caption, headings, rows, widths)
        elif sheet.title in ("PR", "M", "PO"):
            pdf.section_summary(sheet)
    return bytes(pdf.output())


class TeacherChecklistPDF(ReportPDF):
    """Two printed template faces; supplementary content follows without truncation."""

    def header(self):
        self.set_font("Report", "B", 10)
        self.cell(0, 5, "Apolinario Mabini Elementary School", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Report", "B", 8)
        self.cell(0, 4, f"{self.report_title} — {self.table_title}", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Report", size=7)
        self.multi_cell(0, 3.2, self.scope, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def template_face(self, sheet, first, last, face):
        self.table_title = face
        self.add_page()
        top = self.y
        bottom = self.h - (35 if face == "Back" else 18)
        cell_margin = self.c_margin
        self.c_margin = 0
        # The Excel template uses Arial Narrow; match its compact horizontal spacing.
        self.set_stretching(75)
        widths = []
        for column in range(1, 30):
            dimension = next(item for item in sheet.column_dimensions.values() if item.min <= column <= item.max)
            widths.append(dimension.width * 7 + 5)
        widths = [width * self.epw / sum(widths) for width in widths]
        for panel in (0, 10, 20):
            panel_width = sum(widths[panel:panel + 9])
            text_width = panel_width - 3.4 - 6 * 4.1
            ratio = widths[panel + 1] / sum(widths[panel + 1:panel + 3])
            widths[panel:panel + 9] = [3.4, text_width * ratio, text_width * (1 - ratio), *([4.1] * 6)]
        merges = {(area.min_row, area.min_col): area for area in sheet.merged_cells.ranges
                  if first <= area.min_row <= area.max_row <= last and area.max_col <= 29}
        cells = []
        for row in sheet.iter_rows(min_row=first, max_row=last, max_col=29):
            for cell in row:
                if isinstance(cell, MergedCell):
                    continue
                area = merges.get((cell.row, cell.column))
                end_row = area.max_row if area else cell.row
                end_column = area.max_col if area else cell.column
                text = cell_text(cell)
                if cell.coordinate == "V6":
                    text = "SCHOOL: Apolinario Mabini Elementary School"
                cells.append((cell, end_row, end_column, text))
        # Measure wrapped content first so neither marks nor questions overlap borders.
        overflow = []
        while True:
            for size in (7, 6.5, 6, 5.5):
                heights = {row: 2.4 for row in range(first, last + 1)}
                measured = []
                for cell, end_row, end_column, text in sorted(cells, key=lambda item: item[1] - item[0].row):
                    self.set_font("Report", "B" if cell.font.bold else "", size)
                    width = sum(widths[cell.column - 1:end_column])
                    lines = self.multi_cell(width - 0.6, size * 0.38, text, dry_run=True, output="LINES", wrapmode="WORD") if text else []
                    needed = len(lines) * size * 0.38 + 0.6
                    span = range(cell.row, end_row + 1)
                    extra = max(0, needed - sum(heights[row] for row in span)) / len(span)
                    for row in span:
                        heights[row] += extra
                    measured.append((cell, end_row, end_column, lines))
                if sum(heights.values()) <= bottom - top:
                    break
            else:
                # Preserve unusually long edited text on a supplement instead of clipping it.
                index = max(range(len(cells)), key=lambda index: len(cells[index][3]))
                cell, end_row, end_column, text = cells[index]
                overflow.append([cell.coordinate, text])
                cells[index] = (cell, end_row, end_column, f"See supplement: {cell.coordinate}")
                continue
            break
        self.set_draw_color(150, 150, 150)
        self.set_line_width(0.15)
        for cell, end_row, end_column, lines in measured:
            x = self.l_margin + sum(widths[:cell.column - 1])
            y = top + sum(heights[row] for row in range(first, cell.row))
            width = sum(widths[cell.column - 1:end_column])
            height = sum(heights[row] for row in range(cell.row, end_row + 1))
            for side, coordinates in (
                (cell.border.top, (x, y, x + width, y)),
                (cell.border.bottom, (x, y + height, x + width, y + height)),
                (cell.border.left, (x, y, x, y + height)),
                (cell.border.right, (x + width, y, x + width, y + height)),
            ):
                if side and side.style:
                    self.line(*coordinates)
            if lines:
                self.set_font("Report", "B" if cell.font.bold else "", size)
                self.set_xy(x + 0.3, y + 0.3)
                self.multi_cell(width - 0.6, size * 0.38, "\n".join(lines),
                                align="C" if cell.alignment.horizontal == "center" else "L", padding=0)
        self.c_margin = cell_margin
        self.set_stretching(100)
        if face == "Back":
            self.set_xy(self.l_margin, self.h - 33)
            self.set_font("Report", size=7)
            self.cell(0, 5, "Parent / Teacher Remarks: __________________________________________________________________________________", new_x="LMARGIN", new_y="NEXT")
            self.cell(0, 7, "Parent / Guardian Signature: ____________________   Teacher Signature: ____________________   Date: ______________")
        return overflow


def teacher_checklist_pdf(workbook, *, scope: str) -> bytes:
    pdf = TeacherChecklistPDF("ECCD Individual Checklist", scope, landscape=True)
    sheet = workbook["CHECKLIST"]
    overflow = pdf.template_face(sheet, 2, 32, "Front") + pdf.template_face(sheet, 34, 68, "Back")
    if overflow:
        pdf.report_table("Template text continuation", ["Cell", "Full text"], overflow, (1, 12))
    # Extra panels, supplementary totals and provenance keep the existing full-content renderer.
    for caption, headings, rows, widths in checklist_tables(sheet, supplementary_only=True):
        if rows:
            pdf.report_table(caption, headings, rows, widths)
    return bytes(pdf.output())
