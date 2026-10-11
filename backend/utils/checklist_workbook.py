"""Populate the reviewed blank DepEd checklist, including its merged score cells."""
from calendar import monthrange
from pathlib import Path
import openpyxl
from openpyxl.cell.cell import MergedCell
from openpyxl.styles import Font
from backend.utils.eccd_scorer import calculate_decimal_age, calculate_scores

DOMAIN_CODES = {1:'GM', 2:'FM', 3:'SH', 4:'RL', 5:'EL', 6:'C', 7:'SE'}


def get_mapping(domain_id, seq):
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
        if font: cell.font = font

    section_name = student.section.section_name if student.section else student.section_name or ''
    headers = {'V4':'NATIONAL CAPITAL REGION','V5':'DIVISION OF MANILA',
               'V6':f'SCHOOL: {setting.school_name.upper()}',
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
    for relationship,row in [('father',20),('mother',22)]:
        parent = next((parent for parent in parents if (parent.relationship_type or '').lower()==relationship),None)
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
    for question in questions:
        mapping=get_mapping(question.domain_id,question.sequence_order)
        if mapping: write(f"{mapping['text']}{mapping['row']}",f'{question.sequence_order}. {question.question_text}')
    check_font=Font(name='Wingdings',size=11,color='FF000000')
    for record in evaluations:
        mapping=get_mapping(record.question.domain_id,record.question.sequence_order)
        if mapping:
            column=mapping[record.testing_period.value][0 if record.answer.value=='KAYA' else 1]
            write(f"{column}{mapping['row']}",'ü',check_font)
    totals={1:(49,'D F H'),2:(63,'D F H'),3:(59,'N P R'),4:(67,'N P R'),5:(44,'X Z AB'),6:(68,'X Z AB'),7:(28,'D F H')}
    for index,(period,raw,scaled) in enumerate((('PRE','N','O'),('MID','P','Q'),('POST','R','S'))):
        for row in range(9,18):
            write(f'{raw}{row}',None); write(f'{scaled}{row}',None)
        for coordinate in (f'M{index+3}',f'Q{index+3}',f'R{index+3}',f'S{index+3}',f'Y{index+14}',f'M{index+20}'): write(coordinate,None)
        for row,columns in totals.values(): write(f'{columns.split()[index]}{row}',None)
        records=[record for record in evaluations if record.testing_period.value==period]
        if not records: continue
        evaluation_date=min(record.evaluation_date for record in records)
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
    return wb
