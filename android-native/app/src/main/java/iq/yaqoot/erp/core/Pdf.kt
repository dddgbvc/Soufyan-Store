package iq.yaqoot.erp.core

import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.text.Layout
import android.text.StaticLayout
import android.text.TextDirectionHeuristics
import android.text.TextPaint
import androidx.core.content.FileProvider
import androidx.core.content.res.ResourcesCompat
import iq.yaqoot.erp.R
import java.io.File

/** قسم من التقرير: جدول نصي. */
data class ReportPart(val title: String, val header: List<String>, val rows: List<List<String>>)

/**
 * تقارير PDF بأداة أندرويد الرسمية (android.graphics.pdf.PdfDocument):
 * صفحات A4 حقيقية متعددة، نص عربي متجهي من اليمين لليسار بخط Cairo، ورأس الجدول يتكرر في كل صفحة.
 */
object Pdf {
    private const val W = 595
    private const val H = 842
    private const val M = 36f
    private const val PAD = 5f
    private val NAVY = Color.rgb(0x14, 0x34, 0x3F)
    private val GOLD = Color.rgb(0xC8, 0xA9, 0x69)
    private val CREAM = Color.rgb(0xF1, 0xED, 0xE4)
    private val GRAY = Color.rgb(0x6B, 0x6B, 0x6B)
    private val LINE = Color.rgb(0xD5, 0xD5, 0xD5)
    private val STRIPE = Color.rgb(0xF6, 0xF6, 0xF6)

    fun share(context: Context, title: String, fileName: String, parts: List<ReportPart>, subtitle: String? = null) {
        val regular = ResourcesCompat.getFont(context, R.font.cairo_regular) ?: Typeface.DEFAULT
        val bold = ResourcesCompat.getFont(context, R.font.cairo_bold) ?: Typeface.DEFAULT_BOLD
        val doc = PdfDocument()
        val w = Writer(doc, regular, bold)
        w.newPage()
        w.header(title, subtitle)
        for (p in parts) w.part(p)
        w.y += 10
        w.text("أُنشئ من تطبيق متابعة مكتب سفيان للموبايل", 8f, GRAY, regular, W - 2 * M)
        w.finish()

        val dir = File(context.cacheDir, "reports").apply { mkdirs() }
        val safe = fileName.replace(Regex("[\\\\/:*?\"<>|]"), "-")
        val file = File(dir, "$safe.pdf")
        file.outputStream().use { doc.writeTo(it) }
        doc.close()

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(send, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private class Writer(val doc: PdfDocument, val regular: Typeface, val bold: Typeface) {
        var page: PdfDocument.Page? = null
        var canvas: Canvas? = null
        var y = 0f
        var n = 0
        val content = W - 2 * M
        val bottom = H - M - 24f

        fun newPage() {
            page?.let { doc.finishPage(it) }
            n++
            page = doc.startPage(PdfDocument.PageInfo.Builder(W, H, n).create())
            canvas = page!!.canvas
            y = M
            val p = paint(8f, GRAY, regular)
            val l = layout("صفحة $n", p, content, Layout.Alignment.ALIGN_CENTER)
            canvas!!.save(); canvas!!.translate(M, H - M - 10f); l.draw(canvas!!); canvas!!.restore()
        }

        fun finish() { page?.let { doc.finishPage(it) }; page = null }

        fun paint(size: Float, color: Int, tf: Typeface) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textSize = size; this.color = color; typeface = tf }

        fun layout(s: String, p: TextPaint, width: Float, align: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL): StaticLayout =
            StaticLayout.Builder.obtain(s, 0, s.length, p, width.toInt().coerceAtLeast(1))
                .setAlignment(align)
                .setTextDirection(TextDirectionHeuristics.FIRSTSTRONG_RTL)
                .setIncludePad(false)
                .build()

        /** يرسم نصاً عند الموضع الحالي (من اليمين) ويتقدم للأسفل. */
        fun text(s: String, size: Float, color: Int, tf: Typeface, width: Float, x: Float = M) {
            val l = layout(s, paint(size, color, tf), width)
            canvas!!.save(); canvas!!.translate(x, y); l.draw(canvas!!); canvas!!.restore()
            y += l.height
        }

        fun ensure(h: Float) { if (y + h > bottom) newPage() }

        fun header(title: String, subtitle: String?) {
            val c = canvas!!
            val logo = 44f
            val lx = W - M - logo
            drawLogo(c, RectF(lx, y, lx + logo, y + logo))
            val tw = content - logo - 12f
            val top = y
            text(title, 20f, NAVY, bold, tw)
            val store = AppState.storeName.ifEmpty { "مكتب سفيان للموبايل" }
            text("$store • ${Fmt.`when`(Fmt.isoNow())}", 10f, GRAY, regular, tw)
            if (!subtitle.isNullOrEmpty()) text(subtitle, 10f, GRAY, regular, tw)
            y = maxOf(y, top + logo) + 10f
            c.drawRect(M, y, W - M, y + 1.5f, Paint().apply { color = NAVY })
            y += 14f
        }

        fun drawLogo(c: Canvas, r: RectF) {
            c.drawRoundRect(r, r.width() * 0.27f, r.width() * 0.27f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = NAVY })
            val bw = r.width() * 0.101f
            val gap = r.width() * 0.155f
            val total = bw * 3 + (gap - bw) * 2
            var x = r.centerX() - total / 2
            val base = r.centerY() + r.height() * 0.18f
            listOf(0.185f, 0.272f, 0.36f).forEachIndexed { i, h ->
                val bh = h * r.height()
                c.drawRoundRect(RectF(x, base - bh, x + bw, base), bw / 2, bw / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = if (i < 2) CREAM else GOLD })
                x += gap
            }
        }

        fun part(p: ReportPart) {
            val cols = maxOf(p.header.size, p.rows.maxOfOrNull { it.size } ?: 0, 1)
            val colW = content / cols
            ensure(60f)
            text("${p.title} (${p.rows.size})", 13f, NAVY, bold, content)
            y += 5f
            headerRow(p.header, cols, colW)
            if (p.rows.isEmpty()) {
                text("لا يوجد", 9f, GRAY, regular, content)
                y += 10f
            }
            p.rows.forEachIndexed { i, row ->
                val h = rowHeight(row, cols, colW, regular)
                if (y + h > bottom) {
                    newPage()
                    headerRow(p.header, cols, colW)
                }
                if (i % 2 == 1) canvas!!.drawRect(M, y, W - M, y + h, Paint().apply { color = STRIPE })
                cells(row, cols, colW, h, Color.BLACK, regular)
                canvas!!.drawRect(M, y + h - 0.5f, W - M, y + h, Paint().apply { color = LINE })
                y += h
            }
            y += 18f
        }

        fun headerRow(header: List<String>, cols: Int, colW: Float) {
            if (header.isEmpty()) return
            val h = rowHeight(header, cols, colW, bold)
            canvas!!.drawRect(M, y, W - M, y + h, Paint().apply { color = Color.rgb(0xE8, 0xEC, 0xEE) })
            cells(header, cols, colW, h, NAVY, bold)
            canvas!!.drawRect(M, y + h - 0.8f, W - M, y + h, Paint().apply { color = NAVY })
            y += h
        }

        /** الخلايا من اليمين لليسار: العمود الأول في أقصى اليمين. */
        fun cells(cells: List<String>, cols: Int, colW: Float, h: Float, color: Int, tf: Typeface) {
            for (i in 0 until cols) {
                val s = cells.getOrElse(i) { "" }
                val x = M + content - colW * (i + 1)
                val l = layout(s, paint(9f, color, tf), colW - 2 * PAD)
                canvas!!.save(); canvas!!.translate(x + PAD, y + PAD); l.draw(canvas!!); canvas!!.restore()
            }
        }

        fun rowHeight(cells: List<String>, cols: Int, colW: Float, tf: Typeface): Float {
            var h = 0f
            for (i in 0 until minOf(cols, cells.size)) h = maxOf(h, layout(cells[i], paint(9f, Color.BLACK, tf), colW - 2 * PAD).height.toFloat())
            return maxOf(h, 13f) + 2 * PAD
        }
    }
}
