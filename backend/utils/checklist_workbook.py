"""Populate the reviewed blank DepEd checklist, including its merged score cells."""
from calendar import monthrange
from copy import copy
from math import ceil
from pathlib import Path
import openpyxl
from openpyxl.cell.cell import MergedCell
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font
from openpyxl.worksheet.pagebreak import Break
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores
from backend.utils.eccd_dates import get_official_testing_date, PHT
from backend.constants import OFFICIAL_SCHOOL_NAME

DOMAIN_CODES = {1:'GM', 2:'FM', 3:'SH', 4:'RL', 5:'EL', 6:'C', 7:'SE'}
DOMAIN_CAPACITIES = {1:13, 2:11, 3:27, 4:5, 5:8, 6:21, 7:24}


def get_mapping(domain_id, seq):
    if not 1 <= seq <= DOMAIN_CAPACITIES.get(domain_id, 0):
        return None
    if domain_id in (1,2,7) or (domain_id == 3 and seq <= 2):
        return {'row':{1:35,2:51,7:3,3:65}[domain_id]+seq,'text':'B','PRE':['D','E'],'MID':['F','G'],'POST':['H','I']}
    if domain_id in (3,4):
        return {'row':(31 if domain_id == 3 else 61)+seq,'text':'L','PRE':['N','O'],'MID':['P','Q'],'POST':['R','S']}
    if domain_id in (5,6):
        return {'row':(35 if domain_id == 5 else 46)+seq,'text':'V','PRE':['X','Y'],'MID':['Z','AA'],'POST':['AB','AC']}
    return None


def generate_student_workbook(student, teacher, parents, evaluations, questions, setting):
    wb = openpyxl.load_workbook(Path(__file__).resolve().parents[1] / 'assets/templates/ECCD_Checklist_Blank_Template.xlsx')
    ws = wb['CHECKLIST']
    def write(coordinate, value, font=None):
        cell = ws[coordinate]
        if isinstance(cell,MergedCell):
            merged = next(area for area in ws.merged_cells.ranges if coordinate in area)
            cell = ws.cell(merged.min_row,merged.min_col)
        cell.value = value
        if isinstance(value, str):
            cell.data_type = 's'
        if font: cell.font = font

    section_name = student.section.section_name if student.section else student.section_name or ''
    headers = {'V4':'NATIONAL CAPITAL REGION','V5':'DIVISION OF MANILA',
               'V6':f'SCHOOL: {OFFICIAL_SCHOOL_NAME}',
               'V7':f'SCHOOL YEAR: {student.school_year or setting.current_school_year}',
               'V8':f'SECTION: {section_name.upper()}', 'W10':student.lrn_number,
               'W11':f"{(student.last_name or '').upper()}, {(student.first_name or '').upper()}",
               'W12':student.date_of_birth.strftime('%m/%d/%Y') if student.date_of_birth else '',
               'W13':student.gender.value.upper() if student.gender else '',
               'W17':student.handedness.value if student.handedness else '', 'W18':student.address or '',
               'W24':student.num_of_siblings,'AA24':student.birth_order,
               'V28':f"{teacher.first_name or ''} {teacher.last_name or ''}".strip().upper(),
               'Y28':(setting.principal_name or '').upper()}
    for coordinate,value in headers.items(): write(coordinate,value)
    father = next((parent for parent in parents if (parent.relationship_type or '').strip().lower() == 'father'), None)
    mother = next((parent for parent in parents if (parent.relationship_type or '').strip().lower() == 'mother'), None)
    fallbacks = [parent for parent in parents if parent is not father and parent is not mother]
    selected_father = father or (fallbacks[0] if fallbacks else None)
    mother_index = 0 if father else 1
    selected_mother = mother or (fallbacks[mother_index] if len(fallbacks) > mother_index else None)
    for parent,row in [(selected_father,20),(selected_mother,22)]:
        for coordinate,value in ((f'W{row}',parent.fullname if parent else None),(f'AB{row}',parent.age if parent else None),
                                 (f'W{row+1}',parent.occupation if parent else None),(f'AA{row+1}',parent.educational_attainment if parent else None)):
            write(coordinate,value)
    for start,end,columns in ((4,27,'D E F G H I'),(36,48,'D E F G H I'),(52,62,'D E F G H I'),(66,67,'D E F G H I'),
                              (34,58,'N O P Q R S'),(62,66,'N O P Q R S'),(36,43,'X Y Z AA AB AC'),(47,67,'X Y Z AA AB AC')):
        for row in range(start,end+1):
            for column in columns.split():
                if not isinstance(ws[f'{column}{row}'],MergedCell): write(f'{column}{row}',None)
    for row in ws:
        for cell in row:
            if not isinstance(cell,MergedCell) and isinstance(cell.value,str) and '###' in cell.value: cell.value=None
    # Deleted questions leave an empty slot rather than the template's old text.
    for domain_id, capacity in DOMAIN_CAPACITIES.items():
        for sequence in range(1, capacity + 1):
            mapping = get_mapping(domain_id, sequence)
            write(f"{mapping['text']}{mapping['row']}", None)
    for question in questions:
        mapping=get_mapping(question.domain_id,question.sequence_order)
        if mapping: write(f"{mapping['text']}{mapping['row']}",f'{question.sequence_order}. {question.question_text}')
    check_font=Font(name='Wingdings',size=11,color='FF000000')
    for record in evaluations:
        mapping=get_mapping(record.question.domain_id,record.question.sequence_order)
        if mapping:
            column=mapping[record.testing_period.value][0 if record.answer.value=='KAYA' else 1]
            write(f"{column}{mapping['row']}",'ü',check_font)
            provenance = {
                'parent_submitted_at': record.parent_submitted_at,
                'teacher_marked_at': record.teacher_marked_at,
            }
            timestamps = [f'{name}: {value.astimezone(PHT).isoformat()}' for name, value in provenance.items() if value is not None]
            if timestamps:
                ws[f"{column}{mapping['row']}"].comment = Comment('\n'.join(timestamps), 'AMES')
    totals={1:(49,'D F H'),2:(63,'D F H'),3:(59,'N P R'),4:(67,'N P R'),5:(44,'X Z AB'),6:(68,'X Z AB'),7:(28,'D F H')}
    official_evaluations = [record for record in evaluations if record.question.domain_id in DOMAIN_CODES]
    for index,(period,raw,scaled) in enumerate((('PRE','N','O'),('MID','P','Q'),('POST','R','S'))):
        for row in range(9,18):
            write(f'{raw}{row}',None); write(f'{scaled}{row}',None)
        for coordinate in (f'M{index+3}',f'Q{index+3}',f'R{index+3}',f'S{index+3}',f'Y{index+14}',f'M{index+20}'): write(coordinate,None)
        for row,columns in totals.values(): write(f'{columns.split()[index]}{row}',None)
        records=[record for record in official_evaluations if record.testing_period.value==period]
        if not records: continue
        evaluation_date=get_official_testing_date(official_evaluations,period)
        if evaluation_date is None: continue
        write(f'M{index+3}',evaluation_date.strftime('%m/%d/%Y'))
        if not student.date_of_birth: continue
        birth=student.date_of_birth
        years,months,days=evaluation_date.year-birth.year,evaluation_date.month-birth.month,evaluation_date.day-birth.day
        if days<0:
            months-=1
            previous_month=evaluation_date.month-1 or 12
            previous_year=evaluation_date.year-int(evaluation_date.month==1)
            days+=monthrange(previous_year,previous_month)[1]
        if months<0: years,months=years-1,months+12
        for column,value in (('Q',years),('R',months),('S',days)): write(f'{column}{index+3}',value)
        write(f'Y{index+14}',f'{years} taon, {months} buwan')
        scores=calculate_scores([{'domain_id':record.question.domain_id,'answer':record.answer.value} for record in records],calculate_decimal_age(birth,evaluation_date))
        for domain,code in DOMAIN_CODES.items():
            write(f'{raw}{domain+8}',scores['raw_scores'][code])
            write(f'{scaled}{domain+8}',scores['scaled_scores'][code])
            row,columns=totals[domain]
            write(f'{columns.split()[index]}{row}',scores['raw_scores'][code])
        # Each pair on row 16 is merged: its one value is the SCALED total.
        write(f'{raw}16',scores['sum_of_scaled_scores'])
        write(f'{raw}17',scores['standard_score'])
        write(f'M{index+20}',scores['interpretation'])
    append_checklist_sections(ws, student, teacher, evaluations, questions, setting, section_name, totals)
    return wb


def append_checklist_sections(ws, student, teacher, evaluations, questions, setting, section_name, totals):
    """Reuse the native 13-item block without touching the original printed pages."""
    periods = ('PRE', 'MID', 'POST')
    by_domain = {}
    for question in sorted(questions, key=lambda q: (q.domain_id, q.sequence_order, q.question_id)):
        by_domain.setdefault(question.domain_id, []).append(question)
    custom_domains = [domain for domain in by_domain if domain not in DOMAIN_CODES]
    records = {(record.question_id, record.testing_period.value): record for record in evaluations}
    results = {}
    for domain in custom_domains:
        for period in periods:
            answers = [records[(q.question_id, period)].answer.value for q in by_domain[domain]
                       if (q.question_id, period) in records]
            results[domain, period] = (answers.count('KAYA'), len(answers))

    def text(row, column, value):
        cell = ws.cell(row, column)
        cell.value = value
        if isinstance(value, str):
            cell.data_type = 's'
        return cell

    # The original second printed page supplies the height budget at its saved scale.
    page_budget = sum(ws.row_dimensions[row].height or 15 for row in range(34, 70))
    page_start = 70
    next_row = 70

    def start_page():
        nonlocal page_start, next_row
        page_start = next_row
        ws.row_breaks.append(Break(id=page_start - 1, min=0, max=29))
        headers = (
            f'SCHOOL: {OFFICIAL_SCHOOL_NAME} | SCHOOL YEAR: {student.school_year or setting.current_school_year}',
            f'STUDENT: {student.last_name or ""}, {student.first_name or ""} | LRN: {student.lrn_number or ""}',
            f'SECTION: {section_name} | ADVISER: {teacher.first_name or ""} {teacher.last_name or ""}',
        )
        for offset, label in enumerate(headers):
            row = page_start + offset
            ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=29)
            cell = text(row, 1, label)
            cell.font = copy(ws['V7'].font)
            cell.alignment = Alignment(wrap_text=True, vertical='center')
            ws.row_dimensions[row].height = 24
        ws.row_dimensions[page_start + 3].height = 12
        next_row = page_start + 4

    def question_height(question):
        lines = sum(max(1, ceil(len(line) / 48)) for line in question.question_text.split('\n'))
        return max(ws.row_dimensions[36].height, lines * 11 + 4)

    panels = []
    for domain, domain_questions in by_domain.items():
        extra = [q for q in domain_questions if get_mapping(domain, q.sequence_order) is None]
        while extra:
            group = []
            heights = [ws.row_dimensions[36].height] * 13
            # Leave unused native slots when long questions require another panel.
            for question in extra[:13]:
                candidate = heights.copy()
                candidate[len(group)] = question_height(question)
                if group and sum(candidate) + 96 + 3 * ws.row_dimensions[34].height > page_budget:
                    break
                group.append(question)
                heights = candidate
            panels.append((domain, group, heights))
            extra = extra[len(group):]

    merges = [copy(region) for region in ws.merged_cells.ranges
              if region.min_row >= 34 and region.max_row <= 49 and region.max_col <= 9]
    panel_index = 0
    while panel_index < len(panels):
        start_page()
        group = []
        heights = [ws.row_dimensions[row].height for row in range(34, 50)]
        for panel in panels[panel_index:panel_index + 3]:
            candidate = heights.copy()
            candidate[2:15] = [max(old, new) for old, new in zip(heights[2:15], panel[2])]
            if group and sum(candidate) + 96 > page_budget:
                break
            group.append(panel)
            heights = candidate
        for index, height in enumerate(heights):
            ws.row_dimensions[next_row + index].height = height
        for slot, (domain, domain_questions, _) in enumerate(group):
            shift = slot * 10
            for row in ws.iter_rows(min_row=34, max_row=49, max_col=9):
                for source in row:
                    target = ws.cell(next_row + source.row - 34, source.column + shift)
                    target._style = copy(source._style)
                    if source.row in (34, 35, 49) and not isinstance(source, MergedCell):
                        text(target.row, target.column, source.value)
            for region in merges:
                translated = copy(region)
                translated.shift(col_shift=shift, row_shift=next_row - 34)
                ws.merge_cells(str(translated))
            name = by_domain[domain][0].domain.domain_name
            label = f'{name} — continued' if domain in DOMAIN_CODES or domain_questions != by_domain[domain] else name
            text(next_row, shift + 2, label)
            for index, question in enumerate(domain_questions):
                row = next_row + 2 + index
                text(row, shift + 1, question.sequence_order)
                text(row, shift + 2, question.question_text)
                for period_index, period in enumerate(periods):
                    record = records.get((question.question_id, period))
                    if record is None:
                        continue
                    column = shift + 4 + period_index * 2 + (record.answer.value != 'KAYA')
                    cell = text(row, column, '\u00fc')
                    cell.font = Font(name='Wingdings', size=11, color='FF000000')
                    timestamps = [f'{key}: {value.astimezone(PHT).isoformat()}'
                                  for key, value in (('parent_submitted_at', record.parent_submitted_at),
                                                     ('teacher_marked_at', record.teacher_marked_at)) if value is not None]
                    if timestamps:
                        cell.comment = Comment('\n'.join(timestamps), 'AMES')
            for period_index, period in enumerate(periods):
                if domain in DOMAIN_CODES:
                    total_row, columns = totals[domain]
                    result = ws[f'{columns.split()[period_index]}{total_row}'].value
                else:
                    kaya, answered = results[domain, period]
                    result = f'{kaya}/{len(by_domain[domain])}' if answered else '—'
                cell = text(next_row + 15, shift + 4 + period_index * 2, result)
                if domain in custom_domains:
                    cell.number_format = '@'
        panel_index += len(group)
        ws.row_dimensions[next_row + 16].height = 12
        next_row += 17

    for domain_index, domain in enumerate(custom_domains):
        # Repeat identity and table labels if supplementary rows need another page.
        used_height = sum(ws.row_dimensions[row].height or 15 for row in range(page_start, next_row))
        if domain_index == 0 or used_height + 36 > page_budget:
            if used_height + 88 > page_budget:
                start_page()
            ws.merge_cells(start_row=next_row, start_column=1, end_row=next_row, end_column=29)
            cell = text(next_row, 1, 'Custom Domain Results — Supplementary')
            cell.font = copy(ws['B34'].font)
            ws.row_dimensions[next_row].height = 28
            next_row += 1
            for start, end, label in ((1, 9, 'Domain'), (11, 13, 'Questions'), (14, 17, 'PRE'),
                                      (18, 21, 'MID'), (22, 25, 'POST')):
                for column in range(start, end + 1):
                    cell = ws.cell(next_row, column)
                    cell._style = copy(ws['D34']._style)
                    cell.border = copy(ws['D36'].border)
                ws.merge_cells(start_row=next_row, start_column=start, end_row=next_row, end_column=end)
                text(next_row, start, label)
            ws.row_dimensions[next_row].height = 24
            next_row += 1
        cells = [(1, 9, by_domain[domain][0].domain.domain_name), (11, 13, len(by_domain[domain]))]
        for index, period in enumerate(periods):
            kaya, answered = results[domain, period]
            cells.append((14 + index * 4, 17 + index * 4,
                          f'{kaya} KAYA / {answered} answered' if answered else '—'))
        for start, end, value in cells:
            for column in range(start, end + 1):
                cell = ws.cell(next_row, column)
                cell._style = copy(ws['B36']._style)
                cell.border = copy(ws['D36'].border)
            ws.merge_cells(start_row=next_row, start_column=start, end_row=next_row, end_column=end)
            cell = text(next_row, start, value)
            cell.alignment = Alignment(wrap_text=True, vertical='center', horizontal='left')
        ws.row_dimensions[next_row].height = 36
        next_row += 1
    if panels:
        ws.print_area = f'A1:AD{next_row - 1}'
