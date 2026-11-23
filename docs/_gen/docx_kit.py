# -*- coding: utf-8 -*-
"""python-docx 构建工具：统一中文字体、标题、表格、代码块、页脚页码与目录域。"""

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

CN_FONT = "微软雅黑"
MONO_FONT = "Consolas"
INK = "14110F"
INK_SOFT = "4A433E"
BRAND = "C2410C"
GREY_BG = "F6F4F1"
CODE_BG = "F5F5F5"
HEAD_BG = "FFE7DA"


def _set_run_font(run, size=10.5, bold=False, color=None, mono=False, italic=False):
    name = MONO_FONT if mono else CN_FONT
    run.font.name = name
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:ascii"), name)
    rfonts.set(qn("w:hAnsi"), name)
    rfonts.set(qn("w:eastAsia"), CN_FONT)


def _shade(element, hex_fill):
    pr = element.get_or_add_tcPr() if element.tag.endswith("tc") else element.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    pr.append(shd)


def _cell_shade(cell, hex_fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tc_pr.append(shd)


def _para_border_bottom(paragraph, color="D9CFC4", size="6"):
    p_pr = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), size)
    bottom.set(qn("w:space"), "4")
    bottom.set(qn("w:color"), color)
    borders.append(bottom)
    p_pr.append(borders)


def _field(paragraph, instruction, placeholder=""):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = placeholder
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(separate)
    run._r.append(text)
    run._r.append(end)
    return run


class Doc:
    def __init__(self, title="厂派（ShipAI）平台开发详细文档"):
        self.doc = Document()
        self._setup_page()
        self._setup_styles()
        self._setup_footer(title)
        self._first_h1 = True

    # ------------------------------------------------------------------ 基础设置
    def _setup_page(self):
        section = self.doc.sections[0]
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)
        section.top_margin = Cm(2.2)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(2.3)
        section.right_margin = Cm(2.3)
        section.header_distance = Cm(1.2)
        section.footer_distance = Cm(1.2)

    def _setup_styles(self):
        normal = self.doc.styles["Normal"]
        normal.font.name = CN_FONT
        normal.font.size = Pt(10.5)
        normal.font.color.rgb = RGBColor.from_string(INK_SOFT)
        normal.element.rPr.rFonts.set(qn("w:eastAsia"), CN_FONT)
        pf = normal.paragraph_format
        pf.line_spacing = 1.45
        pf.space_before = Pt(0)
        pf.space_after = Pt(5)

        specs = {
            "Heading 1": (18, 16, 8),
            "Heading 2": (14, 14, 6),
            "Heading 3": (12, 10, 4),
            "Heading 4": (11, 8, 3),
        }
        for name, (size, before, after) in specs.items():
            style = self.doc.styles[name]
            style.font.name = CN_FONT
            style.font.size = Pt(size)
            style.font.bold = True
            style.font.color.rgb = RGBColor.from_string(INK)
            style.element.rPr.rFonts.set(qn("w:eastAsia"), CN_FONT)
            style.paragraph_format.space_before = Pt(before)
            style.paragraph_format.space_after = Pt(after)
            style.paragraph_format.keep_with_next = True
            style.paragraph_format.line_spacing = 1.25

    def _setup_footer(self, title):
        section = self.doc.sections[0]
        paragraph = section.footer.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run(title + "    第 ")
        _set_run_font(run, size=8.5, color="8B8178")
        page_run = _field(paragraph, " PAGE ", "1")
        _set_run_font(page_run, size=8.5, color="8B8178")
        run2 = paragraph.add_run(" 页 / 共 ")
        _set_run_font(run2, size=8.5, color="8B8178")
        total_run = _field(paragraph, " NUMPAGES ", "1")
        _set_run_font(total_run, size=8.5, color="8B8178")
        run3 = paragraph.add_run(" 页")
        _set_run_font(run3, size=8.5, color="8B8178")

    # ------------------------------------------------------------------ 文本
    def h1(self, text):
        if not self._first_h1:
            self.doc.add_page_break()
        self._first_h1 = False
        return self.doc.add_heading(text, level=1)

    def h2(self, text):
        return self.doc.add_heading(text, level=2)

    def h3(self, text):
        return self.doc.add_heading(text, level=3)

    def h4(self, text):
        return self.doc.add_heading(text, level=4)

    def p(self, text="", size=10.5, bold=False, color=None, align=None, space_after=5):
        paragraph = self.doc.add_paragraph()
        if align == "center":
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif align == "right":
            paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        paragraph.paragraph_format.space_after = Pt(space_after)
        run = paragraph.add_run(text)
        _set_run_font(run, size=size, bold=bold, color=color)
        return paragraph

    def kv(self, key, value):
        """「键：值」行，键加粗。"""
        paragraph = self.doc.add_paragraph()
        paragraph.paragraph_format.space_after = Pt(2)
        run = paragraph.add_run(key + "：")
        _set_run_font(run, size=10.5, bold=True, color=INK)
        run2 = paragraph.add_run(value)
        _set_run_font(run2, size=10.5)
        return paragraph

    def bullets(self, items, size=10.5):
        for item in items:
            paragraph = self.doc.add_paragraph()
            pf = paragraph.paragraph_format
            pf.left_indent = Cm(0.72)
            pf.first_line_indent = Cm(-0.42)
            pf.space_after = Pt(2.5)
            pf.line_spacing = 1.4
            run = paragraph.add_run("· " + item)
            _set_run_font(run, size=size)

    def numbered(self, items, size=10.5):
        for index, item in enumerate(items, start=1):
            paragraph = self.doc.add_paragraph()
            pf = paragraph.paragraph_format
            pf.left_indent = Cm(0.86)
            pf.first_line_indent = Cm(-0.56)
            pf.space_after = Pt(2.5)
            pf.line_spacing = 1.4
            run = paragraph.add_run("%d. %s" % (index, item))
            _set_run_font(run, size=size)

    def note(self, text, label="说明"):
        table = self.doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = table.cell(0, 0)
        _cell_shade(cell, GREY_BG)
        paragraph = cell.paragraphs[0]
        paragraph.paragraph_format.space_before = Pt(3)
        paragraph.paragraph_format.space_after = Pt(3)
        paragraph.paragraph_format.line_spacing = 1.35
        run = paragraph.add_run(label + "：" )
        _set_run_font(run, size=9.5, bold=True, color=BRAND)
        run2 = paragraph.add_run(text)
        _set_run_font(run2, size=9.5)
        self._fix_layout(table, [16.2])
        self.spacer(4)

    def spacer(self, pt=6):
        paragraph = self.doc.add_paragraph()
        paragraph.paragraph_format.space_after = Pt(0)
        paragraph.paragraph_format.line_spacing = 1.0
        run = paragraph.add_run("")
        run.font.size = Pt(pt)

    def page_break(self):
        self.doc.add_page_break()

    # ------------------------------------------------------------------ 代码
    def code(self, lines, caption=None):
        if caption:
            paragraph = self.doc.add_paragraph()
            paragraph.paragraph_format.space_before = Pt(4)
            paragraph.paragraph_format.space_after = Pt(2)
            run = paragraph.add_run(caption)
            _set_run_font(run, size=9, bold=True, color="8B8178")

        table = self.doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = table.cell(0, 0)
        _cell_shade(cell, CODE_BG)
        lines = lines if isinstance(lines, (list, tuple)) else lines.split("\n")
        first = True
        for line in lines:
            paragraph = cell.paragraphs[0] if first else cell.add_paragraph()
            first = False
            pf = paragraph.paragraph_format
            pf.space_before = Pt(1)
            pf.space_after = Pt(1)
            pf.line_spacing = 1.15
            pf.left_indent = Cm(0.1)
            run = paragraph.add_run(line if line else " ")
            _set_run_font(run, size=8.8, mono=True, color="2B2B2B")
            run._element.get_or_add_rPr()
        self._fix_layout(table, [16.2])
        self.spacer(6)

    def _fix_layout(self, table, widths):
        """固定表格布局并写入列宽，避免 Word 按内容重排导致表格偏窄。"""
        if not widths:
            return
        scale = 16.2 / float(sum(widths))
        widths = [w * scale for w in widths]
        table.autofit = False
        tbl_pr = table._tbl.tblPr
        for element in tbl_pr.findall(qn("w:tblW")):
            tbl_pr.remove(element)
        tbl_w = OxmlElement("w:tblW")
        tbl_w.set(qn("w:type"), "dxa")
        tbl_w.set(qn("w:w"), str(int(sum(widths) * 567)))
        # 按 OOXML 规定顺序插入 tblW，位置不合法会被 Word 忽略
        tbl_pr.insert_element_before(
            tbl_w,
            "w:jc",
            "w:tblCellSpacing",
            "w:tblInd",
            "w:tblBorders",
            "w:shd",
            "w:tblLayout",
            "w:tblCellMar",
            "w:tblLook",
            "w:tblCaption",
            "w:tblDescription",
        )
        layouts = tbl_pr.findall(qn("w:tblLayout"))
        for extra in layouts[1:]:
            tbl_pr.remove(extra)
        if layouts:
            layouts[0].set(qn("w:type"), "fixed")
        for index, width in enumerate(widths):
            table.columns[index].width = Cm(width)
        for row in table.rows:
            for index, width in enumerate(widths):
                if index < len(row.cells):
                    row.cells[index].width = Cm(width)

    # ------------------------------------------------------------------ 表格
    def table(self, headers, rows, widths=None, size=9, header_size=9, zebra=True):
        table = self.doc.add_table(rows=1, cols=len(headers))
        table.style = "Table Grid"
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = True

        header_cells = table.rows[0].cells
        for index, text in enumerate(headers):
            cell = header_cells[index]
            _cell_shade(cell, HEAD_BG)
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_before = Pt(2)
            paragraph.paragraph_format.space_after = Pt(2)
            paragraph.paragraph_format.line_spacing = 1.15
            run = paragraph.add_run(str(text))
            _set_run_font(run, size=header_size, bold=True, color="8A3410")
            if widths:
                cell.width = Cm(widths[index])

        # 表头跨页重复
        tr_pr = table.rows[0]._tr.get_or_add_trPr()
        tbl_header = OxmlElement("w:tblHeader")
        tbl_header.set(qn("w:val"), "true")
        tr_pr.append(tbl_header)

        for row_index, row in enumerate(rows):
            cells = table.add_row().cells
            for col_index, text in enumerate(row):
                cell = cells[col_index]
                if widths:
                    cell.width = Cm(widths[col_index])
                if zebra and row_index % 2 == 1:
                    _cell_shade(cell, "FCFAF7")
                paragraph = cell.paragraphs[0]
                paragraph.paragraph_format.space_before = Pt(1.5)
                paragraph.paragraph_format.space_after = Pt(1.5)
                paragraph.paragraph_format.line_spacing = 1.2
                lines = str(text).split("\n")
                for line_index, line in enumerate(lines):
                    target = paragraph if line_index == 0 else cell.add_paragraph()
                    if line_index:
                        target.paragraph_format.space_before = Pt(0)
                        target.paragraph_format.space_after = Pt(1.5)
                        target.paragraph_format.line_spacing = 1.2
                    run = target.add_run(line)
                    _set_run_font(run, size=size, color=INK_SOFT)
        self._fix_layout(table, widths)
        self.spacer(6)
        return table

    # ------------------------------------------------------------------ 目录
    def toc(self):
        self.h1("目录")
        paragraph = self.doc.add_paragraph()
        paragraph.paragraph_format.space_before = Pt(6)
        _field(paragraph, 'TOC \\o "1-3" \\h \\z \\u', "在 Word 中右键选择「更新域」生成目录")
        hint = self.doc.add_paragraph()
        run = hint.add_run(
            "提示：目录为 Word 域字段，首次打开后全选（Ctrl/Cmd + A）按 F9，"
            "或右键目录选择「更新域 → 更新整个目录」，即可生成带页码的目录。"
        )
        _set_run_font(run, size=9, color="8B8178", italic=True)

    def cover(self, title, subtitle, lines):
        for _ in range(3):
            self.spacer(18)
        paragraph = self.doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_after = Pt(6)
        run = paragraph.add_run("SHIPAI · 厂派")
        _set_run_font(run, size=12, bold=True, color=BRAND)

        paragraph = self.doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_after = Pt(8)
        run = paragraph.add_run(title)
        _set_run_font(run, size=30, bold=True, color=INK)

        paragraph = self.doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _para_border_bottom(paragraph, color=BRAND, size="12")
        paragraph.paragraph_format.space_after = Pt(14)
        run = paragraph.add_run(subtitle)
        _set_run_font(run, size=11.5, color="8B8178")

        self.spacer(24)
        table = self.doc.add_table(rows=0, cols=2)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        for key, value in lines:
            cells = table.add_row().cells
            cells[0].width = Cm(4.2)
            cells[1].width = Cm(9.2)
            p0 = cells[0].paragraphs[0]
            p0.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p0.paragraph_format.space_after = Pt(5)
            r0 = p0.add_run(key)
            _set_run_font(r0, size=9.5, color="8B8178")
            p1 = cells[1].paragraphs[0]
            p1.paragraph_format.space_after = Pt(5)
            r1 = p1.add_run(value)
            _set_run_font(r1, size=9.5, color=INK)
        self._fix_layout(table, [3.8, 12.4])

    def save(self, path):
        self.doc.core_properties.title = "厂派（ShipAI）平台开发详细文档"
        self.doc.core_properties.subject = "Next.js 全栈社交平台开发文档"
        self.doc.core_properties.author = "厂派开发组"
        self.doc.save(path)
        return path
