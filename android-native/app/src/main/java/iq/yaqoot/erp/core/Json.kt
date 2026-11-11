package iq.yaqoot.erp.core

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

/** كائن JSON مقروء كخريطة عادية. */
typealias J = Map<String, Any?>

object Json {
    fun parse(text: String): Any? = unwrap(JSONTokener(text).nextValue())

    fun unwrap(v: Any?): Any? = when (v) {
        is JSONObject -> v.keys().asSequence().associateWith { unwrap(v.opt(it)) }
        is JSONArray -> (0 until v.length()).map { unwrap(v.opt(it)) }
        JSONObject.NULL -> null
        else -> v
    }

    fun wrap(v: Any?): Any? = when (v) {
        null -> JSONObject.NULL
        is Map<*, *> -> JSONObject().also { o -> v.forEach { (k, x) -> o.put(k.toString(), wrap(x)) } }
        is List<*> -> JSONArray().also { a -> v.forEach { a.put(wrap(it)) } }
        is Set<*> -> JSONArray().also { a -> v.forEach { a.put(wrap(it)) } }
        else -> v
    }

    fun stringify(v: Any?): String = wrap(v).toString()
}

// ---------------------------------------------------------------- قراءة آمنة للحقول
fun J?.s(key: String): String = when (val v = this?.get(key)) {
    null -> ""
    is Double -> if (v % 1.0 == 0.0) v.toLong().toString() else v.toString()
    else -> v.toString()
}

fun J?.sOrNull(key: String): String? = this?.get(key)?.let { s(key) }?.takeIf { it.isNotEmpty() }

fun J?.n(key: String): Double = numOf(this?.get(key))

fun J?.i(key: String): Int? = this?.get(key)?.let { v -> (v as? Number)?.toInt() ?: v.toString().toDoubleOrNull()?.toInt() }

fun J?.b(key: String): Boolean = when (val v = this?.get(key)) {
    is Boolean -> v
    is Number -> v.toInt() != 0
    is String -> v == "true" || v == "1"
    else -> false
}

@Suppress("UNCHECKED_CAST")
fun J?.o(key: String): J? = this?.get(key) as? J

@Suppress("UNCHECKED_CAST")
fun J?.l(key: String): List<J> = (this?.get(key) as? List<*>)?.filterIsInstance<Map<*, *>>()?.map { it as J } ?: emptyList()

fun J?.has(key: String): Boolean = this?.get(key) != null

fun numOf(v: Any?): Double = when (v) {
    is Number -> v.toDouble()
    is String -> v.toDoubleOrNull() ?: 0.0
    else -> 0.0
}
