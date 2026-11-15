package com.ameskinder.parent.nativeapp

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.facebook.react.modules.network.CookieJarContainer
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import java.io.IOException
import java.util.concurrent.TimeUnit

interface CookieStore { fun read(): String?; fun write(value: String?) }

// RN normally replaces its CookieJar with a WebView handler. Keep the refresh
// cookie encrypted and native, including across React reloads.
class RefreshCookieJar(private val origin: HttpUrl, private val store: CookieStore) : CookieJarContainer {
  private val originPrefix = "${origin.scheme}://${origin.host}:${origin.port}\n"
  private var generation = 0L
  @Synchronized fun epoch() = generation
  fun trusted(url: HttpUrl) = url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
  fun auth(url: HttpUrl) = trusted(url) && url.encodedPath.startsWith("/api/auth/")
  private fun valid(cookie: Cookie) = cookie.name == "ames_refresh_token" && cookie.hostOnly &&
    cookie.domain == origin.host && cookie.path == "/api/auth" && cookie.httpOnly &&
    (origin.scheme != "https" || cookie.secure)
  @Synchronized fun capture(url: HttpUrl, headers: okhttp3.Headers, epoch: Long) {
    if (!auth(url) || generation != epoch) return
    Cookie.parseAll(url, headers).filter(::valid).forEach { cookie ->
      store.write(if (cookie.expiresAt > System.currentTimeMillis()) originPrefix + cookie.toString() else null)
    }
  }
  @Synchronized fun clear() { generation++; store.write(null) }
  @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> {
    if (!auth(url)) return emptyList()
    val saved = store.read() ?: return emptyList()
    // Host-only cookies serialize without Domain: retain their original origin
    // explicitly so installing a local-testing build cannot move a production cookie.
    if (!saved.startsWith(originPrefix)) { store.write(null); return emptyList() }
    val cookie = Cookie.parse(origin, saved.removePrefix(originPrefix)) ?: return emptyList()
    if (!valid(cookie) || cookie.expiresAt <= System.currentTimeMillis()) { store.write(null); return emptyList() }
    return if (cookie.matches(url)) listOf(cookie) else emptyList()
  }
  override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) = Unit
  override fun setCookieJar(cookieJar: CookieJar) = Unit
  override fun removeCookieJar() = Unit
}

class ParentHttpClientFactory(context: Context) : OkHttpClientFactory {
  init {
    val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
    val prefs = EncryptedSharedPreferences.create(context, "ames_native_refresh", key,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    jar = RefreshCookieJar(BuildConfig.AMES_API_URL.toHttpUrl(), object : CookieStore {
      override fun read() = prefs.getString("cookie", null)
      override fun write(value: String?) {
        val edit = prefs.edit()
        if (value == null) edit.remove("cookie") else edit.putString("cookie", value)
        if (!edit.commit()) throw IOException("Unable to save secure session on this device")
      }
    })
  }
  override fun createNewNetworkModuleClient(): OkHttpClient = buildParentClient(jar)
  companion object { lateinit var jar: RefreshCookieJar }
}

fun buildParentClient(jar: RefreshCookieJar): OkHttpClient = OkHttpClientProvider.createClientBuilder()
    .cookieJar(jar).cache(null).followRedirects(false).followSslRedirects(false)
    .connectTimeout(20, TimeUnit.SECONDS).readTimeout(45, TimeUnit.SECONDS).writeTimeout(30, TimeUnit.SECONDS)
    .addInterceptor { chain ->
      val original = chain.request()
      val epoch = jar.epoch()
      val request = if (jar.auth(original.url)) original.newBuilder()
        .header("Origin", "https://ameskinder.com").header("Referer", "https://ameskinder.com/").build() else original
      val response = chain.proceed(request)
      try {
        jar.capture(request.url, response.headers, epoch)
        if (jar.auth(request.url) && request.url.encodedPath == "/api/auth/logout" && response.isSuccessful) jar.clear()
      } catch (error: Exception) { response.close(); throw IOException("Secure session storage failed", error) }
      response.newBuilder().removeHeader("Set-Cookie").build()
    }.build()
