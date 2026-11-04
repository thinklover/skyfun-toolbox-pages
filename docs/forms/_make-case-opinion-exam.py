# -*- coding: utf-8 -*-
"""依實際公會案件意見退件（避開建物／戶籍謄本）產出 20 題考題 PDF。"""
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    KeepTogether,
)

OUT = Path(__file__).resolve().parent / "公會案件意見退件考題_20題.pdf"
# 嵌入系統中文字型（勿用 CID，Chrome／Edge 常顯示亂碼）
_FONT_CANDIDATES = [
    (r"C:\Windows\Fonts\msjh.ttc", 0),
    (r"C:\Windows\Fonts\kaiu.ttf", None),
    (r"C:\Windows\Fonts\mingliu.ttc", 0),
]

# 題目依 115/09～115/10 實際案件意見退件整理；刻意不含建物謄本、戶籍謄本
QUESTIONS = [
    {
        "cat": "其他／系統狀態",
        "q": "送審前發現星鴻系統狀態仍顯示「退件」或「秘書待初審」，正確做法是？",
        "opts": [
            "照樣交紙本，公會會自行改狀態",
            "先確認系統已正式送出且狀態正確後再交件",
            "只要紙本齊全即可，系統狀態不影響",
            "等公會通知再補送系統",
        ],
        "ans": 1,
        "note": "實際退件常見「系統狀態顯示退件／秘書待初審／系統未送出」。",
    },
    {
        "cat": "房東/客資料誤繕、過期、缺漏",
        "q": "房客具弱勢身分時，下列何者正確？",
        "opts": [
            "只在系統勾選即可",
            "只在紙本表 5 註記即可",
            "系統與紙本表 5 都要註記身分類別，並上傳／檢附證明",
            "不用註記，公會會自行查核",
        ],
        "ans": 2,
        "note": "常見退件：弱勢身分未填、系統與紙本不一致、子女未註記弱勢資格。",
    },
    {
        "cat": "房東/客資料誤繕、過期、缺漏",
        "q": "出租人匯款資料（銀行、分行、帳號、戶名），應注意什麼？",
        "opts": [
            "只要帳號正確，分行隨便填",
            "紙本表單 1 與系統必須一致且正確",
            "系統空白也可以，事後再補",
            "只填戶名即可",
        ],
        "ans": 1,
        "note": "常見退件：系統匯款資料（分行）填寫錯誤、帳戶有誤、未附存摺影本。",
    },
    {
        "cat": "房東/客資料誤繕、過期、缺漏",
        "q": "房東由代理人辦理時，下列何者正確？",
        "opts": [
            "口頭說明即可，不用附文件",
            "只要代理人簽名",
            "須附代理人身分證影本＋授權書，系統也要填代理人資料",
            "只要房東身分證",
        ],
        "ans": 2,
        "note": "常見退件：系統代理人資料未填、紙本未附代理人身分證卻勾已檢附。",
    },
    {
        "cat": "房東/客資料誤繕、過期、缺漏",
        "q": "房客配偶居留證已過期，送件前應如何處理？",
        "opts": [
            "過期沒關係，有附就好",
            "起租後再補新證即可",
            "須在有效期限內，過期要更新後再送",
            "只要系統有上傳，紙本過期無妨",
        ],
        "ans": 2,
        "note": "常見退件：配偶居留證超過有效日期、身分證明過期。",
    },
    {
        "cat": "資料缺漏、重複(未檢附)",
        "q": "房客「同質性比對（同質補助）」資料，送件時應如何處理？",
        "opts": [
            "口頭告知公會即可",
            "不需要檢附",
            "須檢附正確的系統截圖畫面",
            "起租後再補",
        ],
        "ans": 2,
        "note": "常見退件：同質補助未檢附（截圖畫面）、截圖檢附錯誤。",
    },
    {
        "cat": "資料缺漏、重複(未檢附)",
        "q": "出租人申請書（表 1）常因漏附哪類稅務文件被退？",
        "opts": [
            "營業稅單",
            "房屋稅單（房屋稅明細），紙本與系統都要附",
            "綜合所得稅申報書",
            "不用附任何稅務文件",
        ],
        "ans": 1,
        "note": "常見退件：房屋稅單未檢附。",
    },
    {
        "cat": "資料缺漏、重複(未檢附)",
        "q": "系統勾選了「原租賃契約」，但沒有上傳檔案，算不算錯誤？",
        "opts": [
            "不算，勾選只是提醒",
            "算，有勾就要上傳，紙本也要提供",
            "只要紙本有就好",
            "起租後補即可",
        ],
        "ans": 1,
        "note": "常見退件：承租人未提供原租賃契約（紙本、系統）。",
    },
    {
        "cat": "未附原租約、不完整／掃描檔缺失",
        "q": "包租代管案件送審，下列哪一組文件都要檢附且頁數完整？",
        "opts": [
            "只附租賃契約即可",
            "只附公證書即可",
            "委租約、委管約、租賃契約、承租人申請書；公證書也不能缺頁",
            "只附承租人申請書即可",
        ],
        "ans": 2,
        "note": "常見退件：委租／委管／租賃／申請書未檢附、公證書缺頁、檔案上傳錯誤。",
    },
    {
        "cat": "消防三寶(熱水器滅火器偵煙器)",
        "q": "滅火器照片要符合哪個條件，才不易被公會退回？",
        "opts": [
            "拍到瓶身即可",
            "可用網路圖片",
            "要能看到物件完整地址，且有效日期清楚",
            "只拍有效日期即可",
        ],
        "ans": 2,
        "note": "常見退件：滅火器照片看不清地址或有效日期。",
    },
    {
        "cat": "消防三寶(熱水器滅火器偵煙器)",
        "q": "滅火器遠照與近照只有一張有地址，公會通常會怎麼判？",
        "opts": [
            "只要遠照合格即可",
            "只要近照合格即可",
            "視為合格",
            "無法確認是同一支，須補能對上地址的清楚照片",
        ],
        "ans": 3,
        "note": "遠近照須能確認為同一支滅火器。",
    },
    {
        "cat": "消防三寶(熱水器滅火器偵煙器)",
        "q": "電熱水器照片外殼不完整、有安全疑慮時，應如何處理？",
        "opts": [
            "照送，公會會自行判斷",
            "系統、紙本都重新檢附清楚完整的照片",
            "只改系統即可",
            "只改紙本即可",
        ],
        "ans": 1,
        "note": "常見退件：請重新檢附電熱水器照片（原照無外殼、安全有疑點）。",
    },
    {
        "cat": "金額/費用誤繕",
        "q": "契約書、申請書與系統上的「月租金」應如何處理？",
        "opts": [
            "三者必須一致，不符要先核對修正再送",
            "只看契約書即可",
            "只看系統即可",
            "各區標準不同，可自行填寫",
        ],
        "ans": 0,
        "note": "常見退件：系統租金與紙本不符。",
    },
    {
        "cat": "金額/費用誤繕",
        "q": "管理費金額應如何處理？",
        "opts": [
            "紙本、系統、契約書寫法不同沒關係",
            "紙本表 2、契約書、系統三者要一致",
            "只填系統",
            "只填契約書",
        ],
        "ans": 1,
        "note": "金額類退件多為紙本與系統不一致。",
    },
    {
        "cat": "未蓋章/未簽章(含章糊)",
        "q": "租賃契約書內容需要修改時，正確做法是？",
        "opts": [
            "用立可白塗掉",
            "用鉛筆改即可",
            "修改處要簽章，不能用鉛筆（系統、紙本都要更新）",
            "不用簽章",
        ],
        "ans": 2,
        "note": "常見退件：修改處未簽章、使用鉛筆修改。",
    },
    {
        "cat": "未蓋章/未簽章(含章糊)",
        "q": "委租契約書封面業者未蓋章，屬於哪類問題？",
        "opts": [
            "不算錯誤",
            "未蓋章／未簽章，須補蓋業者章後再送",
            "屬於日期錯誤",
            "屬於金額錯誤",
        ],
        "ans": 1,
        "note": "常見退件：委租封面未蓋業者章、包轉租約未蓋業者章。",
    },
    {
        "cat": "表單勾選有誤(未勾、勾錯)",
        "q": "房客申請書「是否現有住宅政策補貼戶」的勾選，應注意什麼？",
        "opts": [
            "隨便勾一個即可",
            "只勾紙本",
            "要與系統一致，並與同質性比對結果相符",
            "只勾系統",
        ],
        "ans": 2,
        "note": "常見退件：紙本與系統勾選不一致。",
    },
    {
        "cat": "表單勾選有誤(未勾、勾錯)",
        "q": "表單勾選「已檢附代理人身分證」，實際卻沒附，應如何避免？",
        "opts": [
            "不算錯誤",
            "勾選必須與實際檢附文件一致",
            "屬於日期錯誤",
            "屬於金額錯誤",
        ],
        "ans": 1,
        "note": "勾選與檢附不符會被退。",
    },
    {
        "cat": "日期未填、誤繕",
        "q": "系統上的「房客申請日期」應依據什麼填寫？",
        "opts": [
            "系統送件當天",
            "起租日",
            "與紙本表單 5 的申請日期一致",
            "業務方便的日期即可",
        ],
        "ans": 2,
        "note": "常見退件：系統房客申請日期與紙本不符、申請日期空白。",
    },
    {
        "cat": "其他（補助重複／租金評定）",
        "q": "承租人家人另有領 300 億租金補貼（重複補助）時，正確處理是？",
        "opts": [
            "照常進件",
            "先分戶後再起租，或提供放棄切結及銷戶／撤銷證明",
            "改由家人當承租人即可",
            "只要房客本人簽名即可",
        ],
        "ans": 1,
        "note": "常見退件：長女另地申請 300 億，需補撤銷證明或分戶後起租。",
    },
]

FONT = "ZhExam"


def _register_font() -> None:
    last_err = None
    for path, sub in _FONT_CANDIDATES:
        if not Path(path).exists():
            continue
        try:
            if sub is None:
                pdfmetrics.registerFont(TTFont(FONT, path))
            else:
                pdfmetrics.registerFont(TTFont(FONT, path, subfontIndex=sub))
            return
        except Exception as e:  # noqa: BLE001
            last_err = e
    raise RuntimeError(f"找不到可用中文字型：{last_err}")


_register_font()

C_TITLE = HexColor("#0f172a")
C_MUTED = HexColor("#475569")
C_CAT = HexColor("#4f46e5")
C_BODY = HexColor("#334155")
C_ANS = HexColor("#059669")
C_NOTE = HexColor("#64748b")
C_LINE = HexColor("#e2e8f0")


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ZhTitle",
            fontName=FONT,
            fontSize=18,
            leading=26,
            textColor=C_TITLE,
            alignment=TA_LEFT,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhIntro",
            fontName=FONT,
            fontSize=11,
            leading=18,
            textColor=C_MUTED,
            alignment=TA_LEFT,
            spaceAfter=14,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhCat",
            fontName=FONT,
            fontSize=9,
            leading=14,
            textColor=C_CAT,
            spaceBefore=4,
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhQ",
            fontName=FONT,
            fontSize=11,
            leading=18,
            textColor=C_TITLE,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhOpt",
            fontName=FONT,
            fontSize=10,
            leading=16,
            textColor=C_BODY,
            leftIndent=12,
            spaceAfter=1,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhAnsTitle",
            fontName=FONT,
            fontSize=16,
            leading=24,
            textColor=C_TITLE,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhAns",
            fontName=FONT,
            fontSize=11,
            leading=17,
            textColor=C_ANS,
            spaceBefore=4,
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhNote",
            fontName=FONT,
            fontSize=9,
            leading=14,
            textColor=C_NOTE,
            leftIndent=10,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhHeader",
            fontName=FONT,
            fontSize=9,
            leading=12,
            textColor=C_MUTED,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhFooter",
            fontName=FONT,
            fontSize=9,
            leading=12,
            textColor=HexColor("#94a3b8"),
            alignment=TA_CENTER,
        )
    )
    return styles


def on_page(canvas, doc):
    canvas.saveState()
    page = doc.page
    if page > 1:
        canvas.setStrokeColor(C_LINE)
        canvas.setLineWidth(0.5)
        y = A4[1] - 14 * mm
        canvas.line(16 * mm, y, A4[0] - 16 * mm, y)
        canvas.setFillColor(C_MUTED)
        canvas.setFont(FONT, 9)
        canvas.drawCentredString(
            A4[0] / 2,
            y + 3 * mm,
            "公會案件意見退件考題（20 題）｜避開建物／戶籍謄本",
        )
    canvas.setFillColor(HexColor("#94a3b8"))
    canvas.setFont(FONT, 9)
    canvas.drawCentredString(A4[0] / 2, 10 * mm, str(page))
    canvas.restoreState()


def main():
    styles = make_styles()
    doc = BaseDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        A4[0] - doc.leftMargin - doc.rightMargin,
        A4[1] - doc.topMargin - doc.bottomMargin,
        id="normal",
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=frame, onPage=on_page)])

    story = []
    story.append(Paragraph(esc("公會案件意見退件考題（20 題）"), styles["ZhTitle"]))
    story.append(
        Paragraph(
            esc("依據工具箱實際「案件意見」退件內容整理（115/09～115/10）。")
            + "<br/>"
            + esc("本題刻意避開建物謄本、戶籍謄本相關考點。")
            + "<br/>"
            + esc("單選題，每題 5 分，滿分 100 分。答案在最後一頁。"),
            styles["ZhIntro"],
        )
    )

    letters = "ABCD"
    for i, item in enumerate(QUESTIONS, 1):
        block = [
            Paragraph(esc(f"【{item['cat']}】"), styles["ZhCat"]),
            Paragraph(esc(f"{i}. {item['q']}"), styles["ZhQ"]),
        ]
        for j, opt in enumerate(item["opts"]):
            block.append(Paragraph(esc(f"({letters[j]}) {opt}"), styles["ZhOpt"]))
        block.append(Spacer(1, 6))
        story.append(KeepTogether(block))

    story.append(Paragraph(esc("答案與說明"), styles["ZhAnsTitle"]))
    for i, item in enumerate(QUESTIONS, 1):
        ans = item["opts"][item["ans"]]
        story.append(
            KeepTogether(
                [
                    Paragraph(
                        esc(f"{i}. 答案：({letters[item['ans']]}) {ans}"),
                        styles["ZhAns"],
                    ),
                    Paragraph(esc(f"說明：{item['note']}"), styles["ZhNote"]),
                ]
            )
        )

    doc.build(story)
    print(str(OUT))


if __name__ == "__main__":
    main()
