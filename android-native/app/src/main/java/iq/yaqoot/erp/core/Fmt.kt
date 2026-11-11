package iq.yaqoot.erp.core

import android.net.Uri
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.math.abs
import kotlin.math.roundToLong

/** تنسيق الأرقام والتواريخ بتوقيت بغداد (UTC+3 بدون توقيت صيفي) والتسميات. */
object Fmt {
    private val baghdad = ZoneOffset.ofHours(3)
    private val months = listOf("كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول")
    private val days = listOf("الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد")

    fun money(v: Any?): String {
        val n = numOf(v).roundToLong()
        val s = abs(n).toString()
        val b = StringBuilder()
        s.forEachIndexed { i, c ->
            if (i > 0 && (s.length - i) % 3 == 0) b.append(',')
            b.append(c)
        }
        return (if (n < 0) "-" else "") + b
    }

    fun iqd(v: Any?): String = "${money(v)} د.ع"

    fun parse(raw: Any?): LocalDateTime? {
        val s = raw?.toString()?.trim().orEmpty()
        if (s.isEmpty()) return null
        return try {
            if (s.length == 10) LocalDate.parse(s).atStartOfDay()
            else {
                val iso = s.replace(' ', 'T')
                val odt = try { OffsetDateTime.parse(iso) } catch (_: Exception) {
                    try { OffsetDateTime.parse("${iso}Z") } catch (_: Exception) { OffsetDateTime.parse(iso.replace(Regex("([+-]\\d\\d)$"), "$1:00")) }
                }
                odt.withOffsetSameInstant(baghdad).toLocalDateTime()
            }
        } catch (_: Exception) { null }
    }

    fun now(): LocalDateTime = Instant.now().atOffset(baghdad).toLocalDateTime()

    fun two(n: Int) = n.toString().padStart(2, '0')

    fun `when`(iso: Any?): String {
        val d = parse(iso) ?: return "—"
        val h = if (d.hour % 12 == 0) 12 else d.hour % 12
        return "${d.dayOfMonth} ${months[d.monthValue - 1]} • $h:${two(d.minute)} ${if (d.hour < 12) "ص" else "م"}"
    }

    fun dateOnly(iso: Any?): String {
        val d = parse(iso) ?: return "—"
        return "${d.dayOfMonth} ${months[d.monthValue - 1]} ${d.year}"
    }

    fun weekday(ymd: String): String = try { days[LocalDate.parse(ymd.take(10)).dayOfWeek.value - 1] } catch (_: Exception) { "" }

    fun todayLong(): String {
        val d = now()
        return "${days[d.dayOfWeek.value - 1]} ${d.dayOfMonth} ${months[d.monthValue - 1]}"
    }

    fun stamp(): String = now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))

    fun isoNow(): String = Instant.now().toString()

    val roleLabel = mapOf(
        "ADMIN" to "المدير العام", "MANAGER" to "مدير", "ACCOUNTANT" to "محاسب",
        "CASHIER" to "كاشير", "TECHNICIAN" to "فني صيانة", "DELIVERY" to "مندوب توصيل",
    )

    fun payment(v: Any?): String = mapOf("CASH" to "نقدي", "DEBT" to "آجل", "CREDIT" to "آجل", "CARD" to "بطاقة", "MIXED" to "مختلط", "PARTIAL" to "جزئي")[
        v?.toString()?.uppercase()] ?: (v?.toString() ?: "—")

    /** رقم عراقي بصيغة واتساب الدولية. */
    fun waNumber(phone: Any?): String {
        var d = phone?.toString().orEmpty().filter { it.isDigit() }
        if (d.isEmpty()) return ""
        if (d.startsWith("00")) d = d.drop(2)
        if (d.startsWith("964")) return d
        if (d.startsWith("0")) d = d.drop(1)
        return if (d.length == 10 && d.startsWith("7")) "964$d" else d
    }

    fun waLink(phone: Any?, text: String): Uri? {
        val n = waNumber(phone)
        if (n.isEmpty()) return null
        return Uri.parse("https://wa.me/$n?text=${Uri.encode(text)}")
    }

    /** يقرأ مبلغاً مكتوباً بأرقام عربية أو لاتينية مع فواصل أو نص مثل «IQD 20,000». */
    fun parseMoney(s: String): Double {
        val western = s.map { c -> if (c in '٠'..'٩') ('0' + (c - '٠')) else c }.joinToString("")
        return western.replace(Regex("[^0-9.]"), "").toDoubleOrNull() ?: 0.0
    }
}
